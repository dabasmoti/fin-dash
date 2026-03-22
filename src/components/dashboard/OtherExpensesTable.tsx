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
import type { EnrichedTransaction } from '@/types/bank';
import { getEffectiveAmount } from '@/lib/data-utils';
import { getEffectiveCategory } from '@/lib/category-classifier';
import { getCategoryLabel, getCategoryColor } from '@/constants/categories';
import { getBankDisplayName } from '@/constants/banks';

const CURRENCY_FORMATTER = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

interface CategoryCardRow {
  category: string;
  bankId: string;
  accountNumber: string;
  count: number;
  total: number;
  percentage: number;
}

function aggregateByCategoryAndCard(
  transactions: EnrichedTransaction[],
  categoryRules?: Map<string, string>,
): CategoryCardRow[] {
  const map = new Map<string, { category: string; bankId: string; accountNumber: string; count: number; total: number }>();

  for (const txn of transactions) {
    const amount = Math.abs(getEffectiveAmount(txn));
    const category = getEffectiveCategory(txn, categoryRules);
    const key = `${category}|${txn.bankId}|${txn.accountNumber}`;
    const entry = map.get(key) ?? { category, bankId: txn.bankId, accountNumber: txn.accountNumber, count: 0, total: 0 };
    entry.count += 1;
    entry.total += amount;
    map.set(key, entry);
  }

  const grandTotal = Array.from(map.values()).reduce((s, e) => s + e.total, 0);

  return Array.from(map.values())
    .map((data) => ({
      category: data.category,
      bankId: data.bankId,
      accountNumber: data.accountNumber,
      count: data.count,
      total: Math.round(data.total * 100) / 100,
      percentage: grandTotal > 0
        ? Math.round((data.total / grandTotal) * 10000) / 100
        : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

interface OtherExpensesTableProps {
  transactions: EnrichedTransaction[];
  categoryRules?: Map<string, string>;
}

export default function OtherExpensesTable({
  transactions,
  categoryRules,
}: OtherExpensesTableProps) {
  const rows = aggregateByCategoryAndCard(transactions, categoryRules);
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  const totalCount = rows.reduce((s, r) => s + r.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Other Expenses</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">
            No other expenses found
          </p>
        ) : (
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.category}|${row.bankId}|${row.accountNumber}`}>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: getCategoryColor(row.category) }}
                      />
                      <span className="text-xs">
                        {getCategoryLabel(row.category, 'en')}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {getBankDisplayName(row.bankId)} ****{row.accountNumber.slice(-4)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {row.count}
                  </TableCell>
                  <TableCell className="text-right font-medium text-red-600 dark:text-red-400" dir="ltr">
                    {CURRENCY_FORMATTER.format(-row.total)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground text-xs">
                    {row.percentage}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {totalCount}
                </TableCell>
                <TableCell className="text-right font-semibold text-red-600 dark:text-red-400" dir="ltr">
                  {CURRENCY_FORMATTER.format(-grandTotal)}
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
