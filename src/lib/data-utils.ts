import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import type {
  BankScraperData,
  CategorySummary,
  EnrichedTransaction,
  FilterState,
  MonthlyAggregate,
} from '@/types/bank';
import { getBankDisplayName, getBankAccountType } from '@/constants/banks';
import { getEffectiveCategory } from '@/lib/category-classifier';

/**
 * Categories that represent internal transfers, not real expenses.
 * card_payment = credit card bill payments from bank account (already itemized in card data).
 */
const INTERNAL_TRANSFER_CATEGORIES = new Set(['card_payment']);

/**
 * Returns the effective transaction amount. Credit card scrapers (e.g. Max)
 * return chargedAmount=0 for pending transactions that haven't been processed
 * yet; in that case we fall back to originalAmount.
 */
export function getEffectiveAmount(txn: { chargedAmount: number; originalAmount: number }): number {
  return txn.chargedAmount !== 0 ? txn.chargedAmount : txn.originalAmount;
}

/**
 * Flattens bank scraper data into a single array of enriched transactions
 * with bank metadata attached to each transaction.
 */
export function getAllEnrichedTransactions(
  data: BankScraperData[],
): EnrichedTransaction[] {
  const enriched: EnrichedTransaction[] = [];

  for (const bankData of data) {
    for (const account of bankData.result.accounts) {
      for (const txn of account.txns) {
        enriched.push({
          ...txn,
          accountNumber: account.accountNumber,
          bankId: bankData.bankId,
          bankDisplayName: getBankDisplayName(bankData.bankId),
          accountType: getBankAccountType(bankData.bankId),
        });
      }
    }
  }

  enriched.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  return enriched;
}

/**
 * Apply all active filters to a list of enriched transactions.
 */
