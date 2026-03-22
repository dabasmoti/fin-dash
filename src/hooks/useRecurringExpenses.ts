import { useEffect, useMemo, useState } from 'react';
import type { EnrichedTransaction, RecurringPatternForMatching } from '@/types/bank';
import { fetchRecurringPatternsForMatching } from '@/lib/cashflow-utils';
import { splitExpensesByRecurrence, type ExpenseSplit } from '@/lib/recurring-matcher';

interface UseRecurringExpensesResult extends ExpenseSplit {
  isLoading: boolean;
}

export function useRecurringExpenses(
  filteredTransactions: EnrichedTransaction[],
  categoryRules?: Map<string, string>,
): UseRecurringExpensesResult {
  const [patterns, setPatterns] = useState<RecurringPatternForMatching[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchRecurringPatternsForMatching()
      .then(setPatterns)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const split = useMemo(
    () => splitExpensesByRecurrence(filteredTransactions, patterns, categoryRules),
    [filteredTransactions, patterns, categoryRules],
  );

  return { ...split, isLoading };
}
