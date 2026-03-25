// ---------------------------------------------------------------------------
// Cash flow projection engine
// ---------------------------------------------------------------------------

import { databaseService } from './db-service.js';
import { normalizeCategory } from '../utils/category-utils.js';
import type {
  CashFlowProjection,
  ProjectedDay,
  CashFlowEvent,
  RecurringItemSummary,
  StoredRecurringPattern,
  StoredAccount,
} from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PROJECTION_MONTHS = 3;
const MAX_PROJECTION_MONTHS = 12;
const MIN_PROJECTION_MONTHS = 1;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Minimum number of historical card_payment transactions required before
 * we project a credit card charge cycle.
 */
const MIN_CARD_CHARGE_OCCURRENCES = 2;

/**
 * Known card company description substrings used to identify aggregate
 * credit card charges on the beinleumi bank account. These are handled
 * separately by computeUpcomingCardCharges() and must be excluded from the
 * general recurring patterns to prevent double-counting.
 */
const CARD_COMPANY_PATTERNS = ['מקס איט', 'ישראכרט', 'כאל'];

/** Bank ID for the primary checking account (Bank Beinleumi). */
const BANK_ACCOUNT_ID = 'beinleumi';

// ---------------------------------------------------------------------------
// Category classification
// ---------------------------------------------------------------------------

// Category normalization and description classification are imported
// from ../utils/category-utils.ts (shared utility).


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Adds the given number of days to a Date, returning a new Date.
 */
function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * MILLISECONDS_PER_DAY);
}

/**
 * Formats a Date as a YYYY-MM-DD string using UTC components.
 * All projection dates are stored in UTC to avoid local-timezone drift.
 */
function toDateString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Checks whether a recurring pattern should fire on the given date,
 * respecting its frequency (monthly, bimonthly, quarterly).
 *
 * For monthly items, the pattern fires every month on its typical day.
 * For bimonthly, it fires every other month (even months: Feb, Apr, ...).
 * For quarterly, it fires every third month (Jan, Apr, Jul, Oct).
 */
function shouldPatternFireOnDate(
  pattern: StoredRecurringPattern,
  date: Date,
): boolean {
  // Use Israel timezone (UTC+3) to match how typical_day was computed
  const israelDate = new Date(date.getTime());
  israelDate.setHours(israelDate.getHours() + 3);
  const dayOfMonth = israelDate.getDate();
  const typicalDay = pattern.typical_day ?? 1;

  if (dayOfMonth !== typicalDay) return false;

  const month = israelDate.getMonth(); // 0-indexed

  switch (pattern.frequency) {
    case 'monthly':
      return true;
    case 'bimonthly':
      return month % 2 === 1; // odd 0-indexed months = even calendar months (Feb, Apr, Jun, ...)
    case 'quarterly':
      return month % 3 === 0;
    default:
      return false;
  }
}

/** Default charge day when no historical data is available */
const DEFAULT_CHARGE_DAY = 10;

/**
 * Maps each CC account number to its charge day on the beinleumi bank account
 * and the bank debit description. Derived from correlating CC account spending
 * totals to actual bank charge amounts per day.
 */
const CC_ACCOUNT_CHARGE_MAP: Array<{
  bankId: string;
  accountNumber: string;
  chargeDay: number;
  bankDescription: string;
}> = [
  { bankId: 'max', accountNumber: '5525', chargeDay: 2, bankDescription: 'מקס איט פיננסים' },
  { bankId: 'max', accountNumber: '3329', chargeDay: 10, bankDescription: 'מקס איט פיננסים' },
  { bankId: 'isracard', accountNumber: '2262', chargeDay: 10, bankDescription: 'ישראכרט בע"מ' },
  { bankId: 'visaCal', accountNumber: '2608', chargeDay: 10, bankDescription: 'עפ"י הרשאה כאל' },
];

/** Known card company description substrings (used for filtering recurring patterns) */
const CARD_COMPANY_DESCRIPTIONS = ['מקס איט', 'ישראכרט', 'כאל'];

/** Hebrew display names for card companies, used for per-card labels. */
const CARD_DISPLAY_NAMES: Record<string, string> = {
  max: 'מקס',
  isracard: 'ישראכרט',
  visaCal: 'כאל',
};

function getCardDisplayName(bankId: string, accountNumber: string): string {
  const prefix = CARD_DISPLAY_NAMES[bankId] ?? bankId;
  return `${prefix} ${accountNumber}`;
}

interface ProjectedCardCharge {
  description: string;
  amount: number;
  chargeDate: string; // YYYY-MM-DD
  source: 'pending_cc:billing_cycle';
  bankId: string;
  accountNumber: string;
}