export function getFilteredTransactions(
  transactions: EnrichedTransaction[],
  filters: FilterState,
  userRules?: Map<string, string>,
): EnrichedTransaction[] {
  return transactions.filter((txn) => {
    // Account filter
    if (
      filters.selectedAccountIds.length > 0 &&
      !filters.selectedAccountIds.includes(txn.accountNumber)
    ) {
      return false;
    }

    // Date range filter
    const txnDate = parseISO(txn.date);
    if (txnDate < filters.dateRange.from || txnDate > filters.dateRange.to) {
      return false;
    }

    // Category filter
    if (filters.selectedCategories.length > 0) {
      const txnCategory = getEffectiveCategory(txn, userRules);
      if (!filters.selectedCategories.includes(txnCategory)) {
        return false;
      }
    }

    // Currency filter
    if (
      filters.selectedCurrency !== 'all' &&
      txn.originalCurrency !== filters.selectedCurrency
    ) {
      return false;
    }

    // Search query filter
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      const matchesDescription = txn.description.toLowerCase().includes(query);
      const matchesMemo = txn.memo?.toLowerCase().includes(query) ?? false;
      const matchesCategory = txn.category?.toLowerCase().includes(query) ?? false;
      if (!matchesDescription && !matchesMemo && !matchesCategory) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Group expenses by category and calculate percentages.
 * Only considers negative amounts (expenses).
 */
export function getCategoryBreakdown(
  txns: EnrichedTransaction[],
  userRules?: Map<string, string>,
): CategorySummary[] {
  const categoryMap = new Map<
    string,
    { totalAmount: number; transactionCount: number }
  >();

  for (const txn of txns) {
    const amount = getEffectiveAmount(txn);
    if (amount >= 0) continue;

    const category = getEffectiveCategory(txn, userRules);
    // Skip internal transfers (e.g., card bill payments) to prevent double-counting
    if (INTERNAL_TRANSFER_CATEGORIES.has(category)) continue;

    const existing = categoryMap.get(category) ?? {
      totalAmount: 0,
      transactionCount: 0,
    };
    existing.totalAmount += Math.abs(amount);
    existing.transactionCount += 1;
    categoryMap.set(category, existing);
  }

  const totalExpenses = Array.from(categoryMap.values()).reduce(
    (sum, entry) => sum + entry.totalAmount,
    0,
  );

  const breakdown: CategorySummary[] = Array.from(categoryMap.entries())
    .map(([category, data]) => ({
      category,
      totalAmount: Math.round(data.totalAmount * 100) / 100,
      transactionCount: data.transactionCount,
      percentage:
        totalExpenses > 0
          ? Math.round((data.totalAmount / totalExpenses) * 10000) / 100
          : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  return breakdown;
}

/**
 * Group transactions by month and calculate income, expenses, and net income.
 */
export function getMonthlyAggregates(
  txns: EnrichedTransaction[],
  userRules?: Map<string, string>,
): MonthlyAggregate[] {
  const monthMap = new Map<
    string,
    {
      totalSpending: number;
      totalIncome: number;
      transactionCount: number;
    }
  >();

  for (const txn of txns) {
    const date = parseISO(txn.date);
    const monthKey = format(date, 'yyyy-MM');
    const amount = getEffectiveAmount(txn);

    // Skip internal transfers (card bill payments) to prevent double-counting
    const category = getEffectiveCategory(txn, userRules);
    if (amount < 0 && INTERNAL_TRANSFER_CATEGORIES.has(category)) continue;

    const existing = monthMap.get(monthKey) ?? {
      totalSpending: 0,
      totalIncome: 0,
      transactionCount: 0,
    };

    if (amount < 0) {
      existing.totalSpending += Math.abs(amount);
    } else {
      existing.totalIncome += amount;
    }
    existing.transactionCount += 1;
    monthMap.set(monthKey, existing);
  }

  const aggregates: MonthlyAggregate[] = Array.from(monthMap.entries())
    .map(([monthKey, data]) => ({
      month: monthKey,
      monthLabel: format(parseISO(`${monthKey}-01`), 'MMM yyyy'),
      totalSpending: Math.round(data.totalSpending * 100) / 100,
      totalIncome: Math.round(data.totalIncome * 100) / 100,
      netIncome:
        Math.round((data.totalIncome - data.totalSpending) * 100) / 100,
      transactionCount: data.transactionCount,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return aggregates;
}

/**
 * Sum all account balances across all bank scraper data.
 */
export function getTotalBalance(bankData: BankScraperData[]): number {
  let total = 0;
  for (const bank of bankData) {
    if (!bank.result.success) continue;
    for (const account of bank.result.accounts) {
      total += account.balance ?? 0;
    }
  }
  return Math.round(total * 100) / 100;
}

/**
 * Get the most recent N transactions sorted by date descending.
 */
export function getRecentTransactions(
  txns: EnrichedTransaction[],
  count: number,
): EnrichedTransaction[] {
  return [...txns]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, count);
}

/**
 * Calculate quick summary statistics from a set of transactions.
 */
export function getQuickStats(txns: EnrichedTransaction[], userRules?: Map<string, string>): {
  totalIncome: number;
  totalExpenses: number;
  pendingCount: number;
  avgDailySpend: number;
} {
  let totalIncome = 0;
  let totalExpenses = 0;
  let pendingCount = 0;

  for (const txn of txns) {
    const amount = getEffectiveAmount(txn);
    if (amount >= 0) {
      totalIncome += amount;
    } else {
      // Skip internal transfers (card bill payments) to prevent double-counting
      const category = getEffectiveCategory(txn, userRules);
      if (!INTERNAL_TRANSFER_CATEGORIES.has(category)) {
        totalExpenses += Math.abs(amount);
      }
    }
    if (txn.status === 'pending') {
      pendingCount += 1;
    }
  }

  // Calculate date span for average daily spend
  let avgDailySpend = 0;
  if (txns.length > 0) {
    const dates = txns.map((txn) => parseISO(txn.date));
    const earliest = new Date(Math.min(...dates.map((d) => d.getTime())));
    const latest = new Date(Math.max(...dates.map((d) => d.getTime())));
    const daySpan = Math.max(differenceInCalendarDays(latest, earliest), 1);
    avgDailySpend = totalExpenses / daySpan;
  }

  return {
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    pendingCount,
    avgDailySpend: Math.round(avgDailySpend * 100) / 100,
  };
}
