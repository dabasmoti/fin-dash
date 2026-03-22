import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { RecurringExpenseRow } from '@/lib/recurring-matcher';
import { getCategoryLabel, getCategoryColor } from '@/constants/categories';
import { getBankDisplayName } from '@/constants/banks';

const CURRENCY_FORMATTER = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  bimonthly: 'Bimonthly',
  quarterly: 'Quarterly',
};

function getMonthlyEquivalent(amount: number, frequency: string): number {
  switch (frequency) {
    case 'bimonthly': return amount / 2;
    case 'quarterly': return amount / 3;
    default: return amount;
  }
}

interface RecurringExpensesTableProps {
  rows: RecurringExpenseRow[];
}

export default function RecurringExpensesTable({
  rows,
}: RecurringExpensesTableProps) {
  const sorted = [...rows].sort(
    (a, b) => b.latestAmount - a.latestAmount,
  );

  const totalMonthly = sorted.reduce(
    (sum, r) => sum + getMonthlyEquivalent(r.latestAmount, r.pattern.frequency),
    0,
  );

  const totalSpend = sorted.reduce(
    (sum, r) => sum + r.totalSpend,
    0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recurring Fixed Expenses</CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">
            No recurring expenses detected
          </p>
        ) : (
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Frequency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r) => {
                const p = r.pattern;
                const categoryColor = p.category
                  ? getCategoryColor(p.category)
                  : '#9e9e9e';
                const categoryLabel = p.category
                  ? getCategoryLabel(p.category, 'en')
                  : 'Other';
                return (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-[220px]" title={p.description}>
                      <div className="truncate">{p.description}</div>
                      <div className="text-xs text-muted-foreground">
                        {getBankDisplayName(p.bankId)} ****{p.accountNumber.slice(-4)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: categoryColor }}
                        />
                        <span className="text-xs">{categoryLabel}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium text-red-600 dark:text-red-400" dir="ltr">
                      {CURRENCY_FORMATTER.format(-r.latestAmount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {FREQUENCY_LABELS[p.frequency] ?? p.frequency}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">
                  Total
                </TableCell>
                <TableCell />
                <TableCell className="text-right font-semibold text-red-600 dark:text-red-400" dir="ltr">
                  <div>{CURRENCY_FORMATTER.format(-totalMonthly)}<span className="text-muted-foreground font-normal text-xs"> /mo</span></div>
                  <div className="text-xs text-muted-foreground font-normal">{CURRENCY_FORMATTER.format(-totalSpend)} total</div>
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
