import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { CreditCard } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getBankColor, getBankDisplayName } from '@/constants/banks';
import { fetchUpcomingBillings, type UpcomingCardBilling } from '@/services/api-client';

const CURRENCY_FORMATTER = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function UpcomingBillings() {
  const [billings, setBillings] = useState<UpcomingCardBilling[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUpcomingBillings()
      .then(setBillings)
      .catch((err) => setError(err.message));
  }, []);

  if (error || billings.length === 0) return null;

  const total = billings.reduce((sum, b) => sum + b.amount, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="size-4" />
          Upcoming Card Charges
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {billings.map((b) => {
          const color = getBankColor(b.bankId);
          const name = getBankDisplayName(b.bankId);
          return (
            <div
              key={`${b.bankId}-${b.accountNumber}`}
              className="flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="size-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {name} ...{b.accountNumber.slice(-4)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(parseISO(b.chargeDate), 'dd/MM/yyyy')}
                  </p>
                </div>
              </div>
              <span className="text-sm font-semibold text-red-600 dark:text-red-400 whitespace-nowrap" dir="ltr">
                {CURRENCY_FORMATTER.format(b.amount)}
              </span>
            </div>
          );
        })}

        <div className="border-t pt-2 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-sm font-bold text-red-600 dark:text-red-400" dir="ltr">
            {CURRENCY_FORMATTER.format(total)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
