// ---------------------------------------------------------------------------
// Recurring transaction pattern detection
// ---------------------------------------------------------------------------

import { databaseService } from './db-service.js';
import type { StoredRecurringPattern, RecurringFrequency, RecurringDirection } from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_OCCURRENCES = 3;
const MAX_AMOUNT_VARIANCE = 0.45; // 45% — captures salary variance (~24%) and education salary (~43%)

/**
 * Suffixes commonly appended by credit card scrapers for installment
 * transactions (e.g. "- תשלום 3 מתוך 12"). Stripping these lets us
 * group installment payments under a single recurring pattern.
 */
const INSTALLMENT_SUFFIX_PATTERN = /\s*[-–]\s*תשלום\s*\d+\s*מתוך\s*\d+\s*$/;
const WHITESPACE_PATTERN = /\s+/g;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Israel is UTC+2 in winter and UTC+3 in summer. Using +3 avoids the
 *  off-by-one day error for dates stored as midnight UTC (e.g.
 *  "2026-02-09T22:00:00.000Z" is actually Feb 10 in Israel). */
const ISRAEL_OFFSET_HOURS = 3;

function getIsraelDayOfMonth(isoDate: string): number {
  const d = new Date(isoDate);
  d.setHours(d.getHours() + ISRAEL_OFFSET_HOURS);
  return d.getDate();
}

function normalizeDescription(desc: string): string {
  return desc
    .replace(INSTALLMENT_SUFFIX_PATTERN, '')
    .replace(WHITESPACE_PATTERN, ' ')
    .trim()
    .toLowerCase();
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Returns the Israel-timezone YYYY-MM for a given ISO date string.
 */
function getIsraelMonth(isoDate: string): string {
  const d = new Date(isoDate);
  d.setHours(d.getHours() + ISRAEL_OFFSET_HOURS);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function getDistinctMonths(dates: string[]): Set<string> {
  const months = new Set<string>();
  for (const d of dates) {
    months.add(getIsraelMonth(d));
  }
  return months;
}

function inferFrequency(distinctMonthCount: number, totalMonthSpan: number): RecurringFrequency | null {
  if (totalMonthSpan <= 0) return null;
  const ratio = distinctMonthCount / totalMonthSpan;

  if (ratio >= 0.7) return 'monthly';
  if (ratio >= 0.4) return 'bimonthly';
  if (ratio >= 0.2) return 'quarterly';
  return null;
}

function getAmountVariance(amounts: number[]): number {
  if (amounts.length < 2) return 0;
  const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  if (avg === 0) return 0;
  const maxDeviation = Math.max(...amounts.map((a) => Math.abs(a - avg)));
  return maxDeviation / Math.abs(avg);
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

export function detectRecurringPatterns(): StoredRecurringPattern[] {
  const groups = databaseService.queryTransactionGroupsForRecurrence();
  const detected: StoredRecurringPattern[] = [];

  for (const group of groups) {
    const dates = group.dates.split('|');
    const amounts = group.amounts.split('|').map(Number);
    const categories = group.categories.split('|');

    if (dates.length < MIN_OCCURRENCES) continue;

    const distinctMonths = getDistinctMonths(dates);
    if (distinctMonths.size < MIN_OCCURRENCES) continue;

    // Consolidate by month: when multiple transactions match the same
    // description in the same calendar month (Israel TZ), sum them.
    // This handles cases like salary split into two payments in one month.
    const monthlyTotals = new Map<string, { total: number; dates: string[] }>();
    for (let i = 0; i < dates.length; i++) {
      const month = getIsraelMonth(dates[i]);
      const entry = monthlyTotals.get(month) ?? { total: 0, dates: [] };
      entry.total += amounts[i];
      entry.dates.push(dates[i]);
      monthlyTotals.set(month, entry);
    }

    // Calculate month span
    const sortedMonths = [...distinctMonths].sort();
    const firstMonth = sortedMonths[0];
    const lastMonth = sortedMonths[sortedMonths.length - 1];
    const [firstYear, firstMon] = firstMonth.split('-').map(Number);
    const [lastYear, lastMon] = lastMonth.split('-').map(Number);
    const totalMonthSpan = (lastYear - firstYear) * 12 + (lastMon - firstMon) + 1;

    const frequency = inferFrequency(distinctMonths.size, totalMonthSpan);
    if (!frequency) continue;

    // Use consolidated monthly totals for variance and averaging
    const monthlyAmounts = sortedMonths.map(m => Math.abs(monthlyTotals.get(m)!.total));
    const amountVariance = getAmountVariance(monthlyAmounts);
    if (amountVariance > MAX_AMOUNT_VARIANCE) continue;

    // Use the median of recent monthly amounts for projection.
    // Median is robust against outlier months (e.g. double salary in Dec).
    const recentCount = Math.min(3, monthlyAmounts.length);
    const recentAmounts = monthlyAmounts.slice(-recentCount);
    const avgAmount = median(recentAmounts);
    const direction: RecurringDirection = amounts[0] >= 0 ? 'income' : 'expense';

    // Typical day of month — use the earliest date per month (for split payments)
    const representativeDates = sortedMonths.map(m => {
      const monthDates = monthlyTotals.get(m)!.dates;
      return monthDates.sort()[0];
    });
    const days = representativeDates.map((d) => getIsraelDayOfMonth(d));
    const typicalDay = Math.round(median(days));

    // Most common non-empty category
    const categoryCounts = new Map<string, number>();
    for (const cat of categories) {
      if (cat) {
        categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
      }
    }
    let category: string | null = null;
    let maxCount = 0;
    for (const [cat, count] of categoryCounts) {
      if (count > maxCount) {
        maxCount = count;
        category = cat;
      }
    }

    const normalizedDesc = normalizeDescription(group.description);
    const lastSeen = dates.sort().at(-1) ?? new Date().toISOString();

    // Upsert into database
    databaseService.upsertRecurringPattern({
      description: group.description,
      normalizedDesc,
      bankId: group.bank_id,
      accountNumber: group.account_number,
      category,
      avgAmount: Math.round(avgAmount * 100) / 100,
      amountVariance: Math.round(amountVariance * 10000) / 10000,
      frequency,
      typicalDay,
      direction,
      occurrenceCount: distinctMonths.size,
      lastSeen,
    });
  }

  return databaseService.getAllRecurringPatterns();
}
