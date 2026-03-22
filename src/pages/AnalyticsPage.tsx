import { useMemo } from 'react';
import { format } from 'date-fns';
import { useData } from '@/contexts/DataContext';
import { useFilters } from '@/contexts/FilterContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { getFilteredTransactions, getCategoryBreakdown, getMonthlyAggregates } from '@/lib/data-utils';
import {
  getTopMerchants,
  getCurrencyBreakdown,
  getDailySpending,
  getInstallmentForecasts,
} from '@/lib/chart-utils';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { AnalyticsSkeleton } from '@/components/shared/LoadingSkeleton';
import AnalyticsFilterBar from '@/components/analytics/AnalyticsFilterBar';
import MonthlyCardBreakdown from '@/components/analytics/MonthlyCardBreakdown';
import MonthlySpendingTrend from '@/components/analytics/MonthlySpendingTrend';
import IncomeVsExpenses from '@/components/analytics/IncomeVsExpenses';
import CategoryBreakdown from '@/components/analytics/CategoryBreakdown';
import TopMerchants from '@/components/analytics/TopMerchants';
import CurrencyBreakdownChart from '@/components/analytics/CurrencyBreakdown';
import DailySpending from '@/components/analytics/DailySpending';
import AccountBalanceHistory from '@/components/analytics/AccountBalanceHistory';
import InstallmentObligations from '@/components/analytics/InstallmentObligations';
import CashFlowProjection from '@/components/analytics/CashFlowProjection';

const TOP_MERCHANTS_LIMIT = 10;

export default function AnalyticsPage() {
  usePageTitle('Analytics');
  const { enrichedTransactions, bankData, isLoading, categoryRules } = useData();
  const { filters } = useFilters();

  const filteredTransactions = useMemo(
    () => getFilteredTransactions(enrichedTransactions, filters, categoryRules),
    [enrichedTransactions, filters, categoryRules],
  );

  const monthlyAggregates = useMemo(
    () => getMonthlyAggregates(filteredTransactions, categoryRules),
    [filteredTransactions, categoryRules],
  );

  const categoryBreakdown = useMemo(
    () => getCategoryBreakdown(filteredTransactions, categoryRules),
    [filteredTransactions, categoryRules],
  );

  const topMerchants = useMemo(
    () => getTopMerchants(filteredTransactions, TOP_MERCHANTS_LIMIT),
    [filteredTransactions],
  );

  const currencyBreakdown = useMemo(
    () => getCurrencyBreakdown(filteredTransactions),
    [filteredTransactions],
  );

  const currentMonth = useMemo(() => new Date(), []);

  const dailyAggregates = useMemo(
    () => getDailySpending(filteredTransactions, currentMonth),
    [filteredTransactions, currentMonth],
  );

  const monthLabel = useMemo(
    () => format(currentMonth, 'MMMM yyyy'),
    [currentMonth],
  );

  const installmentForecasts = useMemo(
    () => getInstallmentForecasts(filteredTransactions),
    [filteredTransactions],
  );

  if (isLoading) {
    return <AnalyticsSkeleton />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Analytics</h1>

      {/* Filter Bar */}
      <AnalyticsFilterBar bankData={bankData} />

      <div className="grid grid-cols-1 gap-6">
        {/* Row 1: Stacked Bar by Card + Category Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ErrorBoundary fallbackTitle="Failed to load card breakdown">
            <MonthlyCardBreakdown transactions={filteredTransactions} />
          </ErrorBoundary>
          <ErrorBoundary fallbackTitle="Failed to load category breakdown">
            <CategoryBreakdown categoryBreakdown={categoryBreakdown} />
          </ErrorBoundary>
        </div>

        {/* Row 2: Monthly Spending Trend (full width) */}
        <ErrorBoundary fallbackTitle="Failed to load spending trend">
          <MonthlySpendingTrend monthlyAggregates={monthlyAggregates} />
        </ErrorBoundary>

        {/* Row 3: Income vs Expenses + Top Merchants */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ErrorBoundary fallbackTitle="Failed to load income vs expenses">
            <IncomeVsExpenses monthlyAggregates={monthlyAggregates} />
          </ErrorBoundary>
          <ErrorBoundary fallbackTitle="Failed to load top merchants">
            <TopMerchants merchants={topMerchants} />
          </ErrorBoundary>
        </div>

        {/* Row 4: Daily Spending + Currency Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ErrorBoundary fallbackTitle="Failed to load daily spending">
            <DailySpending
              dailyAggregates={dailyAggregates}
              monthLabel={monthLabel}
            />
          </ErrorBoundary>
          <ErrorBoundary fallbackTitle="Failed to load currency breakdown">
            <CurrencyBreakdownChart currencyBreakdown={currencyBreakdown} />
          </ErrorBoundary>
        </div>

        {/* Row 5: Account Balance History (full width) */}
        <ErrorBoundary fallbackTitle="Failed to load balance history">
          <AccountBalanceHistory bankData={bankData} />
        </ErrorBoundary>

        {/* Row 6: Cash Flow Projection (full width) */}
        <ErrorBoundary fallbackTitle="Failed to load cash flow projection">
          <CashFlowProjection />
        </ErrorBoundary>

        {/* Row 7: Installment Obligations (full width) */}
        <ErrorBoundary fallbackTitle="Failed to load installment obligations">
          <InstallmentObligations installments={installmentForecasts} />
        </ErrorBoundary>
      </div>
    </div>
  );
}
