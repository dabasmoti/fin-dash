import express, { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type {
  ApiResponse,
  BankScraperData,
  CashFlowProjection,
  RecurringPatternInput,
  RecurringFrequency,
  RecurringDirection,
  StoredRecurringPattern,
} from '../types.js';
import { getConfiguredBanks } from '../config/credentials.js';
import { isSupportedBankId, BANK_REGISTRY } from '../config/bank-registry.js';
import {
  scrapeSingleBank,
  scrapeAllBanks,
  getCacheStatus,
  clearCache,
} from '../services/scraper-service.js';
import { schedulerService } from '../services/scheduler-service.js';
import { databaseService } from '../services/db-service.js';
import { detectRecurringPatterns } from '../services/recurring-detection-service.js';
import { generateCashFlowProjection, getUpcomingCardBillings } from '../services/cashflow-service.js';
import type { UpcomingCardBilling } from '../services/cashflow-service.js';

const router = Router();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCRAPE_REQUEST_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Middleware that extends the default request timeout for long-running
 * scrape endpoints (Puppeteer can be slow).
 */
function extendRequestTimeout(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  req.setTimeout(SCRAPE_REQUEST_TIMEOUT_MS);
  next();
}

// ---------------------------------------------------------------------------
// GET /api/health
// ---------------------------------------------------------------------------
router.get('/api/health', async (req: Request, res: Response) => {
  // Public: return minimal info. Authenticated: return full details.
  const authHeader = req.headers.authorization?.replace('Bearer ', '');
  const cookieToken = req.cookies?.auth_token as string | undefined;
  const hasAuth = !!(authHeader || cookieToken);

  if (!hasAuth) {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
    return;
  }

  const configuredBanks = getConfiguredBanks();
  const cacheStatus = getCacheStatus();
  const schedulerStatus = schedulerService.getStatus();

  let databaseStats = null;
  try {
    databaseStats = databaseService.getStats();
  } catch {
    // Database may not be initialized in some edge cases
  }

  let lastDbSync = null;
  try {
    const { gcsBackupService } = await import('../services/gcs-backup.js');
    lastDbSync = await gcsBackupService.getLastUpdated();
  } catch { /* ignore */ }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    configuredBanks,
    cacheStatus,
    scheduler: schedulerStatus,
    database: databaseStats,
    lastDbSync,
  });
});

