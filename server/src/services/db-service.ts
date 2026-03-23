// ---------------------------------------------------------------------------
// SQLite persistence layer using better-sqlite3
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type BetterSqlite3 from 'better-sqlite3';

import type {
  BankScraperData,
  StoredTransaction,
  StoredAccount,
  ScrapeRunRecord,
  StoredRecurringPattern,
  TransactionFilters,
  ScrapeHistoryFilters,
  DatabaseStats,
} from '../types.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_DB_PATH = path.resolve(
  process.cwd(),
  'data',
  'fin-dash.db',
);

const DB_PATH = process.env.DB_PATH || DEFAULT_DB_PATH;

const BUSY_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------
// DatabaseService
// ---------------------------------------------------------------------------

export class DatabaseService {
  private db: BetterSqlite3.Database | null = null;
  private dbPath: string;

  constructor(dbPath: string = DB_PATH) {
    this.dbPath = dbPath;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Opens the database, enables WAL mode, sets pragmas, and creates tables
   * and indexes if they do not already exist.
   */
  init(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
    this.db.pragma('synchronous = NORMAL');

    this.createTables();
    this.createIndexes();
    this.runMigrations();

    console.log(`[db-service] Database initialized at ${this.dbPath}`);
  }

  /**
   * Closes the database connection for graceful shutdown.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('[db-service] Database connection closed');
    }
  }

  // -------------------------------------------------------------------------
  // Schema
  // -------------------------------------------------------------------------

  private createTables(): void {
    this.getDb().exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        id                INTEGER PRIMARY KEY,
        bank_id           TEXT NOT NULL,
        account_number    TEXT NOT NULL,
        type              TEXT NOT NULL,
        identifier        TEXT,
        date              TEXT NOT NULL,
        processed_date    TEXT NOT NULL,
        original_amount   REAL NOT NULL,
        original_currency TEXT DEFAULT 'ILS',
        charged_amount    REAL NOT NULL,
        charged_currency  TEXT,
        description       TEXT NOT NULL,
        memo              TEXT,
        status            TEXT NOT NULL,
        installment_number INTEGER,
        installment_total  INTEGER,
        category          TEXT,
        scrape_timestamp  TEXT DEFAULT (datetime('now')),
        created_at        TEXT DEFAULT (datetime('now')),
        UNIQUE(bank_id, account_number, date, processed_date, original_amount, description)
      );

      CREATE TABLE IF NOT EXISTS accounts (
        id              INTEGER PRIMARY KEY,
        bank_id         TEXT NOT NULL,
        account_number  TEXT NOT NULL,
        balance         REAL,
        last_updated    TEXT DEFAULT (datetime('now')),
        UNIQUE(bank_id, account_number)
      );

      CREATE TABLE IF NOT EXISTS scrape_runs (
        id                INTEGER PRIMARY KEY,
        bank_id           TEXT NOT NULL,
        started_at        TEXT NOT NULL,
        completed_at      TEXT,
        success           INTEGER DEFAULT 0,
        error_type        TEXT,
        error_message     TEXT,
        transaction_count INTEGER DEFAULT 0,
        trigger_type      TEXT DEFAULT 'scheduled'
      );

      CREATE TABLE IF NOT EXISTS recurring_patterns (
        id                INTEGER PRIMARY KEY,
        description       TEXT NOT NULL,
        normalized_desc   TEXT NOT NULL,
        bank_id           TEXT NOT NULL,
        account_number    TEXT NOT NULL,
        category          TEXT,
        avg_amount        REAL NOT NULL,
        amount_variance   REAL NOT NULL DEFAULT 0,
        frequency         TEXT NOT NULL,
        typical_day       INTEGER,
        direction         TEXT NOT NULL,
        occurrence_count  INTEGER NOT NULL,
        last_seen         TEXT NOT NULL,
        is_active         INTEGER DEFAULT 1,
        user_confirmed    INTEGER DEFAULT 0,
        created_at        TEXT DEFAULT (datetime('now')),
        updated_at        TEXT DEFAULT (datetime('now')),
        UNIQUE(normalized_desc, bank_id, account_number)
      );

      CREATE TABLE IF NOT EXISTS category_rules (
        id          INTEGER PRIMARY KEY,
        description TEXT NOT NULL UNIQUE,
        category_id TEXT NOT NULL,
        created_at  TEXT DEFAULT (datetime('now')),
        updated_at  TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  private createIndexes(): void {
    this.getDb().exec(`
      CREATE INDEX IF NOT EXISTS idx_transactions_bank_id ON transactions(bank_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_date    ON transactions(date);
      CREATE INDEX IF NOT EXISTS idx_transactions_status  ON transactions(status);
      CREATE INDEX IF NOT EXISTS idx_recurring_active     ON recurring_patterns(is_active);
      CREATE INDEX IF NOT EXISTS idx_category_rules_desc ON category_rules(description);
    `);
  }

  private runMigrations(): void {
    const db = this.getDb();
    const columns = db.pragma('table_info(recurring_patterns)') as Array<{ name: string }>;
    const hasVariance = columns.some((col) => col.name === 'amount_variance');
    if (!hasVariance) {
      db.exec('ALTER TABLE recurring_patterns ADD COLUMN amount_variance REAL NOT NULL DEFAULT 0');
      console.log('[db-service] Migration: added amount_variance column to recurring_patterns');
    }
  }

  // -------------------------------------------------------------------------
  // High-level persistence
  // -------------------------------------------------------------------------

  /**
   * Persists a complete scrape result: upserts accounts and transactions,
   * and records the scrape run. Wrapped in a single database transaction
   * for atomicity.
   */
  persistScrapeResult(
    scraperData: BankScraperData,
    triggerType: string = 'scheduled',
  ): void {
    const { bankId, result } = scraperData;
    const startedAt = new Date().toISOString();

    if (!result.success) {
      this.recordScrapeRun(
        bankId,
        false,
        { errorType: result.errorType, errorMessage: result.errorMessage },
        0,
        triggerType,
      );
      return;
    }

    const db = this.getDb();
    const runInTransaction = db.transaction(() => {
      let totalTransactionCount = 0;

      for (const account of result.accounts) {
        this.upsertAccount(bankId, account.accountNumber, account.balance);
        this.upsertTransactions(bankId, account.accountNumber, account.txns);
        totalTransactionCount += account.txns.length;
      }

      this.recordScrapeRun(bankId, true, null, totalTransactionCount, triggerType);

      console.log(
        `[db-service] Persisted ${totalTransactionCount} transactions ` +
          `across ${result.accounts.length} accounts for "${bankId}"`,
      );
    });

    runInTransaction();
  }

  // -------------------------------------------------------------------------
  // Upsert operations
  // -------------------------------------------------------------------------

  /**
   * Upserts transactions using INSERT OR REPLACE on the unique constraint.
   * Existing rows matching the unique key are updated with fresh data.
   */
  upsertTransactions(
    bankId: string,
    accountNumber: string,
    transactions: BankScraperData['result']['accounts'][number]['txns'],
  ): void {
    const stmt = this.getDb().prepare(`
      INSERT INTO transactions (
        bank_id, account_number, type, identifier, date, processed_date,
        original_amount, original_currency, charged_amount, charged_currency,
        description, memo, status, installment_number, installment_total,
        category, scrape_timestamp
      ) VALUES (
        @bank_id, @account_number, @type, @identifier, @date, @processed_date,
        @original_amount, @original_currency, @charged_amount, @charged_currency,
        @description, @memo, @status, @installment_number, @installment_total,
        @category, datetime('now')
      )
      ON CONFLICT(bank_id, account_number, date, processed_date, original_amount, description)
      DO UPDATE SET
        type              = excluded.type,
        identifier        = excluded.identifier,
        original_currency = excluded.original_currency,
        charged_amount    = excluded.charged_amount,
        charged_currency  = excluded.charged_currency,
        memo              = excluded.memo,
        status            = excluded.status,
        installment_number = excluded.installment_number,
        installment_total  = excluded.installment_total,
        category          = COALESCE(
          (SELECT category_id FROM category_rules WHERE description = excluded.description),
          excluded.category
        ),
        scrape_timestamp  = excluded.scrape_timestamp
    `);

    for (const txn of transactions) {
      stmt.run({
        bank_id: bankId,
        account_number: accountNumber,
        type: txn.type,
        identifier: txn.identifier != null ? String(txn.identifier) : null,
        date: txn.date,
        processed_date: txn.processedDate,
        original_amount: txn.originalAmount,
        original_currency: txn.originalCurrency ?? 'ILS',
        charged_amount: txn.chargedAmount,
        charged_currency: txn.chargedCurrency ?? null,
        description: txn.description,
        memo: txn.memo ?? null,
        status: txn.status,
        installment_number: txn.installments?.number ?? null,
        installment_total: txn.installments?.total ?? null,
        category: txn.category ?? null,
      });
    }
  }

  /**
   * Upserts an account record. On conflict, updates balance and last_updated.
   */
  upsertAccount(
    bankId: string,
    accountNumber: string,
    balance?: number,
  ): void {
    this.getDb()
      .prepare(
        `
      INSERT INTO accounts (bank_id, account_number, balance, last_updated)
      VALUES (@bank_id, @account_number, @balance, datetime('now'))
      ON CONFLICT(bank_id, account_number)
      DO UPDATE SET
        balance      = excluded.balance,
        last_updated = excluded.last_updated
    `,
      )
      .run({
        bank_id: bankId,
        account_number: accountNumber,
        balance: balance ?? null,
      });
  }

  /**
   * Records a scrape run entry in the audit log.
   */
  recordScrapeRun(
    bankId: string,
    success: boolean,
    error: { errorType?: string; errorMessage?: string } | null,
    transactionCount: number,
    triggerType: string,
  ): void {
    const now = new Date().toISOString();

    this.getDb()
      .prepare(
        `
      INSERT INTO scrape_runs (
        bank_id, started_at, completed_at, success,
        error_type, error_message, transaction_count, trigger_type
      ) VALUES (
        @bank_id, @started_at, @completed_at, @success,
        @error_type, @error_message, @transaction_count, @trigger_type
      )
    `,
      )
      .run({
        bank_id: bankId,
        started_at: now,
        completed_at: now,
        success: success ? 1 : 0,
        error_type: error?.errorType ?? null,
        error_message: error?.errorMessage ?? null,
        transaction_count: transactionCount,
        trigger_type: triggerType,
      });
  }

  // -------------------------------------------------------------------------
  // Query operations
  // -------------------------------------------------------------------------

  /**
   * Queries transactions with optional filters for bank, date range, status,
   * category, and pagination.
   */
  queryTransactions(filters?: TransactionFilters): StoredTransaction[] {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (filters?.bankId) {
      conditions.push('bank_id = @bankId');
      params.bankId = filters.bankId;
    }

    if (filters?.from) {
      conditions.push('date >= @from');
      params.from = filters.from;
    }

    if (filters?.to) {
      conditions.push('date <= @to');
      params.to = filters.to;
    }

    if (filters?.status) {
      conditions.push('status = @status');
      params.status = filters.status;
    }

    if (filters?.category) {
      conditions.push('category = @category');
      params.category = filters.category;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const limit = filters?.limit ?? 500;
    const offset = filters?.offset ?? 0;

    const sql = `
      SELECT * FROM transactions
      ${whereClause}
      ORDER BY date DESC, id DESC
      LIMIT @limit OFFSET @offset
    `;

    return this.getDb()
      .prepare(sql)
      .all({ ...params, limit, offset }) as StoredTransaction[];
  }

  /**
   * Returns all stored account records.
   */
  getAccounts(): StoredAccount[] {
    return this.getDb()
      .prepare('SELECT * FROM accounts ORDER BY bank_id, account_number')
      .all() as StoredAccount[];
  }

  /**
   * Returns the scrape run history with optional filters.
   */
  getScrapeHistory(filters?: ScrapeHistoryFilters): ScrapeRunRecord[] {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (filters?.bankId) {
      conditions.push('bank_id = @bankId');
      params.bankId = filters.bankId;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const limit = filters?.limit ?? 100;
    const offset = filters?.offset ?? 0;

    const sql = `
      SELECT * FROM scrape_runs
      ${whereClause}
      ORDER BY id DESC
      LIMIT @limit OFFSET @offset
    `;

    return this.getDb()
      .prepare(sql)
      .all({ ...params, limit, offset }) as ScrapeRunRecord[];
  }

  /**
   * Returns aggregate counts and the database file size for the health
   * endpoint.
   */
  getStats(): DatabaseStats {
    const db = this.getDb();

    const txnCount = (
      db.prepare('SELECT COUNT(*) as count FROM transactions').get() as {
        count: number;
      }
    ).count;

    const accountCount = (
      db.prepare('SELECT COUNT(*) as count FROM accounts').get() as {
        count: number;
      }
    ).count;

    const scrapeRunCount = (
      db.prepare('SELECT COUNT(*) as count FROM scrape_runs').get() as {
        count: number;
      }
    ).count;

    let dbSizeBytes = 0;
    try {
      const stat = fs.statSync(this.dbPath);
      dbSizeBytes = stat.size;
    } catch {
      // File may not exist yet
    }

    return {
      totalTransactions: txnCount,
      totalAccounts: accountCount,
      totalScrapeRuns: scrapeRunCount,
      dbSizeBytes,
    };
  }

  // -------------------------------------------------------------------------
  // Recurring patterns
  // -------------------------------------------------------------------------

  getActiveRecurringPatterns(): StoredRecurringPattern[] {
    return this.getDb()
      .prepare('SELECT * FROM recurring_patterns WHERE is_active = 1 ORDER BY direction, avg_amount DESC')
      .all() as StoredRecurringPattern[];
  }

  getAllRecurringPatterns(): StoredRecurringPattern[] {
    return this.getDb()
      .prepare('SELECT * FROM recurring_patterns ORDER BY is_active DESC, direction, avg_amount DESC')
      .all() as StoredRecurringPattern[];
  }

  upsertRecurringPattern(pattern: {
    description: string;
    normalizedDesc: string;
    bankId: string;
    accountNumber: string;
    category: string | null;
    avgAmount: number;
    amountVariance: number;
    frequency: string;
    typicalDay: number | null;
    direction: string;
    occurrenceCount: number;
    lastSeen: string;
    userConfirmed?: boolean;
  }): void {
    this.getDb()
      .prepare(`
        INSERT INTO recurring_patterns (
          description, normalized_desc, bank_id, account_number, category,
          avg_amount, amount_variance, frequency, typical_day, direction,
          occurrence_count, last_seen, user_confirmed
        ) VALUES (
          @description, @normalizedDesc, @bankId, @accountNumber, @category,
          @avgAmount, @amountVariance, @frequency, @typicalDay, @direction,
          @occurrenceCount, @lastSeen, @userConfirmed
        )
        ON CONFLICT(normalized_desc, bank_id, account_number)
        DO UPDATE SET
          description      = excluded.description,
          category         = excluded.category,
          avg_amount       = excluded.avg_amount,
          amount_variance  = excluded.amount_variance,
          frequency        = excluded.frequency,
          typical_day      = excluded.typical_day,
          occurrence_count = excluded.occurrence_count,
          last_seen        = excluded.last_seen,
          updated_at       = datetime('now')
      `)
      .run({
        description: pattern.description,
        normalizedDesc: pattern.normalizedDesc,
        bankId: pattern.bankId,
        accountNumber: pattern.accountNumber,
        category: pattern.category,
        avgAmount: pattern.avgAmount,
        amountVariance: pattern.amountVariance,
        frequency: pattern.frequency,
        typicalDay: pattern.typicalDay,
        direction: pattern.direction,
        occurrenceCount: pattern.occurrenceCount,
        lastSeen: pattern.lastSeen,
        userConfirmed: pattern.userConfirmed ? 1 : 0,
      });
  }

  /**
   * Returns credit card aggregate charge transactions from the beinleumi
   * bank account, identified by known card company description patterns.
   */
  queryCardChargeTransactions(): StoredTransaction[] {
    return this.getDb()
      .prepare(`
        SELECT * FROM transactions
        WHERE bank_id = 'beinleumi'
          AND original_amount < 0
          AND (
            description LIKE '%מקס איט%'
            OR description LIKE '%ישראכרט בע%'
            OR description LIKE '%הרשאה כאל%'
          )
        ORDER BY date DESC
        LIMIT 100
      `)
      .all() as StoredTransaction[];
  }

  /**
   * Returns credit card spending aggregated by card company and month.
   * Used to project actual upcoming card charges on the bank account.
   */
  queryPendingCardSpending(): Array<{
    bank_id: string;
    account_number: string;
    month: string;
    total_spend: number;
    txn_count: number;
  }> {
    return this.getDb()
      .prepare(`
        SELECT bank_id, account_number,
          strftime('%Y-%m', datetime(date, '+3 hours')) as month,
          SUM(CASE WHEN original_amount < 0 THEN ABS(original_amount) ELSE 0 END) as total_spend,
          COUNT(*) as txn_count
        FROM transactions
        WHERE bank_id IN ('max', 'isracard')
          AND date >= date('now', '-3 months')
        GROUP BY bank_id, account_number, month
        ORDER BY bank_id, account_number, month DESC
      `)
      .all() as Array<{
        bank_id: string;
        account_number: string;
        month: string;
        total_spend: number;
        txn_count: number;
      }>;
  }

  /**
   * Returns typical charge days for each card company on the bank account,
   * detected from historical transaction data.
   */
  queryCardChargeDays(): Array<{
    description: string;
    charge_day: number;
    avg_amount: number;
    occurrence_count: number;
  }> {
    return this.getDb()
      .prepare(`
        SELECT description,
          CAST(strftime('%d', datetime(date, '+3 hours')) AS INTEGER) as charge_day,
          ROUND(AVG(ABS(original_amount)), 2) as avg_amount,
          COUNT(*) as occurrence_count
        FROM transactions
        WHERE bank_id = 'beinleumi'
          AND original_amount < -1000
          AND (description LIKE '%מקס איט%' OR description LIKE '%ישראכרט%' OR description LIKE '%כאל%')
        GROUP BY description, charge_day
        HAVING COUNT(*) >= 2
        ORDER BY description, charge_day
      `)
      .all() as Array<{
        description: string;
        charge_day: number;
        avg_amount: number;
        occurrence_count: number;
      }>;
  }

  /**
   * Sums the charged_amount of CC transactions whose processed_date matches
   * the given charge date. The processed_date field is set by the card company
   * to indicate which billing cycle a transaction belongs to — this is the
   * exact amount that will be debited from the bank on that date.
   *
   * Only includes non-pending transactions with non-zero charged_amount.
   * Returns the absolute total (positive number) representing the bill.
   */
  queryCCChargeByProcessedDate(
    bankId: string,
    accountNumber: string,
    chargeDateStr: string,
  ): number {
    // Completed transactions: use charged_amount (the actual billing amount)
    const completed = this.getDb()
      .prepare(`
        SELECT COALESCE(-SUM(charged_amount), 0) as total
        FROM transactions
        WHERE bank_id = @bankId
          AND account_number = @accountNumber
          AND strftime('%Y-%m-%d', datetime(processed_date, '+3 hours')) = @chargeDateStr
          AND charged_amount != 0
          AND status != 'pending'
      `)
      .get({ bankId, accountNumber, chargeDateStr }) as { total: number } | undefined;

    // Pending transactions: use original_amount (charged_amount is 0 for pending)
    // Filter to the billing cycle window: from previous charge date to this charge date
    const chargeDate = new Date(chargeDateStr + 'T00:00:00Z');
    const prevChargeDate = new Date(chargeDate);
    prevChargeDate.setUTCMonth(prevChargeDate.getUTCMonth() - 1);
    const prevChargeDateStr = prevChargeDate.toISOString().substring(0, 10);

    const pending = this.getDb()
      .prepare(`
        SELECT COALESCE(-SUM(original_amount), 0) as total
        FROM transactions
        WHERE bank_id = @bankId
          AND account_number = @accountNumber
          AND status = 'pending'
          AND date >= @prevChargeDateStr
          AND date < @chargeDateStr
      `)
      .get({ bankId, accountNumber, prevChargeDateStr, chargeDateStr }) as { total: number } | undefined;

    return Math.max(0, (completed?.total ?? 0) + (pending?.total ?? 0));
  }

  /**
   * Checks whether a card company charge has been debited from the beinleumi
   * bank account on or after the expected charge date. Returns true if a
   * matching transaction exists (meaning the charge is already reflected in
   * the bank balance).
   */
  hasCardChargeBeenDebited(cardDescription: string, chargeDateStr: string): boolean {
    const row = this.getDb()
      .prepare(`
        SELECT COUNT(*) as cnt
        FROM transactions
        WHERE bank_id = 'beinleumi'
          AND description LIKE '%' || @cardDescription || '%'
          AND strftime('%Y-%m-%d', datetime(date, '+3 hours')) >= @chargeDateStr
          AND strftime('%Y-%m-%d', datetime(date, '+3 hours')) <= date(@chargeDateStr, '+3 days')
          AND original_amount < 0
      `)
      .get({ cardDescription, chargeDateStr }) as { cnt: number } | undefined;
    return (row?.cnt ?? 0) > 0;
  }

  /**
   * Returns daily net transaction totals for beinleumi over the last N months.
   * Uses Israel timezone (UTC+3) for date extraction so the grouping matches
   * the Israeli calendar day.
   */
  queryDailyTransactionNets(monthsBack: number): Array<{
    date: string;
    daily_net: number;
    txn_count: number;
  }> {
    return this.getDb()
      .prepare(`
        SELECT
          strftime('%Y-%m-%d', datetime(date, '+3 hours')) AS date,
          SUM(original_amount) AS daily_net,
          COUNT(*) AS txn_count
        FROM transactions
        WHERE bank_id = 'beinleumi'
          AND date >= date('now', @monthsBackParam)
        GROUP BY strftime('%Y-%m-%d', datetime(date, '+3 hours'))
        ORDER BY date ASC
      `)
      .all({ monthsBackParam: `-${monthsBack} months` }) as Array<{
        date: string;
        daily_net: number;
        txn_count: number;
      }>;
  }

  /**
   * Returns transactions for beinleumi on a specific date (Israel TZ).
   * Used to populate historical day events.
   */
  queryTransactionsOnDate(dateStr: string): Array<{
    description: string;
    original_amount: number;
    category: string | null;
  }> {
    return this.getDb()
      .prepare(`
        SELECT description, original_amount, category
        FROM transactions
        WHERE bank_id = 'beinleumi'
          AND strftime('%Y-%m-%d', datetime(date, '+3 hours')) = @dateStr
        ORDER BY original_amount ASC
      `)
      .all({ dateStr }) as Array<{
        description: string;
        original_amount: number;
        category: string | null;
      }>;
  }

  /**
   * Returns category-level spending aggregated by month across all banks.
   *
   * For beinleumi (where category is NULL), rows are grouped by description
   * so the caller can classify them in JS. For max/isracard, rows are grouped
   * by the scraper-provided category.
   *
   * Internal transfers (card company charges on beinleumi) are excluded to
   * avoid double-counting with actual CC transactions.
   *
   * Only negative amounts (expenses) are included.
   */
  confirmRecurringPattern(id: number): boolean {
    const result = this.getDb()
      .prepare('UPDATE recurring_patterns SET user_confirmed = 1, updated_at = datetime(\'now\') WHERE id = @id')
      .run({ id });
    return result.changes > 0;
  }

  /**
   * Queries grouped transaction data for recurring pattern detection.
   * Returns groups of transactions with the same normalized description
   * within a single account.
   */
  queryTransactionGroupsForRecurrence(): Array<{
    bank_id: string;
    account_number: string;
    description: string;
    dates: string;
    amounts: string;
    categories: string;
    cnt: number;
  }> {
    return this.getDb()
      .prepare(`
        SELECT
          bank_id,
          account_number,
          description,
          GROUP_CONCAT(date, '|') AS dates,
          GROUP_CONCAT(CAST(CASE WHEN charged_amount != 0 THEN charged_amount ELSE original_amount END AS TEXT), '|') AS amounts,
          GROUP_CONCAT(COALESCE(category, ''), '|') AS categories,
          COUNT(*) AS cnt
        FROM transactions
        WHERE status = 'completed'
        GROUP BY bank_id, account_number, description
        HAVING COUNT(*) >= 3
        ORDER BY COUNT(*) DESC
      `)
      .all() as Array<{
        bank_id: string;
        account_number: string;
        description: string;
        dates: string;
        amounts: string;
        categories: string;
        cnt: number;
      }>;
  }

  // -------------------------------------------------------------------------
  // Category rules (user-defined description -> category mappings)
  // -------------------------------------------------------------------------

  getCategoryRules(): Array<{ description: string; category_id: string }> {
    return this.getDb()
      .prepare('SELECT description, category_id FROM category_rules ORDER BY updated_at DESC')
      .all() as Array<{ description: string; category_id: string }>;
  }

  upsertCategoryRule(description: string, categoryId: string): void {
    this.getDb()
      .prepare(`
        INSERT INTO category_rules (description, category_id)
        VALUES (@description, @categoryId)
        ON CONFLICT(description)
        DO UPDATE SET
          category_id = excluded.category_id,
          updated_at  = datetime('now')
      `)
      .run({ description, categoryId });
  }

  deleteCategoryRule(description: string): void {
    this.getDb()
      .prepare('DELETE FROM category_rules WHERE description = @description')
      .run({ description });
  }

  applyCategoryRules(): number {
    const result = this.getDb()
      .prepare(`
        UPDATE transactions
        SET category = (
          SELECT category_id FROM category_rules
          WHERE category_rules.description = transactions.description
        )
        WHERE description IN (SELECT description FROM category_rules)
      `)
      .run();
    return result.changes;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Returns the underlying database instance, throwing if not initialized.
   */
  private getDb(): BetterSqlite3.Database {
    if (!this.db) {
      throw new Error(
        '[db-service] Database not initialized. Call init() first.',
      );
    }
    return this.db;
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

export const databaseService = new DatabaseService();
