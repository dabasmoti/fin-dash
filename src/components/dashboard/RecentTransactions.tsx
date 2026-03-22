import { format, parseISO } from 'date-fns';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { EnrichedTransaction } from '@/types/bank';
import { getEffectiveAmount } from '@/lib/data-utils';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';

const CURRENCY_FORMATTER = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

interface RecentTransactionsProps {
  transactions: EnrichedTransaction[];
}

export default function RecentTransactions({
  transactions,
}: RecentTransactionsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Transactions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {transactions.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-4">
            No transactions found
          </p>
        )}
        {transactions.map((txn, index) => {
          const amount = getEffectiveAmount(txn);
          const isExpense = amount < 0;
          return (
            <div
              key={txn.identifier ?? index}
              className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`flex-shrink-0 rounded-full p-1.5 ${
                    isExpense
                      ? 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400'
                      : 'bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400'
                  }`}
                >
                  {isExpense ? (
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowDownLeft className="h-3.5 w-3.5" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {txn.description}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(parseISO(txn.date), 'dd/MM/yyyy')}
                  </p>
                </div>
              </div>
              <span
                className={`text-sm font-semibold whitespace-nowrap ${
                  isExpense ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                }`}
                dir="ltr"
              >
                {isExpense ? '' : '+'}
                {CURRENCY_FORMATTER.format(amount)}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