// ---------------------------------------------------------------------------
// GET /api/scrape/all
// IMPORTANT: registered BEFORE /api/scrape/:bankId so "all" is not captured
// as a bankId parameter.
// ---------------------------------------------------------------------------
router.get(
  '/api/scrape/all',
  extendRequestTimeout,
  async (
    req: Request,
    res: Response<ApiResponse<BankScraperData[]> & { cached?: Record<string, { cached: boolean; ageMs?: number }>; totalDurationMs?: number }>,
    next: NextFunction,
  ) => {
    try {
      const fresh = req.query.fresh === 'true';
      const startTime = Date.now();

      const data = await scrapeAllBanks({ fresh });
      const totalDurationMs = Date.now() - startTime;
      const cached = getCacheStatus();

      res.json({
        success: true,
        data,
        cached,
        totalDurationMs,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/scrape/:bankId
// ---------------------------------------------------------------------------
router.get(
  '/api/scrape/:bankId',
  extendRequestTimeout,
  async (
    req: Request<{ bankId: string }>,
    res: Response<ApiResponse<BankScraperData> & { cached?: boolean; scrapeDurationMs?: number }>,
    next: NextFunction,
  ) => {
    try {
      const { bankId } = req.params;

      if (!isSupportedBankId(bankId)) {
        res.status(400).json({
          success: false,
          error: `Unsupported bank ID: "${bankId}". Supported: ${Object.keys(BANK_REGISTRY).join(', ')}`,
        });
        return;
      }

      const fresh = req.query.fresh === 'true';
      const wasCachedBefore = getCacheStatus()[bankId]?.cached ?? false;
      const startTime = Date.now();

      const data = await scrapeSingleBank(bankId, { fresh });
      const scrapeDurationMs = Date.now() - startTime;

      // If it was cached before and we did not request fresh, it came from cache
      const servedFromCache = !fresh && wasCachedBefore;

      res.json({
        success: data.result.success,
        data,
        cached: servedFromCache,
        scrapeDurationMs,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/cache/clear
// ---------------------------------------------------------------------------
router.get('/api/cache/clear', (_req: Request, res: Response) => {
  clearCache();
  res.json({
    success: true,
    message: 'Cache cleared',
  });
});

// ---------------------------------------------------------------------------
// GET /api/scheduler/status
// ---------------------------------------------------------------------------
router.get('/api/scheduler/status', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: schedulerService.getStatus(),
  });
});

// ---------------------------------------------------------------------------
// POST /api/scheduler/trigger
// ---------------------------------------------------------------------------
router.post(
  '/api/scheduler/trigger',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const triggered = await schedulerService.trigger();

      if (!triggered) {
        res.status(409).json({
          success: false,
          error: 'A scrape is already in progress',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Scrape triggered successfully',
        data: schedulerService.getStatus(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/transactions
// ---------------------------------------------------------------------------
router.get(
  '/api/transactions',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = {
        bankId: req.query.bankId as string | undefined,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        status: req.query.status as string | undefined,
        category: req.query.category as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
      };

      const transactions = databaseService.queryTransactions(filters);

      res.json({
        success: true,
        data: transactions,
        count: transactions.length,
        filters,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/accounts
// ---------------------------------------------------------------------------
router.get('/api/accounts', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const accounts = databaseService.getAccounts();

    res.json({
      success: true,
      data: accounts,
      count: accounts.length,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/scrape-history
// ---------------------------------------------------------------------------
router.get(
  '/api/scrape-history',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = {
        bankId: req.query.bankId as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
      };

      const history = databaseService.getScrapeHistory(filters);

      res.json({
        success: true,
        data: history,
        count: history.length,
        filters,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Recurring patterns & cashflow projection
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Constants for input validation
// ---------------------------------------------------------------------------

const VALID_FREQUENCIES: RecurringFrequency[] = ['monthly', 'bimonthly', 'quarterly'];
const VALID_DIRECTIONS: RecurringDirection[] = ['income', 'expense'];
const MIN_TYPICAL_DAY = 1;
const MAX_TYPICAL_DAY = 31;

// ---------------------------------------------------------------------------
// GET /api/recurring-patterns
// Runs detection algorithm and returns all recurring patterns.
// ---------------------------------------------------------------------------
router.get(
  '/api/recurring-patterns',
  (_req: Request, res: Response<ApiResponse<StoredRecurringPattern[]>>, next: NextFunction) => {
    try {
      const patterns = detectRecurringPatterns();

      res.json({
        success: true,
        data: patterns,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/recurring-patterns/:id/confirm
// Marks a detected recurring pattern as user-confirmed.
// ---------------------------------------------------------------------------
router.post(
  '/api/recurring-patterns/:id/confirm',
  (req: Request<{ id: string }>, res: Response<ApiResponse<null>>, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id, 10);

      if (Number.isNaN(id) || id <= 0) {
        res.status(400).json({
          success: false,
          error: 'Invalid pattern ID. Must be a positive integer.',
        });
        return;
      }

      const updated = databaseService.confirmRecurringPattern(id);

      if (!updated) {
        res.status(404).json({
          success: false,
          error: `Recurring pattern with ID ${id} not found.`,
        });
        return;
      }

      res.json({
        success: true,
        message: `Pattern ${id} confirmed.`,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/recurring-patterns
// Manually adds or updates a recurring pattern.
// ---------------------------------------------------------------------------
router.post(
  '/api/recurring-patterns',
  (req: Request, res: Response<ApiResponse<null>>, next: NextFunction) => {
    try {
      const body = req.body as Partial<RecurringPatternInput>;

      // Validate required fields
      const validationErrors: string[] = [];

      if (!body.description || typeof body.description !== 'string' || body.description.trim().length === 0) {
        validationErrors.push('description is required and must be a non-empty string');
      }

      if (!body.bankId || typeof body.bankId !== 'string') {
        validationErrors.push('bankId is required');
      }

      if (!body.accountNumber || typeof body.accountNumber !== 'string') {
        validationErrors.push('accountNumber is required');
      }

      if (body.amount == null || typeof body.amount !== 'number' || body.amount <= 0) {
        validationErrors.push('amount is required and must be a positive number');
      }

      if (!body.frequency || !VALID_FREQUENCIES.includes(body.frequency)) {
        validationErrors.push(`frequency is required and must be one of: ${VALID_FREQUENCIES.join(', ')}`);
      }

      if (!body.direction || !VALID_DIRECTIONS.includes(body.direction)) {
        validationErrors.push(`direction is required and must be one of: ${VALID_DIRECTIONS.join(', ')}`);
      }

      if (body.typicalDay != null) {
        if (
          typeof body.typicalDay !== 'number' ||
          !Number.isInteger(body.typicalDay) ||
          body.typicalDay < MIN_TYPICAL_DAY ||
          body.typicalDay > MAX_TYPICAL_DAY
        ) {
          validationErrors.push(`typicalDay must be an integer between ${MIN_TYPICAL_DAY} and ${MAX_TYPICAL_DAY}`);
        }
      }

      if (validationErrors.length > 0) {
        res.status(400).json({
          success: false,
          error: validationErrors.join('; '),
        });
        return;
      }

      // All fields validated; cast is safe
      const input = body as RecurringPatternInput;

      const normalizedDesc = input.description.trim().toLowerCase().replace(/\s+/g, ' ');

      databaseService.upsertRecurringPattern({
        description: input.description.trim(),
        normalizedDesc,
        bankId: input.bankId,
        accountNumber: input.accountNumber,
        category: input.category ?? null,
        avgAmount: input.amount,
        amountVariance: 0,
        frequency: input.frequency,
        typicalDay: input.typicalDay ?? null,
        direction: input.direction,
        occurrenceCount: 1,
        lastSeen: new Date().toISOString(),
        userConfirmed: true,
      });

      res.json({
        success: true,
        message: 'Recurring pattern saved.',
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/cashflow/projection
// Generates a daily cash-flow projection for the requested number of months.
// ---------------------------------------------------------------------------
router.get(
  '/api/cashflow/projection',
  (_req: Request, res: Response<ApiResponse<CashFlowProjection>>, next: NextFunction) => {
    try {
      const monthsParam = _req.query.months as string | undefined;
      const months = monthsParam ? parseInt(monthsParam, 10) : undefined;

      if (monthsParam && (Number.isNaN(months) || (months != null && months <= 0))) {
        res.status(400).json({
          success: false,
          error: 'months must be a positive integer',
        });
        return;
      }

      const monthsBackParam = _req.query.monthsBack as string | undefined;
      const monthsBack = monthsBackParam ? parseInt(monthsBackParam, 10) : undefined;
      const MAX_MONTHS_BACK = 12;
      const DEFAULT_MONTHS_BACK = 2;

      if (monthsBackParam && (Number.isNaN(monthsBack) || (monthsBack != null && monthsBack <= 0))) {
        res.status(400).json({
          success: false,
          error: 'monthsBack must be a positive integer',
        });
        return;
      }

      const clampedMonthsBack = monthsBack
        ? Math.min(monthsBack, MAX_MONTHS_BACK)
        : DEFAULT_MONTHS_BACK;

      const projection = generateCashFlowProjection(months, clampedMonthsBack);

      res.json({
        success: true,
        data: projection,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/upcoming-billings
// ---------------------------------------------------------------------------
router.get(
  '/api/upcoming-billings',
  (_req: Request, res: Response<ApiResponse<UpcomingCardBilling[]>>, next: NextFunction) => {
    try {
      const billings = getUpcomingCardBillings();
      res.json({ success: true, data: billings });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Category rules (user-defined description -> category mappings)
// ---------------------------------------------------------------------------

router.get(
  '/api/category-rules',
  (_req: Request, res: Response<ApiResponse<Array<{ description: string; category_id: string }>>>, next: NextFunction) => {
    try {
      const rules = databaseService.getCategoryRules();
      res.json({ success: true, data: rules });
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/api/category-rules',
  (req: Request, res: Response<ApiResponse<null>>, next: NextFunction) => {
    try {
      const { description, categoryId } = req.body as { description?: string; categoryId?: string };

      if (!description || typeof description !== 'string' || description.trim().length === 0) {
        res.status(400).json({ success: false, error: 'description is required' });
        return;
      }
      if (!categoryId || typeof categoryId !== 'string' || categoryId.trim().length === 0) {
        res.status(400).json({ success: false, error: 'categoryId is required' });
        return;
      }

      databaseService.upsertCategoryRule(description.trim(), categoryId.trim());
      const updated = databaseService.applyCategoryRules();

      res.json({
        success: true,
        message: `Rule saved. ${updated} existing transaction(s) updated.`,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/api/category-rules/:description',
  (req: Request<{ description: string }>, res: Response<ApiResponse<null>>, next: NextFunction) => {
    try {
      const description = req.params.description;
      databaseService.deleteCategoryRule(description);
      res.json({ success: true, message: 'Rule deleted.' });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/data/all
// Returns all bank data from the database (no live scraping).
// Builds the same BankScraperData[] structure the frontend expects.
// ---------------------------------------------------------------------------
router.get(
  '/api/data/all',
  (_req: Request, res: Response, next: NextFunction) => {
    try {
      const accounts = databaseService.getAccounts();
      const transactions = databaseService.queryTransactions({});

      // Group transactions by bankId + accountNumber
      const bankMap = new Map<string, {
        bankId: string;
        accounts: Map<string, { accountNumber: string; balance: number | null; txns: unknown[] }>;
      }>();

      for (const account of accounts) {
        if (!bankMap.has(account.bank_id)) {
          bankMap.set(account.bank_id, { bankId: account.bank_id, accounts: new Map() });
        }
        const bank = bankMap.get(account.bank_id)!;
        bank.accounts.set(account.account_number, {
          accountNumber: account.account_number,
          balance: account.balance,
          txns: [],
        });
      }

      for (const txn of transactions) {
        const bank = bankMap.get(txn.bank_id);
        if (!bank) continue;
        let account = bank.accounts.get(txn.account_number);
        if (!account) {
          account = { accountNumber: txn.account_number, balance: null, txns: [] };
          bank.accounts.set(txn.account_number, account);
        }
        account.txns.push({
          type: txn.type || 'normal',
          identifier: txn.id,
          date: txn.date,
          processedDate: txn.processed_date,
          originalAmount: txn.original_amount,
          originalCurrency: txn.original_currency || 'ILS',
          chargedAmount: txn.charged_amount,
          chargedCurrency: txn.charged_currency,
          description: txn.description,
          memo: txn.memo || '',
          status: txn.status || 'completed',
          installments: txn.installment_number && txn.installment_total
            ? { number: txn.installment_number, total: txn.installment_total }
            : undefined,
          category: txn.category,
        });
      }

      const data = Array.from(bankMap.values()).map((bank) => ({
        bankId: bank.bankId,
        result: {
          success: true,
          accounts: Array.from(bank.accounts.values()),
        },
      }));

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/db/upload
// Accepts a raw SQLite database file and replaces the current one.
// Used by the local scrape-and-upload script to sync data to Cloud Run.
// ---------------------------------------------------------------------------
router.post(
  '/api/db/upload',
  express.raw({ type: 'application/octet-stream', limit: '50mb' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = req.body as Buffer;
      if (!data || data.length === 0) {
        res.status(400).json({ success: false, error: 'Empty body' });
        return;
      }

      // Validate SQLite magic bytes: first 16 bytes must be "SQLite format 3\0"
      const SQLITE_MAGIC = 'SQLite format 3\0';
      const header = data.subarray(0, 16).toString('ascii');
      if (header !== SQLITE_MAGIC) {
        res.status(400).json({ success: false, error: 'Invalid file format' });
        return;
      }

      const dbPath = process.env.DB_PATH || 'data/fin-dash.db';

      // Close current DB, write new file, re-init
      databaseService.close();

      const fs = await import('node:fs');
      const path = await import('node:path');
      const dir = path.dirname(dbPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(dbPath, data);

      // Remove stale WAL/SHM files
      try { fs.unlinkSync(`${dbPath}-wal`); } catch { /* ignore */ }
      try { fs.unlinkSync(`${dbPath}-shm`); } catch { /* ignore */ }

      databaseService.init();

      // Persist to GCS so cold starts have the latest data
      const { gcsBackupService } = await import('../services/gcs-backup.js');
      await gcsBackupService.uploadDb();

      console.log(`[db-upload] Received, loaded, and backed up database (${data.length} bytes)`);

      res.json({
        success: true,
        message: `Database replaced and backed up (${data.length} bytes)`,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
