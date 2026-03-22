import { useMemo, useState, useCallback } from 'react';
import { parseISO, format } from 'date-fns';
import { useData } from '@/contexts/DataContext';
import { useFilters } from '@/contexts/FilterContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { getFilteredTransactions, getEffectiveAmount } from '@/lib/data-utils';
import { getEffectiveCategory } from '@/lib/category-classifier';
import { getBankDisplayName } from '@/constants/banks';
import { exportToCSV } from '@/lib/export-utils';
import type { EnrichedTransaction, TransactionStatus } from '@/types/bank';
import { TransactionsSkeleton } from '@/components/shared/LoadingSkeleton';
import { TooltipProvider } from '@/components/ui/tooltip';
import TransactionFilters from '@/components/transactions/TransactionFilters';
import TransactionDataTable from '@/components/transactions/TransactionDataTable';
import TransactionDetailSheet from '@/components/transactions/TransactionDetailSheet';

export default function TransactionsPage() {
  usePageTitle('Transactions');
  const { enrichedTransactions, isLoading, categoryRules, setCategoryRule, clearCategoryRule } = useData();
  const { filters } = useFilters();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TransactionStatus | 'all'>(
    'all',
  );
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [cardFilter, setCardFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [selectedTransaction, setSelectedTransaction] =
    useState<EnrichedTransaction | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const globalFilteredTransactions = useMemo(
    () => getFilteredTransactions(enrichedTransactions, filters, categoryRules),
    [enrichedTransactions, filters, categoryRules],
  );

  const availableCards = useMemo(() => {
    const seen = new Map<string, string>();
    for (const txn of globalFilteredTransactions) {
      const key = `${txn.bankId}:${txn.accountNumber}`;
      if (!seen.has(key)) {
        const suffix = txn.accountNumber.slice(-4);
        seen.set(key, `${getBankDisplayName(txn.bankId)} ...${suffix}`);
      }
    }
    return Array.from(seen.entries()).map(([id, label]) => ({ id, label }));
  }, [globalFilteredTransactions]);

  const localFilteredTransactions = useMemo(() => {
    let result = globalFilteredTransactions;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((txn) => {
        const matchesDescription = txn.description
          .toLowerCase()
          .includes(query);
        const matchesMemo = txn.memo?.toLowerCase().includes(query) ?? false;
        return matchesDescription || matchesMemo;
      });
    }

    if (cardFilter !== 'all') {
      result = result.filter(
        (txn) => `${txn.bankId}:${txn.accountNumber}` === cardFilter,
      );
    }

    if (dateFrom) {
      const fromDate = parseISO(dateFrom);
      result = result.filter((txn) => parseISO(txn.date) >= fromDate);
    }

    if (dateTo) {
      const toDate = parseISO(dateTo);
      toDate.setHours(23, 59, 59, 999);
      result = result.filter((txn) => parseISO(txn.date) <= toDate);
    }

    if (statusFilter !== 'all') {
      result = result.filter((txn) => txn.status === statusFilter);
    }

    if (categoryFilter !== 'all') {
      result = result.filter((txn) => getEffectiveCategory(txn, categoryRules) === categoryFilter);
    }

    return result;
  }, [globalFilteredTransactions, searchQuery, cardFilter, dateFrom, dateTo, statusFilter, categoryFilter, categoryRules]);

  const handleRowClick = useCallback((transaction: EnrichedTransaction) => {
    setSelectedTransaction(transaction);
    setSheetOpen(true);
  }, []);

  const handleResetFilters = useCallback(() => {
    setSearchQuery('');
    setStatusFilter('all');
    setCategoryFilter('all');
    setCardFilter('all');
    setDateFrom('');
    setDateTo('');
  }, []);

  const handleExport = useCallback(() => {
    exportToCSV(localFilteredTransactions);
  }, [localFilteredTransactions]);

  const subtotals = useMemo(() => {
    let income = 0;
    let expenses = 0;
    for (const txn of localFilteredTransactions) {
      const amount = getEffectiveAmount(txn);
      if (amount >= 0) {
        income += amount;
      } else {
        expenses += Math.abs(amount);
      }
    }
    let minDate: string | null = null;
    let maxDate: string | null = null;
    for (const txn of localFilteredTransactions) {
      if (!minDate || txn.date < minDate) minDate = txn.date;
      if (!maxDate || txn.date > maxDate) maxDate = txn.date;
    }

    return {
      income: Math.round(income * 100) / 100,
      expenses: Math.round(expenses * 100) / 100,
      net: Math.round((income - expenses) * 100) / 100,
      dateRange: minDate && maxDate
        ? `${format(parseISO(minDate), 'dd/MM/yy')} - ${format(parseISO(maxDate), 'dd/MM/yy')}`
        : null,
    };
  }, [localFilteredTransactions]);


  if (isLoading) {
    return <TransactionsSkeleton />;
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Transactions</h1>

        <TransactionFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          categoryFilter={categoryFilter}
          onCategoryChange={setCategoryFilter}
          cardFilter={cardFilter}
          onCardChange={setCardFilter}
          dateFrom={dateFrom}
          onDateFromChange={setDateFrom}
          dateTo={dateTo}
          onDateToChange={setDateTo}
          availableCards={availableCards}
          onReset={handleResetFilters}
          onExport={handleExport}
          transactionCount={localFilteredTransactions.length}
          totalCount={globalFilteredTransactions.length}
        />

        <div className="flex items-center gap-6 rounded-md border bg-muted/40 px-4 py-2.5 text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          {subtotals.dateRange && (
            <span className="text-muted-foreground">{subtotals.dateRange}</span>
          )}
          <span className="text-green-600 dark:text-green-400 font-medium">
            +{subtotals.income.toLocaleString('he-IL', { style: 'currency', currency: 'ILS' })}
          </span>
          <span className="text-red-600 dark:text-red-400 font-medium">
            -{subtotals.expenses.toLocaleString('he-IL', { style: 'currency', currency: 'ILS' })}
          </span>
          <span className={`font-semibold ${subtotals.net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            Net: {subtotals.net.toLocaleString('he-IL', { style: 'currency', currency: 'ILS' })}
          </span>
        </div>

        <TransactionDataTable
          data={localFilteredTransactions}
          onRowClick={handleRowClick}
        />

        <TransactionDetailSheet
          transaction={selectedTransaction}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          categoryRules={categoryRules}
          onSetCategory={setCategoryRule}
          onClearCategory={clearCategoryRule}
        />
      </div>
    </TooltipProvider>
  );
}