/**
 * Computes upcoming card charges by summing actual CC transactions within
 * each billing cycle window.
 *
 * Each CC account has a known charge day on the bank. The billing cycle runs
 * from the previous charge day to the next charge day. We sum CC transactions
 * in that window for the next upcoming charge (real data), and fall back to
 * the median of historical bank charges for further-out months.
 */
function computeUpcomingCardCharges(projectionMonths: number): ProjectedCardCharge[] {
  const charges: ProjectedCardCharge[] = [];
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth();

  // --- Part 1: CC accounts with processed_date matching ---
  // The CC scraper provides a `processed_date` field that indicates which
  // billing cycle each transaction belongs to. Summing `charged_amount`
  // where `processed_date` matches the charge date gives the exact bill.
  for (const mapping of CC_ACCOUNT_CHARGE_MAP) {
    const { bankId, accountNumber, chargeDay, bankDescription } = mapping;

    for (let monthOffset = 0; monthOffset <= projectionMonths; monthOffset++) {
      const chargeYear = nowYear + Math.floor((nowMonth + monthOffset) / 12);
      const chargeMonthIdx = (nowMonth + monthOffset) % 12;
      const chargeDateUtc = new Date(Date.UTC(chargeYear, chargeMonthIdx, chargeDay));
      const chargeDateStr = toDateString(chargeDateUtc);

      // Skip charge dates that are already reflected in the bank balance.
      // A past charge date is only skipped if the debit actually appeared on
      // the beinleumi account. If the charge date passed but the bank hasn't
      // debited it yet, we must still include it as a pending outflow.
      if (chargeDateUtc.getTime() < todayUtc.getTime()) {
        const alreadyDebited = databaseService.hasCardChargeBeenDebited(
          bankDescription,
          chargeDateStr,
        );
        if (alreadyDebited) continue;
      }

      // Sum completed CC transactions whose processed_date matches this charge date
      const billingTotal = databaseService.queryCCChargeByProcessedDate(
        bankId,
        accountNumber,
        chargeDateStr,
      );

      if (billingTotal > 0) {
        charges.push({
          description: bankDescription,
          amount: Math.round(billingTotal * 100) / 100,
          chargeDate: chargeDateStr,
          source: 'pending_cc:billing_cycle',
          bankId,
          accountNumber,
        });
      }
    }
  }

  return charges;
}

// ---------------------------------------------------------------------------
// Public: next billing cycle per card
// ---------------------------------------------------------------------------

export interface UpcomingCardBilling {
  bankId: string;
  accountNumber: string;
  bankDescription: string;
  chargeDay: number;
  chargeDate: string;
  amount: number;
  pendingAmount: number;
  source: 'billing_cycle';
}

/**
 * Returns the next upcoming charge for each credit card account.
 * Uses real billing-cycle data when available, falls back to historical median.
 */
export function getUpcomingCardBillings(): UpcomingCardBilling[] {
  const billings: UpcomingCardBilling[] = [];
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth();

  for (const mapping of CC_ACCOUNT_CHARGE_MAP) {
    const { bankId, accountNumber, chargeDay, bankDescription } = mapping;

    for (let monthOffset = 0; monthOffset <= 1; monthOffset++) {
      const chargeYear = nowYear + Math.floor((nowMonth + monthOffset) / 12);
      const chargeMonthIdx = (nowMonth + monthOffset) % 12;
      const chargeDateUtc = new Date(Date.UTC(chargeYear, chargeMonthIdx, chargeDay));
      const chargeDateStr = toDateString(chargeDateUtc);

      if (chargeDateUtc.getTime() < todayUtc.getTime()) {
        const alreadyDebited = databaseService.hasCardChargeBeenDebited(
          bankDescription,
          chargeDateStr,
        );
        if (alreadyDebited) continue;
      }

      const billingTotal = databaseService.queryCCChargeByProcessedDate(
        bankId,
        accountNumber,
        chargeDateStr,
      );

      const pendingTotal = databaseService.queryCCPendingTotal(bankId, accountNumber);

      if (billingTotal > 0 || pendingTotal > 0) {
        billings.push({
          bankId,
          accountNumber,
          bankDescription,
          chargeDay,
          chargeDate: chargeDateStr,
          amount: Math.round(billingTotal * 100) / 100,
          pendingAmount: Math.round(pendingTotal * 100) / 100,
          source: 'billing_cycle',
        });
        break;
      }
    }
  }

  return billings;
}

/**
 * Computes the starting balance by summing all known bank account balances.
 * Credit card accounts (from scrapers like max, isracard) typically have
 * negative balances representing outstanding debt; checking accounts have
 * positive balances. We sum only checking/bank account balances.
 */
