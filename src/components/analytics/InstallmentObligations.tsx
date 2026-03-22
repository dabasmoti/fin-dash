import { format, parseISO } from 'date-fns';
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
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { InstallmentForecast } from '@/types/bank';

const CURRENCY_FORMATTER = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

interface InstallmentObligationsProps {
  installments: InstallmentForecast[];
}

export default function InstallmentObligations({
  installments,
}: InstallmentObligationsProps) {
  const totalOutstanding = installments.reduce(
    (sum, inst) => sum + inst.totalRemaining,
    0,
  );

  const totalMonthlyObligation = installments.reduce(
    (sum, inst) => sum + inst.monthlyAmount,
    0,
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Installment Obligations</CardTitle>
          <div className="flex gap-4 text-sm">
            <div className="flex flex-col">
              <span className="text-muted-foreground">Monthly Total</span>
              <span className="font-semibold" dir="ltr">
                {CURRENCY_FORMATTER.format(totalMonthlyObligation)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground">Total Outstanding</span>
              <span className="font-semibold text-destructive" dir="ltr">
                {CURRENCY_FORMATTER.format(totalOutstanding)}
              </span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {installments.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">
            No active installments
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Monthly Amount</TableHead>
                <TableHead>Remaining</TableHead>
                <TableHead>Completion Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {installments.map((inst, index) => (
                <TableRow key={`${inst.description}-${index}`}>
                  <TableCell className="font-medium max-w-[200px] truncate">
                    {inst.description}
                  </TableCell>
                  <TableCell>
                    {inst.currentPayment}/{inst.totalPayments}
                  </TableCell>
                  <TableCell dir="ltr">
                    {CURRENCY_FORMATTER.format(inst.monthlyAmount)}
                  </TableCell>
                  <TableCell dir="ltr" className="text-destructive">
                    {CURRENCY_FORMATTER.format(inst.totalRemaining)}
                  </TableCell>
                  <TableCell>
                    {format(parseISO(inst.estimatedCompletionDate), 'MMM yyyy')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
