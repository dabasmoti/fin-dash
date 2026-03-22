import { Search, RotateCcw, Download } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CATEGORIES } from '@/constants/categories';
import type { TransactionStatus } from '@/types/bank';
import DateRangePicker from '@/components/shared/DateRangePicker';

interface CardOption {
  id: string;
  label: string;
}

interface TransactionFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: TransactionStatus | 'all';
  onStatusChange: (value: TransactionStatus | 'all') => void;
  categoryFilter: string;
  onCategoryChange: (value: string) => void;
  cardFilter: string;
  onCardChange: (value: string) => void;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
  availableCards: CardOption[];
  onReset: () => void;
  onExport: () => void;
  transactionCount: number;
  totalCount: number;
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function TransactionFilters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  categoryFilter,
  onCategoryChange,
  cardFilter,
  onCardChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  availableCards,
  onReset,
  onExport,
  transactionCount,
  totalCount,
}: TransactionFiltersProps) {
  const hasActiveFilters =
    searchQuery.length > 0 ||
    statusFilter !== 'all' ||
    categoryFilter !== 'all' ||
    cardFilter !== 'all' ||
    dateFrom.length > 0 ||
    dateTo.length > 0;

  const fromDate = dateFrom ? new Date(dateFrom) : new Date(new Date().setMonth(new Date().getMonth() - 1));
  const toDate = dateTo ? new Date(dateTo) : new Date();

  const handleRangeChange = (range: { from: Date; to: Date }) => {
    onDateFromChange(formatDateInput(range.from));
    onDateToChange(formatDateInput(range.to));
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Row 1: Date range + Search */}
      <div className="flex flex-wrap items-center gap-3">
        <DateRangePicker
          from={fromDate}
          to={toDate}
          onChange={handleRangeChange}
        />

        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search description or memo..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {/* Row 2: Filters + Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={cardFilter} onValueChange={onCardChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Card / Account" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Cards</SelectItem>
            {availableCards.map((card) => (
              <SelectItem key={card.id} value={card.id}>
                {card.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(value) =>
            onStatusChange(value as TransactionStatus | 'all')
          }
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={onCategoryChange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.labelHe}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={onReset}>
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
        )}

        <div className="flex-1" />

        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {transactionCount === totalCount
            ? `${transactionCount} transactions`
            : `${transactionCount} of ${totalCount} transactions`}
        </span>

        <Button variant="outline" size="sm" onClick={onExport}>
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>
    </div>
  );
}