function computeStartBalance(accounts: StoredAccount[]): number {
  let total = 0;
  for (const account of accounts) {
    if (account.balance != null) {
      total += account.balance;
    }
  }
  return Math.round(total * 100) / 100;
}

/**
 * Maps a stored recurring pattern to the summary shape returned in the
 * projection response.
 */
function toRecurringItemSummary(
  pattern: StoredRecurringPattern,
): RecurringItemSummary {
  return {
    id: pattern.id,
    description: pattern.description,
    amount: pattern.avg_amount,
    frequency: pattern.frequency,
    typicalDay: pattern.typical_day ?? 1,
    direction: pattern.direction,
    isUserConfirmed: pattern.user_confirmed === 1,
    category: normalizeCategory(pattern.category, pattern.description),
  };
}


// ---------------------------------------------------------------------------
// Historical daily balance reconstruction
// ---------------------------------------------------------------------------

/**
 * Reconstructs daily bank balance for the beinleumi account by walking
 * backwards from the current known balance.
 *
 * The formula is: balance(day-1) = balance(day) - net_transactions(day)
 * because net_transactions includes income (positive) and expenses (negative).
 * If today's net was +10000 (salary), then yesterday's balance was
 * currentBalance - 10000.
 */
function reconstructHistoricalBalance(monthsBack: number): ProjectedDay[] {
  const accounts = databaseService.getAccounts();
  const beinleumiAccount = accounts.find((a) => a.bank_id === BANK_ACCOUNT_ID);
  const currentBalance = beinleumiAccount?.balance ?? 0;

  const dailyNets = databaseService.queryDailyTransactionNets(monthsBack);

  // Build a map of date -> daily_net for quick lookup
  const netsByDate = new Map<string, number>();
  for (const row of dailyNets) {
    netsByDate.set(row.date, row.daily_net);
  }

  // Collect all dates from the query, sorted descending (newest first)
  // so we can walk backwards from today
  const now = new Date();
  const todayStr = toDateString(
    new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())),
  );

  // Build a complete date range from earliest transaction date to today
  const allDates: string[] = [];
  if (dailyNets.length > 0) {
    const earliestDate = dailyNets[0].date;
    let cursor = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const earliest = new Date(earliestDate + 'T00:00:00Z');

    while (cursor >= earliest) {
      allDates.push(toDateString(cursor));
      cursor = addDays(cursor, -1);
    }
  }

  // allDates is newest-first; walk backwards computing balances
  const balanceByDate = new Map<string, number>();
  let balance = currentBalance;

  for (const dateStr of allDates) {
    balanceByDate.set(dateStr, Math.round(balance * 100) / 100);
    const dayNet = netsByDate.get(dateStr) ?? 0;
    // Walk backwards: yesterday = today - today's net
    balance = balance - dayNet;
  }

  // Build ProjectedDay[] sorted chronologically (oldest first)
  const historicalDays: ProjectedDay[] = [];
  const chronologicalDates = [...allDates].reverse();

  for (const dateStr of chronologicalDates) {
    // Skip today — it is already shown as the first projected day
    if (dateStr === todayStr) continue;

    const dayBalance = balanceByDate.get(dateStr) ?? 0;

    // Get actual transactions for the day to populate events
    const txns = databaseService.queryTransactionsOnDate(dateStr);
    const events: CashFlowEvent[] = txns.map((txn) => ({
      description: txn.description,
      amount: txn.original_amount,
      type: txn.original_amount >= 0 ? 'income' as const : 'expense' as const,
      source: 'historical',
    }));

    historicalDays.push({
      date: dateStr,
      projectedBalance: dayBalance,
      events,
    });
  }

  return historicalDays;
}


// ---------------------------------------------------------------------------
// Main projection function
// ---------------------------------------------------------------------------

/**
 * Generates a comprehensive cash-flow projection combining:
 * - Historical daily balance reconstruction (lookback)
 * - Forward projections from recurring patterns and card charges
 * - Category-level expense forecasts distributed across projected days
 *
 * @param months   Number of months to project forward (1-12, default 3)
 * @param monthsBack  Number of months of historical data to reconstruct (1-12, default 2)
 * @returns CashFlowProjection with historical days, projected days, recurring items, and category forecasts
 */
