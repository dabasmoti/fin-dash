// ---------------------------------------------------------------------------
// Cash flow projection engine
// ---------------------------------------------------------------------------

import { databaseService } from './db-service.js';
import type {
  CashFlowProjection,
  ProjectedDay,
  CashFlowEvent,
  RecurringItemSummary,
  StoredRecurringPattern,
  StoredAccount,
  CategoryForecast,
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

/**
 * Hebrew keyword-to-category mapping for beinleumi transactions whose
 * category is NULL in the database. Checked in order; first match wins.
 */
const DESCRIPTION_CATEGORY_MAP: [string, string][] = [
  ['סופר', 'food'], ['מזון', 'food'], ['שופרסל', 'food'], ['רמי לוי', 'food'],
  ['מסעד', 'restaurants'], ['קפה', 'restaurants'],
  ['ביטוח', 'insurance'],
  ['דלק', 'fuel'], ['פז ', 'fuel'], ['סונול', 'fuel'],
  ['חשמל', 'utilities'], ['מים ', 'utilities'], ['בזק', 'utilities'],
  ['סלקום', 'utilities'], ['פלאפון', 'utilities'], ['פרטנר', 'utilities'], ['הוט ', 'utilities'],
  ['רפואה', 'health'], ['מרקח', 'health'], ['כללית', 'health'], ['מכבי', 'health'],
  ['חינוך', 'education'],
  ['גן ', 'childcare'],
  ['משכנ', 'housing'], ['שכר דירה', 'housing'],
  ['הלוואה', 'loans'],
  ['משכורת', 'salary'],
  ['תחבור', 'transport'], ['חניה', 'transport'], ['רכב', 'transport'],
];

/**
 * Maps Hebrew category names (used by Max/Isracard scrapers) to normalized
 * English category identifiers.
 */
const HEBREW_CATEGORY_MAP: Record<string, string> = {
  'מזון וצריכה': 'food',
  'מסעדות, קפה וברים': 'restaurants',
  'ביטוח': 'insurance',
  'דלק, חשמל וגז': 'fuel',
  'שירותי תקשורת': 'utilities',
  'רפואה ובתי מרקחת': 'health',
  'חשמל ומחשבים': 'electronics',
  'תחבורה ורכבים': 'transport',
  'פנאי, בידור וספורט': 'entertainment',
  'אופנה': 'clothing',
  'עיצוב הבית': 'home',
  'קוסמטיקה וטיפוח': 'shopping',
  'טיסות ותיירות': 'travel',
  'משיכת מזומן': 'cash',
  'העברת כספים': 'transfer',
  'עירייה וממשלה': 'utilities',
  'חיות מחמד': 'other',
  'שונות': 'other',
};

/**
 * Classifies a beinleumi transaction description into a spending category
 * by scanning for Hebrew keyword matches. Returns 'other' when no keyword
 * matches.
 */
export function classifyDescription(desc: string): string {
  for (const [keyword, category] of DESCRIPTION_CATEGORY_MAP) {
    if (desc.includes(keyword)) {
      return category;
    }
  }
  return 'other';
}

/** Minimum months of data required for a category to be forecast. */
const MIN_MONTHS_FOR_FORECAST = 3;

/** Z-score for 90% confidence interval (one-tailed 5%). */
const CONFIDENCE_Z_SCORE = 1.645;

/** Default number of months of history for category forecasting. */
const DEFAULT_FORECAST_MONTHS_BACK = 6;

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

interface ProjectedCardCharge {
  description: string;
  amount: number;
  chargeDate: string; // YYYY-MM-DD
  source: 'pending_cc:billing_cycle' | 'pending_cc:historical_avg';
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
        });
      } else {
        // No CC data for this charge date — use historical bank charge median
        const medianCharge = databaseService.queryMedianBankCharge(bankDescription, chargeDay);
        if (medianCharge > 0) {
          charges.push({
            description: bankDescription,
            amount: Math.round(medianCharge * 100) / 100,
            chargeDate: chargeDateStr,
            source: 'pending_cc:historical_avg',
          });
        }
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
  source: 'billing_cycle' | 'historical_avg';
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

    // Find the next charge date (this month or next)
    for (let monthOffset = 0; monthOffset <= 1; monthOffset++) {
      const chargeYear = nowYear + Math.floor((nowMonth + monthOffset) / 12);
      const chargeMonthIdx = (nowMonth + monthOffset) % 12;
      const chargeDateUtc = new Date(Date.UTC(chargeYear, chargeMonthIdx, chargeDay));
      const chargeDateStr = toDateString(chargeDateUtc);

      // Skip past dates that have already been debited
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

      if (billingTotal > 0) {
        billings.push({
          bankId,
          accountNumber,
          bankDescription,
          chargeDay,
          chargeDate: chargeDateStr,
          amount: Math.round(billingTotal * 100) / 100,
          source: 'billing_cycle',
        });
        break;
      }

      const medianCharge = databaseService.queryMedianBankCharge(bankDescription, chargeDay);
      if (medianCharge > 0) {
        billings.push({
          bankId,
          accountNumber,
          bankDescription,
          chargeDay,
          chargeDate: chargeDateStr,
          amount: Math.round(medianCharge * 100) / 100,
          source: 'historical_avg',
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
  };
}

// ---------------------------------------------------------------------------
// Statistical helpers
// ---------------------------------------------------------------------------

function computeMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function computeStdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1);
  return Math.sqrt(variance);
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
// Category-level expense forecasting
// ---------------------------------------------------------------------------

/**
 * Produces a statistical forecast for each spending category by analyzing
 * monthly totals across all banks over the specified lookback period.
 *
 * For each category with sufficient history (3+ months):
 * - Computes mean, median, and standard deviation of monthly spend
 * - Selects mean when spending is stable (CV < 0.3), median otherwise
 * - Provides a 90% confidence interval using z = 1.645
 */
function forecastCategoryExpenses(
  monthsBack: number = DEFAULT_FORECAST_MONTHS_BACK,
): CategoryForecast[] {
  const rawData = databaseService.queryCategorySpendingByMonth(monthsBack);

  // Step 1 & 2: Classify and aggregate into Map<category, Map<month, total>>
  const categoryMonthTotals = new Map<string, Map<string, number>>();

  for (const row of rawData) {
    let category: string;

    if (row.bank_id === BANK_ACCOUNT_ID) {
      // Beinleumi: classify by description since category is null
      category = classifyDescription(row.description);
    } else {
      // Max / Isracard: map Hebrew category to normalized English
      category = row.category
        ? (HEBREW_CATEGORY_MAP[row.category] ?? 'other')
        : 'other';
    }

    if (!categoryMonthTotals.has(category)) {
      categoryMonthTotals.set(category, new Map());
    }
    const monthMap = categoryMonthTotals.get(category)!;
    const current = monthMap.get(row.month) ?? 0;
    monthMap.set(row.month, current + row.total_spend);
  }

  // Step 3: Build the complete list of months in the lookback window
  const now = new Date();
  const allMonths: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    allMonths.push(`${y}-${m}`);
  }

  // Step 4 & 5: Compute forecasts per category
  const forecasts: CategoryForecast[] = [];

  for (const [category, monthMap] of categoryMonthTotals) {
    // Count months that have any data
    const monthsWithData = allMonths.filter((m) => (monthMap.get(m) ?? 0) > 0).length;
    if (monthsWithData < MIN_MONTHS_FOR_FORECAST) continue;

    // Collect monthly totals (fill 0 for missing months)
    const monthlyValues = allMonths.map((m) => monthMap.get(m) ?? 0);

    const mean = computeMean(monthlyValues);
    const median = computeMedian(monthlyValues);
    const stdDev = computeStdDev(monthlyValues, mean);
    const cv = mean > 0 ? stdDev / mean : 0;

    // Choose method based on coefficient of variation
    const method: 'mean' | 'median' = cv < 0.3 ? 'mean' : 'median';
    const projected = method === 'mean' ? mean : median;

    const confidenceLow = Math.max(0, projected - CONFIDENCE_Z_SCORE * stdDev);
    const confidenceHigh = projected + CONFIDENCE_Z_SCORE * stdDev;

    const monthlyHistory = allMonths.map((m) => ({
      month: m,
      amount: Math.round((monthMap.get(m) ?? 0) * 100) / 100,
    }));

    forecasts.push({
      category,
      monthlyAvg: Math.round(mean * 100) / 100,
      monthlyMedian: Math.round(median * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100,
      cv: Math.round(cv * 1000) / 1000,
      projectedMonthly: Math.round(projected * 100) / 100,
      confidenceLow: Math.round(confidenceLow * 100) / 100,
      confidenceHigh: Math.round(confidenceHigh * 100) / 100,
      method,
      monthlyHistory,
    });
  }

  // Sort by projectedMonthly descending (largest expense categories first)
  forecasts.sort((a, b) => b.projectedMonthly - a.projectedMonthly);

  return forecasts;
}

// ---------------------------------------------------------------------------
// Main projection function
// ---------------------------------------------------------------------------

/**
 * Returns the number of days in the month that contains the given date.
 */
function daysInMonth(date: Date): number {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
}

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

  // Category-level expense forecasts
  const categoryForecasts = forecastCategoryExpenses();

  // Total forecasted monthly variable expenses from all categories
  const totalForecastedMonthly = categoryForecasts.reduce(
    (sum, fc) => sum + fc.projectedMonthly,
    0,
  );

  // Build date range: today through projectionMonths months ahead.
  // Use UTC midnight so toDateString() produces the correct calendar date.
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

  const endDate = new Date(today);
  endDate.setUTCMonth(endDate.getUTCMonth() + projectionMonths);

  const totalDays = Math.ceil(
    (endDate.getTime() - today.getTime()) / MILLISECONDS_PER_DAY,
  );

  // Pre-compute known expenses per month BEFORE the daily loop so the
  // variable expense daily rate stays constant within each month.
  //
  // Expense accounting model:
  // - Category forecast (totalForecastedMonthly) = expected TOTAL monthly spend
  //   including spending that flows through credit cards.
  // - Recurring bank debits (loan, mortgage) hit the bank directly and ARE part
  //   of the forecast total.
  // - Card charges represent CC spending billed to the bank. This spending is
  //   ALSO captured in the category forecast.
  //
  // To avoid double-counting:
  // - Current month: use actual card charges + recurring debits (no variable forecast)
  // - Future months: variable = forecast - recurringBankDebits - actualCardCharges
  // Card charges are based on historical bank debit medians. For the current
  // month, they're shown as discrete events (the bank will actually debit these).
  // For future months, spending that flows through credit cards is already part
  // of the category forecast, so card charges are NOT added as separate events.
  const currentMonthKey = toDateString(today).substring(0, 7);

  // Accumulate known recurring bank debits per month (loan, mortgage, etc.)
  const knownBankDebitsByMonth = new Map<string, number>();

  for (let dayOffset = 1; dayOffset <= totalDays; dayOffset++) {
    const d = addDays(today, dayOffset);
    const monthKey = toDateString(d).substring(0, 7);

    for (const pattern of recurringPatterns) {
      if (pattern.direction === 'expense' && shouldPatternFireOnDate(pattern, d)) {
        const current = knownBankDebitsByMonth.get(monthKey) ?? 0;
        knownBankDebitsByMonth.set(monthKey, current + pattern.avg_amount);
      }
    }
  }

  // Compute daily variable expense rate per month (constant within each month).
  // Current month: no variable forecast — actual card charges are shown instead.
  // Future months: variable = totalForecast - recurringBankDebits
  //   (card charges are NOT shown for future months since forecast covers them)
  const dailyVariableByMonth = new Map<string, number>();
  for (let mo = 0; mo < projectionMonths; mo++) {
    const mDate = new Date(Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth() + mo,
      15,
    ));
    const monthKey = toDateString(mDate).substring(0, 7);

    if (monthKey === currentMonthKey) {
      dailyVariableByMonth.set(monthKey, 0);
    } else {
      const knownDebits = knownBankDebitsByMonth.get(monthKey) ?? 0;
      const variableExpenses = Math.max(0, totalForecastedMonthly - knownDebits);
      const daily = variableExpenses / daysInMonth(mDate);
      dailyVariableByMonth.set(monthKey, Math.round(daily * 100) / 100);
    }
  }

  // Generate daily projections
  const projectedDays: ProjectedDay[] = [];
  let runningBalance = startBalance;

  for (let dayOffset = 0; dayOffset <= totalDays; dayOffset++) {
    const currentDate = addDays(today, dayOffset);
    const events: CashFlowEvent[] = [];

    // For today (dayOffset 0): recurring patterns are skipped because the
    // bank balance already reflects debits that happened earlier today.
    // However, card charges scheduled for today OR in the recent past that
    // haven't been debited yet must be included — the bank balance does
    // NOT reflect them yet.
    if (dayOffset === 0) {
      const todayStr = toDateString(currentDate);

      for (const charge of cardCharges) {
        // Include charges for today or overdue past charges (not yet debited)
        if (charge.chargeDate <= todayStr) {
          events.push({
            description: charge.description,
            amount: -charge.amount,
            type: 'card_charge',
            source: charge.source,
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

    // Check recurring income and expense patterns
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

    // Card charges: include for the current month (actual bank debits) and
    // for future months ONLY if based on real billing-cycle CC data.
    // Historical-avg charges for future months are subsumed by the forecast.
    const currentDateStr = toDateString(currentDate);
    const dateMonthKey = currentDateStr.substring(0, 7);
    for (const charge of cardCharges) {
      if (charge.chargeDate === currentDateStr) {
        const isCurrentMonth = dateMonthKey === currentMonthKey;
        const hasBillingData = charge.source === 'pending_cc:billing_cycle';

        if (isCurrentMonth || hasBillingData) {
          events.push({
            description: charge.description,
            amount: -charge.amount,
            type: 'card_charge',
            source: charge.source,
          });
        }
      }
    }

    // Add estimated variable expenses from category forecast (constant daily rate)
    const monthKey = currentDateStr.substring(0, 7);
    const dailyVariable = dailyVariableByMonth.get(monthKey) ?? 0;
    if (dailyVariable > 0) {
      events.push({
        description: 'Estimated daily expenses',
        amount: -dailyVariable,
        type: 'forecast',
        source: 'category_forecast',
      });
    }

    // Update running balance
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

  // Append card charge summary items (deduplicated by description)
  const seenCardCompanies = new Set<string>();
  for (const charge of cardCharges) {
    if (!seenCardCompanies.has(charge.description)) {
      seenCardCompanies.add(charge.description);
      recurringItems.push({
        id: -1,
        description: charge.description,
        amount: charge.amount,
        frequency: 'monthly',
        typicalDay: DEFAULT_CHARGE_DAY,
        direction: 'expense',
        isUserConfirmed: false,
      });
    }
  }

  return {
    startBalance,
    projectedDays,
    recurringItems,
    historicalDays,
    categoryForecasts,
  };
}
