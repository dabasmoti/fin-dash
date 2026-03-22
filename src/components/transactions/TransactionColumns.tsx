import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import type { ColumnDef } from '@tanstack/react-table';
import { X } from 'lucide-react';
import type { EnrichedTransaction } from '@/types/bank';
import { getEffectiveAmount } from '@/lib/data-utils';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CATEGORIES, getCategoryLabel, getCategoryColor } from '@/constants/categories';
import { getEffectiveCategory } from '@/lib/category-classifier';

const CURRENCY_FORMATTERS: Record<string, Intl.NumberFormat> = {
  ILS: new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }),
  USD: new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }),
  EUR: new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }),
};

function formatCurrency(amount: number, currency: string): string {
  const formatter = CURRENCY_FORMATTERS[currency];
  if (formatter) {
    return formatter.format(amount);
  }
  return `${amount.toFixed(2)} ${currency}`;
}

function maskAccountNumber(accountNumber: string): string {
  if (accountNumber.length <= 4) return accountNumber;
  const visibleSuffix = accountNumber.slice(-4);
  return `****${visibleSuffix}`;
}

interface CategoryCellProps {
  txn: EnrichedTransaction;
  categoryRules: Map<string, string>;
  onSetCategory: (description: string, categoryId: string) => void;
  onClearCategory: (description: string) => void;
}

function CategoryCell({ txn, categoryRules, onSetCategory, onClearCategory }: CategoryCellProps) {
  const [open, setOpen] = useState(false);
  const effectiveCategory = getEffectiveCategory(txn, categoryRules);
  const hasUserRule = categoryRules.has(txn.description);
  const color = getCategoryColor(effectiveCategory);
  const label = getCategoryLabel(effectiveCategory, 'he');

  const handleSelect = (categoryId: string) => {
    onSetCategory(txn.description, categoryId);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClearCategory(txn.description);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <span
            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="text-xs font-medium">{label}</span>
          {hasUserRule && (
            <span className="text-[10px] text-muted-foreground">(manual)</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 p-0"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <ScrollArea className="h-72">
          <div className="p-1">
            {hasUserRule && (
              <button
                type="button"
                className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded-sm hover:bg-muted transition-colors text-red-600 dark:text-red-400"
                onClick={handleClear}
              >
                <X className="w-3 h-3" />
                Clear manual override
              </button>
            )}
            {CATEGORIES.map((cat) => {
              const isActive = effectiveCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  className={`flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded-sm transition-colors ${
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-muted'
                  }`}
                  onClick={() => handleSelect(cat.id)}
                >
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span>{cat.labelHe}</span>
                  <span className="text-muted-foreground ml-auto">{cat.labelEn}</span>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export function getTransactionColumns(
  onSetCategory: (description: string, categoryId: string) => void,
  onClearCategory: (description: string) => void,
  categoryRules: Map<string, string>,
): ColumnDef<EnrichedTransaction>[] {
  return [
    {
      accessorKey: 'date',
      header: 'Date',
      cell: ({ row }) => {
        const dateStr = row.getValue<string>('date');
        return format(parseISO(dateStr), 'dd/MM/yyyy');
      },
      sortingFn: (rowA, rowB) => {
        const dateA = new Date(rowA.original.date).getTime();
        const dateB = new Date(rowB.original.date).getTime();
        return dateA - dateB;
      },
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => {
        const description = row.original.description;
        const memo = row.original.memo;
        const hasMemo = memo && memo.trim().length > 0;

        if (hasMemo) {
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help border-b border-dotted border-muted-foreground/40 max-w-[200px] truncate block">
                  {description}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>{memo}</p>
              </TooltipContent>
            </Tooltip>
          );
        }

        return (
          <span className="max-w-[200px] truncate block">{description}</span>
        );
      },
    },
    {
      accessorKey: 'originalAmount',
      header: 'Amount',
      cell: ({ row }) => {
        const amount = getEffectiveAmount(row.original);
        const currency = row.original.originalCurrency;
        const isNegative = amount < 0;

        return (
          <span
            className={
              isNegative
                ? 'text-red-600 dark:text-red-400'
                : 'text-green-600 dark:text-green-400'
            }
            dir="ltr"
          >
            {isNegative ? '' : '+'}
            {formatCurrency(amount, currency)}
          </span>
        );
      },
    },
    {
      accessorKey: 'originalCurrency',
      header: 'Currency',
      cell: ({ row }) => row.original.originalCurrency,
      enableSorting: false,
    },
    {
      accessorKey: 'category',
      header: 'Category',
      cell: ({ row }) => (
        <CategoryCell
          txn={row.original}
          categoryRules={categoryRules}
          onSetCategory={onSetCategory}
          onClearCategory={onClearCategory}
        />
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.original.status;
        const isCompleted = status === 'completed';
        return (
          <Badge
            variant="outline"
            className={
              isCompleted
                ? 'border-green-300 text-green-700 dark:border-green-700 dark:text-green-400'
                : 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400'
            }
          >
            {isCompleted ? 'Completed' : 'Pending'}
          </Badge>
        );
      },
      enableSorting: false,
    },
    {
      accessorKey: 'accountNumber',
      header: 'Account',
      cell: ({ row }) => {
        const bankName = row.original.bankDisplayName;
        const accountNumber = row.original.accountNumber;
        return (
          <span className="text-xs">
            {bankName} {maskAccountNumber(accountNumber)}
          </span>
        );
      },
      enableSorting: false,
    },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }) => {
        const txn = row.original;
        if (txn.type === 'installments' && txn.installments) {
          return (
            <Badge variant="outline">
              Installments {txn.installments.number}/{txn.installments.total}
            </Badge>
          );
        }
        return (
          <Badge variant="ghost" className="text-muted-foreground">
            Normal
          </Badge>
        );
      },
      enableSorting: false,
    },
  ];
}
