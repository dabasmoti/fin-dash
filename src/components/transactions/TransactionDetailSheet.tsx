import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { X } from 'lucide-react';
import type { EnrichedTransaction } from '@/types/bank';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
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
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
  USD: new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
  EUR: new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
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

interface DetailRowProps {
  label: string;
  children: React.ReactNode;
}

function DetailRow({ label, children }: DetailRowProps) {
  return (
    <div className="flex justify-between items-start gap-4 py-2">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-right">{children}</span>
    </div>
  );
}

interface CategorySelectorProps {
  txn: EnrichedTransaction;
  categoryRules: Map<string, string>;
  onSetCategory: (description: string, categoryId: string) => void;
  onClearCategory: (description: string) => void;
}

function CategorySelector({ txn, categoryRules, onSetCategory, onClearCategory }: CategorySelectorProps) {
  const [open, setOpen] = useState(false);
  const effectiveCategory = getEffectiveCategory(txn, categoryRules);
  const hasUserRule = categoryRules.has(txn.description);
  const color = getCategoryColor(effectiveCategory);
  const hebrewLabel = getCategoryLabel(effectiveCategory, 'he');
  const englishLabel = getCategoryLabel(effectiveCategory, 'en');

  const handleSelect = (categoryId: string) => {
    onSetCategory(txn.description, categoryId);
    setOpen(false);
  };

  const handleClear = () => {
    onClearCategory(txn.description);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
        >
          <span
            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: color }}
          />
          <Badge variant="secondary">
            {hebrewLabel} / {englishLabel}
          </Badge>
          {hasUserRule && (
            <span className="text-[10px] text-muted-foreground">(manual)</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="end">
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

interface TransactionDetailSheetProps {
  transaction: EnrichedTransaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryRules: Map<string, string>;
  onSetCategory: (description: string, categoryId: string) => void;
  onClearCategory: (description: string) => void;
}

export default function TransactionDetailSheet({
  transaction,
  open,
  onOpenChange,
  categoryRules,
  onSetCategory,
  onClearCategory,
}: TransactionDetailSheetProps) {
  if (!transaction) return null;

  const isExpense = transaction.originalAmount < 0;
  const hasInstallments =
    transaction.type === 'installments' && transaction.installments;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Transaction Details</SheetTitle>
          <SheetDescription>{transaction.description}</SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-6">
          {/* Amount highlight */}
          <div className="text-center py-4">
            <p
              className={`text-3xl font-bold ${
                isExpense
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-green-600 dark:text-green-400'
              }`}
              dir="ltr"
            >
              {isExpense ? '' : '+'}
              {formatCurrency(
                transaction.originalAmount,
                transaction.originalCurrency,
              )}
            </p>
            {transaction.originalCurrency !== 'ILS' &&
              transaction.chargedCurrency === 'ILS' && (
                <p className="text-sm text-muted-foreground mt-1" dir="ltr">
                  Charged: {formatCurrency(transaction.chargedAmount, 'ILS')}
                </p>
              )}
          </div>

          <Separator />

          {/* Basic details */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Details</h3>
            <DetailRow label="Date">
              {format(parseISO(transaction.date), 'dd/MM/yyyy')}
            </DetailRow>
            <DetailRow label="Processed Date">
              {format(parseISO(transaction.processedDate), 'dd/MM/yyyy')}
            </DetailRow>
            <DetailRow label="Status">
              <Badge
                variant="outline"
                className={
                  transaction.status === 'completed'
                    ? 'border-green-300 text-green-700 dark:border-green-700 dark:text-green-400'
                    : 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400'
                }
              >
                {transaction.status === 'completed' ? 'Completed' : 'Pending'}
              </Badge>
            </DetailRow>
            <DetailRow label="Category">
              <CategorySelector
                txn={transaction}
                categoryRules={categoryRules}
                onSetCategory={onSetCategory}
                onClearCategory={onClearCategory}
              />
            </DetailRow>
            <DetailRow label="Currency">
              {transaction.originalCurrency}
            </DetailRow>
            {transaction.memo && transaction.memo.trim().length > 0 && (
              <DetailRow label="Memo">{transaction.memo}</DetailRow>
            )}
          </div>

          <Separator />

          {/* Account info */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Account</h3>
            <DetailRow label="Bank">{transaction.bankDisplayName}</DetailRow>
            <DetailRow label="Account Number">
              {transaction.accountNumber}
            </DetailRow>
          </div>

          {/* Installment details */}
          {hasInstallments && transaction.installments && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold mb-2">
                  Installment Details
                </h3>
                <DetailRow label="Payment">
                  {transaction.installments.number} of{' '}
                  {transaction.installments.total}
                </DetailRow>
                <DetailRow label="Monthly Amount">
                  <span dir="ltr">
                    {formatCurrency(
                      Math.abs(transaction.originalAmount),
                      transaction.originalCurrency,
                    )}
                  </span>
                </DetailRow>
                <DetailRow label="Remaining Payments">
                  {transaction.installments.total -
                    transaction.installments.number}
                </DetailRow>
                <DetailRow label="Remaining Total">
                  <span dir="ltr">
                    {formatCurrency(
                      Math.abs(transaction.originalAmount) *
                        (transaction.installments.total -
                          transaction.installments.number),
                      transaction.originalCurrency,
                    )}
                  </span>
                </DetailRow>
              </div>
            </>
          )}

          {/* Transaction ID */}
          {transaction.identifier && (
            <>
              <Separator />
              <DetailRow label="Transaction ID">
                <span className="font-mono text-xs">
                  {String(transaction.identifier)}
                </span>
              </DetailRow>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
