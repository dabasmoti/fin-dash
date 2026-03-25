import { useEffect, useMemo, useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { useFilters } from '@/contexts/FilterContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import {
  getFilteredTransactions,
  getCategoryBreakdown,
  getMonthlyAggregates,
  getTotalBalance,
  getRecentTransactions,
  getQuickStats,
} from '@/lib/data-utils';
import { fetchUpcomingBillings, type UpcomingCardBilling } from '@/services/api-client';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { DashboardSkeleton } from '@/components/shared/LoadingSkeleton';
import TotalBalanceCard from '@/components/dashboard/TotalBalanceCard';
import AccountCard, { BankErrorCard } from '@/components/dashboard/AccountCard';
import QuickStats from '@/components/dashboard/QuickStats';
import SpendingCategoryChart from '@/components/dashboard/SpendingCategoryChart';
import MonthlyTrendChart from '@/components/dashboard/MonthlyTrendChart';
import RecentTransactions from '@/components/dashboard/RecentTransactions';
import UpcomingBillings from '@/components/dashboard/UpcomingBillings';
import RecurringExpensesTable from '@/components/dashboard/RecurringExpensesTable';
import OtherExpensesTable from '@/components/dashboard/OtherExpensesTable';
import CashFlowProjection from '@/components/analytics/CashFlowProjection';
import { useRecurringExpenses } from '@/hooks/useRecurringExpenses';

const RECENT_TRANSACTIONS_COUNT = 5;

export default function DashboardPage() {
  usePageTitle('Dashboard');
  const { bankData, enrichedTransactions, isLoading, categoryRules } = useData();
  const { filters } = useFilters();
  const [billings, setBillings] = useState<UpcomingCardBilling[]>([]);

  useEffect(() => {
    fetchUpcomingBillings().then(setBillings).catch(() => {});
  }, []);

  const filteredTransactions = useMemo(
    () => getFilteredTransactions(enrichedTransactions, filters, categoryRules),
    [enrichedTransactions, filters, categoryRules],
  );

  const totalBalance = useMemo(
    () => getTotalBalance(bankData),
    [bankData],
  );

  const accountCount = useMemo(() => {
    let count = 0;
    for (const bank of bankData) {
      if (bank.result.success) {
        count += bank.result.accounts.length;
      }
    }
    return count;
  }, [bankData]);

  const quickStats = useMemo(
    () => getQuickStats(filteredTransactions, categoryRules),
    [filteredTransactions, categoryRules],
  );

  const categoryBreakdown = useMemo(
    () => getCategoryBreakdown(filteredTransactions, categoryRules),
    [filteredTransactions, categoryRules],
  );

  const monthlyAggregates = useMemo(
    () => getMonthlyAggregates(filteredTransactions, categoryRules),
    [filteredTransactions, categoryRules],
  );

  const recentTransactions = useMemo(
    () => getRecentTransactions(filteredTransactions, RECENT_TRANSACTIONS_COUNT),
    [filteredTransactions],
  );

  const { recurringRows, otherTransactions } = useRecurringExpenses(
    filteredTransactions,
    categoryRules,
  );

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>

      {/* Total Balance */}
      <TotalBalanceCard
        totalBalance={totalBalance}
        accountCount={accountCount}
      />

      {/* Quick Stats */}
      <QuickStats
        totalIncome={quickStats.totalIncome}
        totalExpenses={quickStats.totalExpenses}
        pendingCount={quickStats.pendingCount}
        avgDailySpend={quickStats.avgDailySpend}
      />

      {/* Account Cards - horizontal scroll */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Accounts</h2>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {bankData.map((bank) =>
            bank.result.success
              ? bank.result.accounts
                  .filter((account) => account.txns.length > 0 || account.balance != null)
                  .map((account) => (
                  <AccountCard
                    key={`${bank.bankId}-${account.accountNumber}`}
                    account={account}
                    bankId={bank.bankId}
                    billing={billings.find(
                      (b) => b.bankId === bank.bankId && b.accountNumber === account.accountNumber,
                    )}
                  />
                ))
              : (
                  <BankErrorCard
                    key={`${bank.bankId}-error`}
                    bankId={bank.bankId}
                    errorType={bank.result.errorType}
                    errorMessage={bank.result.errorMessage}
                  />
                ),
          )}
        </div>
      </div>

      {/* Charts and Recent Transactions - 2 columns on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ErrorBoundary fallbackTitle="Failed to load spending trend">
          <MonthlyTrendChart monthlyAggregates={monthlyAggregates} />
        </ErrorBoundary>
        <ErrorBoundary fallbackTitle="Failed to load category chart">
          <SpendingCategoryChart categoryBreakdown={categoryBreakdown} />
        </ErrorBoundary>
      </div>

      {/* Cash Flow Projection */}
      <ErrorBoundary fallbackTitle="Failed to load cash flow projection">
        <CashFlowProjection />
      </ErrorBoundary>

      {/* Expense Breakdown: Recurring vs Other */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ErrorBoundary fallbackTitle="Failed to load recurring expenses">
          <RecurringExpensesTable rows={recurringRows} />
        </ErrorBoundary>
        <ErrorBoundary fallbackTitle="Failed to load other expenses">
          <OtherExpensesTable
            transactions={otherTransactions}
            categoryRules={categoryRules}
          />
        </ErrorBoundary>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ErrorBoundary fallbackTitle="Failed to load recent transactions">
          <RecentTransactions transactions={recentTransactions} />
        </ErrorBoundary>
        <ErrorBoundary fallbackTitle="Failed to load upcoming billings">
          <UpcomingBillings />
        </ErrorBoundary>
      </div>
    </div>
  );
}
