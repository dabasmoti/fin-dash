import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useFilters } from '@/contexts/FilterContext';
import type { BankScraperData, CurrencyCode } from '@/types/bank';
import { CATEGORY_DEFINITIONS } from '@/lib/category-classifier';
import { RotateCcw, Search } from 'lucide-react';
import DateRangePicker from '@/components/shared/DateRangePicker';

interface AnalyticsFilterBarProps {
  bankData: BankScraperData[];
}

export default function AnalyticsFilterBar({ bankData }: AnalyticsFilterBarProps) {
  const { filters, dispatch } = useFilters();

  const accounts = useMemo(() => {
    const result: { id: string; bankId: string; label: string }[] = [];
    for (const bank of bankData) {
      for (const account of bank.result.accounts) {
        result.push({
          id: account.accountNumber,
          bankId: bank.bankId,
          label: `****${account.accountNumber}`,
        });
      }
    }
    return result;
  }, [bankData]);

  const categories = useMemo(() => {
    return Object.entries(CATEGORY_DEFINITIONS)
      .filter(([id]) => id !== 'other' && id !== 'card_payment')
      .map(([id, def]) => ({ id, label: def.hebrewLabel, color: def.color }));
  }, []);

  const toggleAccount = (accountId: string) => {
    const current = filters.selectedAccountIds;
    const next = current.includes(accountId)
      ? current.filter((id) => id !== accountId)
      : [...current, accountId];
    dispatch({ type: 'SET_ACCOUNTS', payload: next });
  };

  const toggleCategory = (categoryId: string) => {
    const current = filters.selectedCategories;
    const next = current.includes(categoryId)
      ? current.filter((id) => id !== categoryId)
      : [...current, categoryId];
    dispatch({ type: 'SET_CATEGORIES', payload: next });
  };

  const setCurrency = (currency: CurrencyCode | 'all') => {
    dispatch({ type: 'SET_CURRENCY', payload: currency });
  };

  const setSearch = (query: string) => {
    dispatch({ type: 'SET_SEARCH', payload: query });
  };

  const setDateRange = (range: { from: Date; to: Date }) => {
    dispatch({ type: 'SET_DATE_RANGE', payload: range });
  };

  const resetFilters = () => {
    dispatch({ type: 'RESET' });
  };

  const hasActiveFilters =
    filters.selectedAccountIds.length > 0 ||
    filters.selectedCategories.length > 0 ||
    filters.selectedCurrency !== 'all' ||
    filters.searchQuery.length > 0;

  return (
    <Card>
      <CardContent className="pt-4 space-y-4">
        {/* Row 1: Date range + Search + Currency + Reset */}
        <div className="flex flex-wrap items-center gap-3">
          <DateRangePicker
            from={filters.dateRange.from}
            to={filters.dateRange.to}
            onChange={setDateRange}
            compact
          />
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search merchant..."
              className="h-8 pl-8 text-xs"
              value={filters.searchQuery}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1 rounded-lg border p-0.5">
            {(['all', 'ILS', 'USD', 'EUR'] as const).map((currency) => (
              <button
                key={currency}
                onClick={() => setCurrency(currency)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  filters.selectedCurrency === currency
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {currency === 'all' ? 'All' : currency}
              </button>
            ))}
          </div>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={resetFilters}
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </Button>
          )}
        </div>

        {/* Row 2: Account chips */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Accounts:</span>
          {accounts.map((account) => {
            const isSelected = filters.selectedAccountIds.includes(account.id);
            return (
              <Badge
                key={account.id}
                variant={isSelected ? 'default' : 'outline'}
                className="cursor-pointer text-xs"
                onClick={() => toggleAccount(account.id)}
              >
                {account.label}
              </Badge>
            );
          })}
          {accounts.length === 0 && (
            <span className="text-xs text-muted-foreground">No accounts</span>
          )}
        </div>

        {/* Row 3: Category chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Categories:</span>
          {categories.map((cat) => {
            const isSelected = filters.selectedCategories.includes(cat.id);
            return (
              <Badge
                key={cat.id}
                variant={isSelected ? 'default' : 'outline'}
                className="cursor-pointer text-xs"
                style={isSelected ? { backgroundColor: cat.color, borderColor: cat.color } : {}}
                onClick={() => toggleCategory(cat.id)}
              >
                {cat.label}
              </Badge>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

