// ---------------------------------------------------------------------------
// Core scraper service wrapping israeli-bank-scrapers with caching & timeout
// ---------------------------------------------------------------------------

import { createScraper, CompanyTypes } from 'israeli-bank-scrapers';
import type { ScraperScrapingResult } from 'israeli-bank-scrapers/lib/scrapers/interface.js';

import { BANK_REGISTRY } from '../config/bank-registry.js';
import { getCredentials, getConfiguredBanks } from '../config/credentials.js';
import { CacheService } from './cache-service.js';
import { databaseService } from './db-service.js';
import { gcsBackupService } from './gcs-backup.js';
import type { SupportedBankId, BankScraperData } from '../types.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SCRAPER_TIMEOUT_MS = parseInt(
  process.env.SCRAPER_TIMEOUT_MS || '120000',
  10,
);

const CACHE_TTL_MS = parseInt(
  process.env.CACHE_TTL_MS || '300000',
  10,
);

const MONTHS_TO_SCRAPE = 6;

// ---------------------------------------------------------------------------
// Module-level cache instance
// ---------------------------------------------------------------------------

const cache = new CacheService<BankScraperData>(CACHE_TTL_MS);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildStartDate(): Date {
  const date = new Date();
  date.setMonth(date.getMonth() - MONTHS_TO_SCRAPE);
  return date;
}

function createTimeoutPromise(timeoutMs: number): Promise<never> {
  return new Promise((_resolve, reject) => {
    setTimeout(() => {
      reject(new Error(`Scraper timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
}

/**
 * Maps the library's ScraperScrapingResult to our BankScraperData type.
 * The library's `accounts` field is optional, so we default to an empty array.
 */
function mapToScraperData(
  bankId: SupportedBankId,
  result: ScraperScrapingResult,
): BankScraperData {
  return {
    bankId,
    result: {
      success: result.success,
      accounts: (result.accounts ?? []).map((account) => ({
        accountNumber: account.accountNumber,
        balance: account.balance,
        txns: account.txns.map((txn) => ({
          type: txn.type as BankScraperData['result']['accounts'][number]['txns'][number]['type'],
          identifier: txn.identifier,
          date: txn.date,
          processedDate: txn.processedDate,
          originalAmount: txn.originalAmount,
          originalCurrency: txn.originalCurrency as BankScraperData['result']['accounts'][number]['txns'][number]['originalCurrency'],
          chargedAmount: txn.chargedAmount,
          chargedCurrency: txn.chargedCurrency,
          description: txn.description,
          memo: txn.memo,
          status: txn.status as BankScraperData['result']['accounts'][number]['txns'][number]['status'],
          installments: txn.installments
            ? { number: txn.installments.number, total: txn.installments.total }
            : undefined,
          category: txn.category,
        })),
      })),
      errorType: result.errorType,
      errorMessage: result.errorMessage,
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scrapes a single bank's transactions. Results are cached unless
 * `options.fresh` is true. The `triggerType` is recorded in the database
 * scrape_runs audit log (e.g. 'api', 'scheduled', 'manual').
 */
export async function scrapeSingleBank(
  bankId: SupportedBankId,
  options?: { fresh?: boolean; triggerType?: string },
): Promise<BankScraperData> {
  // Check cache first (unless a fresh scrape is requested)
  if (!options?.fresh) {
    const cached = cache.get(bankId);
    if (cached) {
      console.log(`[scraper-service] Cache hit for "${bankId}"`);
      return cached;
    }
  }

  console.log(`[scraper-service] Scraping "${bankId}"...`);

  const registryEntry = BANK_REGISTRY[bankId];
  const credentials = getCredentials(bankId);

  const scraper = createScraper({
    companyId: registryEntry.companyId as CompanyTypes,
    startDate: buildStartDate(),
    combineInstallments: false,
    showBrowser: false,
    defaultTimeout: 60000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const scraperPromise: Promise<BankScraperData> = scraper
    .scrape(credentials)
    .then((result: ScraperScrapingResult) => mapToScraperData(bankId, result));

  const data = await Promise.race([
    scraperPromise,
    createTimeoutPromise(SCRAPER_TIMEOUT_MS),
  ]);

  if (data.result.success) {
    cache.set(bankId, data);
    console.log(`[scraper-service] Cached successful result for "${bankId}"`);
  } else {
    console.warn(
      `[scraper-service] Scrape for "${bankId}" returned error: ${data.result.errorType ?? 'unknown'}${data.result.errorMessage ? ` — ${data.result.errorMessage}` : ''}`,
    );
  }

  // Persist to SQLite (failures must not break the scrape response)
  try {
    databaseService.persistScrapeResult(data, options?.triggerType ?? 'api');
    // Backup to GCS after successful persist (non-blocking, failures logged)
    gcsBackupService.uploadDb().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scraper-service] GCS backup after persist failed: ${msg}`);
    });
  } catch (dbError) {
    const message =
      dbError instanceof Error ? dbError.message : String(dbError);
    console.error(
      `[scraper-service] Database persistence failed for "${bankId}": ${message}`,
    );
  }

  return data;
}

/**
 * Scrapes all configured banks in parallel. Uses Promise.allSettled so a
 * single bank failure does not prevent others from succeeding. The
 * `triggerType` is forwarded to each single-bank scrape for DB audit logging.
 */
export async function scrapeAllBanks(
  options?: { fresh?: boolean; triggerType?: string },
): Promise<BankScraperData[]> {
  const configuredBanks = getConfiguredBanks();
  console.log(
    `[scraper-service] Scraping all configured banks: ${configuredBanks.join(', ')}`,
  );

  const promises = configuredBanks.map((bankId) =>
    scrapeSingleBank(bankId, options),
  );

  const settled = await Promise.allSettled(promises);

  return settled.map((outcome, index) => {
    if (outcome.status === 'fulfilled') {
      return outcome.value;
    }

    const bankId = configuredBanks[index];
    const errorMessage =
      outcome.reason instanceof Error
        ? outcome.reason.message
        : String(outcome.reason);

    console.error(
      `[scraper-service] Failed to scrape "${bankId}": ${errorMessage}`,
    );

    return {
      bankId,
      result: {
        success: false,
        accounts: [],
        errorType: 'SCRAPER_ERROR',
        errorMessage,
      },
    };
  });
}

/**
 * Returns the current cache status for all known keys.
 */
export function getCacheStatus(): Record<
  string,
  { cached: boolean; ageMs?: number }
> {
  return cache.getStatus();
}

/**
 * Clears all cached scraper results.
 */
export function clearCache(): void {
  cache.clear();
  console.log('[scraper-service] Cache cleared');
}