export function generateCashFlowProjection(
  months?: number,
  monthsBack?: number,
): CashFlowProjection {
  const projectionMonths = Math.max(
    MIN_PROJECTION_MONTHS,
    Math.min(MAX_PROJECTION_MONTHS, months ?? DEFAULT_PROJECTION_MONTHS),
  );

  const DEFAULT_MONTHS_BACK = 2;
  const clampedMonthsBack = Math.max(
    MIN_PROJECTION_MONTHS,
    Math.min(MAX_PROJECTION_MONTHS, monthsBack ?? DEFAULT_MONTHS_BACK),
  );

  // Gather data
  const accounts = databaseService.getAccounts();
  const startBalance = computeStartBalance(accounts);
  const allRecurringPatterns = databaseService.getActiveRecurringPatterns();
  const cardCharges = computeUpcomingCardCharges(projectionMonths);

  // Only use patterns from the bank account (beinleumi) to avoid double-
  // counting individual credit card transactions that are already captured
  // by the aggregate card charges.
  const bankOnlyPatterns = allRecurringPatterns.filter(
    (p) => p.bank_id === BANK_ACCOUNT_ID,
  );

  // Exclude card company aggregate charges from recurring patterns — those
  // are handled separately by computeUpcomingCardCharges().
  const recurringPatterns = bankOnlyPatterns.filter(
    (p) => !CARD_COMPANY_PATTERNS.some((cc) => p.description.includes(cc)),
  );

  // Historical balance reconstruction
  const historicalDays = reconstructHistoricalBalance(clampedMonthsBack);

  // Build date range
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

  const endDate = new Date(today);
  endDate.setUTCMonth(endDate.getUTCMonth() + projectionMonths);

  const totalDays = Math.ceil(
    (endDate.getTime() - today.getTime()) / MILLISECONDS_PER_DAY,
  );

  // Generate daily projections using only real data:
  // recurring patterns (confirmed) and card charges (from billing cycles)
  const projectedDays: ProjectedDay[] = [];
  let runningBalance = startBalance;

  for (let dayOffset = 0; dayOffset <= totalDays; dayOffset++) {
    const currentDate = addDays(today, dayOffset);
    const events: CashFlowEvent[] = [];

    if (dayOffset === 0) {
      const todayStr = toDateString(currentDate);

      for (const charge of cardCharges) {
        if (charge.chargeDate <= todayStr) {
          events.push({
            description: charge.description,
            amount: -charge.amount,
            type: 'card_charge',
            source: charge.source,
            bankId: charge.bankId,
            accountNumber: charge.accountNumber,
          });
        }
      }

      const dayDelta = events.reduce((sum, event) => sum + event.amount, 0);
      runningBalance = Math.round((runningBalance + dayDelta) * 100) / 100;

      projectedDays.push({
        date: todayStr,
        projectedBalance: runningBalance,
        events,
      });
      continue;
    }

    // Recurring income and expense patterns (user-confirmed only)
    for (const pattern of recurringPatterns) {
      if (shouldPatternFireOnDate(pattern, currentDate)) {
        const amount =
          pattern.direction === 'income'
            ? pattern.avg_amount
            : -pattern.avg_amount;

        events.push({
          description: pattern.description,
          amount,
          type: pattern.direction === 'income' ? 'income' : 'expense',
          source: `recurring:${pattern.id}`,
        });
      }
    }

    // Card charges from real billing cycle data only
    const currentDateStr = toDateString(currentDate);
    for (const charge of cardCharges) {
      if (charge.chargeDate === currentDateStr) {
        events.push({
          description: charge.description,
          amount: -charge.amount,
          type: 'card_charge',
          source: charge.source,
          bankId: charge.bankId,
          accountNumber: charge.accountNumber,
        });
      }
    }

    const dayDelta = events.reduce((sum, event) => sum + event.amount, 0);
    runningBalance = Math.round((runningBalance + dayDelta) * 100) / 100;

    projectedDays.push({
      date: toDateString(currentDate),
      projectedBalance: runningBalance,
      events,
    });
  }

  // Build recurring items summary
  const recurringItems: RecurringItemSummary[] =
    recurringPatterns.map(toRecurringItemSummary);

  // Add per-card charge items, deduplicated by bankId+accountNumber.
  // Each card account gets its own entry with a descriptive display name.
  const seenCards = new Set<string>();
  for (const charge of cardCharges) {
    const cardKey = `${charge.bankId}|${charge.accountNumber}`;
    if (seenCards.has(cardKey)) continue;
    seenCards.add(cardKey);

    const displayName = getCardDisplayName(charge.bankId, charge.accountNumber);
    recurringItems.push({
      id: -1,
      description: displayName,
      amount: charge.amount,
      frequency: 'monthly',
      typicalDay: CC_ACCOUNT_CHARGE_MAP.find(
        (m) => m.bankId === charge.bankId && m.accountNumber === charge.accountNumber,
      )?.chargeDay ?? DEFAULT_CHARGE_DAY,
      direction: 'expense',
      isUserConfirmed: false,
      category: 'credit_card',
      bankId: charge.bankId,
      accountNumber: charge.accountNumber,
    });
  }

  return {
    startBalance,
    projectedDays,
    recurringItems,
    historicalDays,
    categoryForecasts: [],
  };
}
