import { format, parseISO, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDaysInMonth } from 'date-fns';
import type {
  BankScraperData,
  CurrencyBreakdown,
  DailyAggregate,
  EnrichedTransaction,
  InstallmentForecast,
  MerchantSummary,
} from '@/types/bank';
import { getBankDisplayName } from '@/constants/banks';
import { getEffectiveAmount } from '@/lib/data-utils';

/**
 * Group transactions by merchant (description), sum amounts, and return the
 * top N merchants sorted by total spend descending.
 * Only considers expenses (negative chargedAmount).
 */
export function getTopMerchants(
  txns: EnrichedTransaction[],
  limit: number,
): MerchantSummary[] {
  const merchantMap = new Map<
    string,
    { totalAmount: number; transactionCount: number; lastDate: string }
  >();

  for (const txn of txns) {
    const amount = getEffectiveAmount(txn);
    if (amount >= 0) continue;

    // Strip installment suffix from description for grouping
    const baseName = txn.description.replace(/ - תשלום \d+\/\d+$/, '');

    const existing = merchantMap.get(baseName) ?? {
      totalAmount: 0,
      transactionCount: 0,
      lastDate: txn.date,
    };

    existing.totalAmount += Math.abs(amount);
    existing.transactionCount += 1;

    if (txn.date > existing.lastDate) {
      existing.lastDate = txn.date;
    }

    merchantMap.set(baseName, existing);
  }

  const merchants: MerchantSummary[] = Array.from(merchantMap.entries())
    .map(([name, data]) => ({
      merchantName: name,
      totalAmount: Math.round(data.totalAmount * 100) / 100,
      transactionCount: data.transactionCount,
      lastTransactionDate: data.lastDate,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, limit);

  return merchants;
}

/**
 * Group transactions by original currency and calculate amounts and percentages.
 * Only considers expenses (negative chargedAmount).
 */
export function getCurrencyBreakdown(
  txns: EnrichedTransaction[],
): CurrencyBreakdown[] {
  const currencyMap = new Map<
    string,
    { totalAmount: number; transactionCount: number }
  >();

  for (const txn of txns) {
    const amount = getEffectiveAmount(txn);
    if (amount >= 0) continue;

    const currency = txn.originalCurrency;
    const existing = currencyMap.get(currency) ?? {
      totalAmount: 0,
      transactionCount: 0,
    };

    existing.totalAmount += Math.abs(txn.originalAmount);
    existing.transactionCount += 1;
    currencyMap.set(currency, existing);
  }

  const totalExpenses = Array.from(currencyMap.values()).reduce(
    (sum, entry) => sum + entry.totalAmount,
    0,
  );

  const breakdown: CurrencyBreakdown[] = Array.from(currencyMap.entries())
    .map(([currency, data]) => ({
      currency: currency as EnrichedTransaction['originalCurrency'],
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
 * Calculate daily spending aggregates for a given month.
 * Defaults to the current month when no month is provided.
 * Only considers expenses (negative chargedAmount).
 */
export function getDailySpending(
  txns: EnrichedTransaction[],
  month?: Date,
): DailyAggregate[] {
  const targetMonth = month ?? new Date();
  const monthStart = startOfMonth(targetMonth);
  const monthEnd = endOfMonth(targetMonth);

  const daysInMonth = getDaysInMonth(targetMonth);
  const dailyMap = new Map<string, { totalSpending: number; transactionCount: number }>();

  // Initialize all days of the month
  const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  for (const day of allDays) {
    const dayKey = format(day, 'yyyy-MM-dd');
    dailyMap.set(dayKey, { totalSpending: 0, transactionCount: 0 });
  }

  for (const txn of txns) {
    const amount = getEffectiveAmount(txn);
    if (amount >= 0) continue;

    const txnDate = parseISO(txn.date);
    if (txnDate < monthStart || txnDate > monthEnd) continue;

    const dayKey = format(txnDate, 'yyyy-MM-dd');
    const existing = dailyMap.get(dayKey) ?? {
      totalSpending: 0,
      transactionCount: 0,
    };

    existing.totalSpending += Math.abs(amount);
    existing.transactionCount += 1;
    dailyMap.set(dayKey, existing);
  }

  const aggregates: DailyAggregate[] = Array.from(dailyMap.entries())
    .map(([dateKey, data]) => ({
      date: dateKey,
      totalSpending: Math.round(data.totalSpending * 100) / 100,
      transactionCount: data.transactionCount,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, daysInMonth);

  return aggregates;
}

/**
 * Extract active installment transactions and compute remaining payment details.
 */
export function getInstallmentForecasts(
  txns: EnrichedTransaction[],
): InstallmentForecast[] {
  const forecasts: InstallmentForecast[] = [];

  for (const txn of txns) {
    if (txn.type !== 'installments' || !txn.installments) continue;

    const { number: currentPayment, total: totalPayments } = txn.installments;
    const remainingPayments = totalPayments - currentPayment;

    if (remainingPayments <= 0) continue;

    const monthlyAmount = Math.abs(getEffectiveAmount(txn));
    const totalRemaining = monthlyAmount * remainingPayments;

    // Estimate completion date based on remaining payments from transaction date
    const txnDate = parseISO(txn.date);
    const completionDate = addMonths(txnDate, remainingPayments);

    // Calculate original total amount
    const originalAmount = monthlyAmount * totalPayments;

    // Clean up the description by removing the installment suffix
    const description = txn.description.replace(/ - תשלום \d+\/\d+$/, '');

    forecasts.push({
      description,
      currentPayment,
      totalPayments,
      remainingPayments,
      monthlyAmount: Math.round(monthlyAmount * 100) / 100,
      totalRemaining: Math.round(totalRemaining * 100) / 100,
      estimatedCompletionDate: format(completionDate, 'yyyy-MM-dd'),
      originalAmount: Math.round(originalAmount * 100) / 100,
    });
  }

  // Deduplicate by description — keep only the most recent installment
  // (highest currentPayment number) per description group. Multiple installment
  // transactions for the same vendor (e.g., payments 1/4, 2/4, 3/4) all appear
  // in the transaction list, but only the latest one has current remaining info.
  const latestByDescription = new Map<string, InstallmentForecast>();
  for (const forecast of forecasts) {
    const existing = latestByDescription.get(forecast.description);
    if (!existing || forecast.currentPayment > existing.currentPayment) {
      latestByDescription.set(forecast.description, forecast);
    }
  }

  const deduplicated = [...latestByDescription.values()];

  // Sort by total remaining descending (largest obligations first)
  deduplicated.sort((a, b) => b.totalRemaining - a.totalRemaining);

  return deduplicated;
}

/**
 * Build simulated monthly balance snapshots for each account.
 * Uses current balance and works backwards by approximating monthly net changes
 * from transaction data.
 */
export function getAccountBalanceHistory(
  bankData: BankScraperData[],
): { account: string; bank: string; month: string; balance: number }[] {
  const MONTHS_BACK = 6;
  const results: { account: string; bank: string; month: string; balance: number }[] = [];

  for (const bank of bankData) {
    const bankName = getBankDisplayName(bank.bankId);

    for (const account of bank.result.accounts) {
      const currentBalance = account.balance ?? 0;

      // Collect monthly net amounts from transactions
      const monthlyNet = new Map<string, number>();
      for (const txn of account.txns) {
        const date = parseISO(txn.date);
        const monthKey = format(date, 'yyyy-MM');
        const existing = monthlyNet.get(monthKey) ?? 0;
        monthlyNet.set(monthKey, existing + getEffectiveAmount(txn));
      }

      // Build monthly snapshots starting from current balance going backwards
      const now = new Date();
      let runningBalance = currentBalance;

      const snapshots: { month: string; balance: number }[] = [];

      for (let i = 0; i <= MONTHS_BACK; i++) {
        const targetDate = addMonths(now, -i);
        const monthKey = format(targetDate, 'yyyy-MM');
        const monthLabel = format(targetDate, 'MMM yyyy');

        snapshots.push({
          month: monthLabel,
          balance: Math.round(runningBalance * 100) / 100,
        });

        // Subtract this month's net to get previous month's balance
        const netForMonth = monthlyNet.get(monthKey) ?? 0;
        runningBalance -= netForMonth;
      }

      // Reverse so oldest is first
      snapshots.reverse();

      for (const snap of snapshots) {
        results.push({
          account: account.accountNumber,
          bank: bankName,
          month: snap.month,
          balance: snap.balance,
        });
      }
    }
  }

  return results;
}
