import { format, parseISO } from 'date-fns';
import type { AccountType, EnrichedTransaction } from '@/types/bank';
import { getEffectiveAmount } from '@/lib/data-utils';
import { getEffectiveCategory } from '@/lib/category-classifier';

const INTERNAL_TRANSFER_CATEGORIES = new Set(['card_payment']);

export interface MonthlyAccountBreakdown {
  month: string;
  monthLabel: string;
  [accountKey: string]: number | string;
}

/**
 * Groups transactions by month and account, producing data shaped for
 * Recharts stacked bar charts.
 *
 * Each row: { month, monthLabel, account_3329: 1234, account_5525: 567, ... }
 */
export function getMonthlyBreakdownByAccount(
  txns: EnrichedTransaction[],
  mode: 'expenses' | 'income' = 'expenses',
  userRules?: Map<string, string>,
): MonthlyAccountBreakdown[] {
  const monthAccountMap = new Map<string, Map<string, number>>();
  const allAccounts = new Set<string>();

  for (const txn of txns) {
    const amount = getEffectiveAmount(txn);
    const isExpense = amount < 0;

    if (mode === 'expenses' && !isExpense) continue;
    if (mode === 'income' && isExpense) continue;

    // Skip internal transfers (card bill payments) from expenses to prevent double-counting
    if (mode === 'expenses') {
      const category = getEffectiveCategory(txn, userRules);
      if (INTERNAL_TRANSFER_CATEGORIES.has(category)) continue;
    }

    const date = parseISO(txn.date);
    const monthKey = format(date, 'yyyy-MM');
    const accountKey = `account_${txn.accountNumber}`;
    allAccounts.add(accountKey);

    if (!monthAccountMap.has(monthKey)) {
      monthAccountMap.set(monthKey, new Map());
    }
    const accountMap = monthAccountMap.get(monthKey)!;
    const current = accountMap.get(accountKey) ?? 0;
    accountMap.set(accountKey, current + Math.abs(amount));
  }

  const result: MonthlyAccountBreakdown[] = Array.from(monthAccountMap.entries())
    .map(([monthKey, accountMap]) => {
      const row: MonthlyAccountBreakdown = {
        month: monthKey,
        monthLabel: format(parseISO(`${monthKey}-01`), 'MMM yyyy'),
      };
      for (const accountKey of allAccounts) {
        row[accountKey] = Math.round((accountMap.get(accountKey) ?? 0) * 100) / 100;
      }
      return row;
    })
    .sort((a, b) => (a.month as string).localeCompare(b.month as string));

  return result;
}

/**
 * Extract unique account keys from breakdown data (e.g. ["account_3329", "account_5525"]).
 */
export function getAccountKeysFromBreakdown(data: MonthlyAccountBreakdown[]): string[] {
  const keys = new Set<string>();
  for (const row of data) {
    for (const key of Object.keys(row)) {
      if (key.startsWith('account_')) {
        keys.add(key);
      }
    }
  }
  return Array.from(keys).sort();
}

/**
 * Build a map of account keys to their account types from transaction data.
 * e.g. { "account_3329": "credit_card", "account_353833": "bank_account" }
 */
export function getAccountTypeMap(txns: EnrichedTransaction[]): Record<string, AccountType> {
  const map: Record<string, AccountType> = {};
  for (const txn of txns) {
    const key = `account_${txn.accountNumber}`;
    if (!(key in map)) {
      map[key] = txn.accountType;
    }
  }
  return map;
}

export interface MonthlyCategoryBreakdown {
  month: string;
  monthLabel: string;
  [categoryKey: string]: number | string;
}

/**
 * Groups expenses by month and category for stacked bar charts.
 */
export function getMonthlyBreakdownByCategory(
  txns: EnrichedTransaction[],
  userRules?: Map<string, string>,
): MonthlyCategoryBreakdown[] {
  const monthCatMap = new Map<string, Map<string, number>>();
  const allCategories = new Set<string>();

  for (const txn of txns) {
    const amount = getEffectiveAmount(txn);
    if (amount >= 0) continue;

    const category = getEffectiveCategory(txn, userRules);
    // Skip internal transfers (card bill payments) to prevent double-counting
    if (INTERNAL_TRANSFER_CATEGORIES.has(category)) continue;

    const date = parseISO(txn.date);
    const monthKey = format(date, 'yyyy-MM');
    allCategories.add(category);

    if (!monthCatMap.has(monthKey)) {
      monthCatMap.set(monthKey, new Map());
    }
    const catMap = monthCatMap.get(monthKey)!;
    catMap.set(category, (catMap.get(category) ?? 0) + Math.abs(amount));
  }

  return Array.from(monthCatMap.entries())
    .map(([monthKey, catMap]) => {
      const row: MonthlyCategoryBreakdown = {
        month: monthKey,
        monthLabel: format(parseISO(`${monthKey}-01`), 'MMM yyyy'),
      };
      for (const cat of allCategories) {
        row[cat] = Math.round((catMap.get(cat) ?? 0) * 100) / 100;
      }
      return row;
    })
    .sort((a, b) => (a.month as string).localeCompare(b.month as string));
}
