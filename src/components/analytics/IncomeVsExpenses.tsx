import { memo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { MonthlyAggregate } from '@/types/bank';

const CURRENCY_FORMATTER = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const COMPACT_FORMATTER = new Intl.NumberFormat('he-IL', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

interface IncomeVsExpensesProps {
  monthlyAggregates: MonthlyAggregate[];
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    dataKey: string;
    color: string;
  }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry) => (
        <p
          key={entry.dataKey}
          className="text-muted-foreground"
          dir="ltr"
        >
          <span style={{ color: entry.color }}>
            {entry.dataKey === 'totalIncome' ? 'Income' : 'Expenses'}:
          </span>{' '}
          {CURRENCY_FORMATTER.format(entry.value)}
        </p>
      ))}
    </div>
  );
}

function IncomeVsExpensesInner({
  monthlyAggregates,
}: IncomeVsExpensesProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Income vs Expenses</CardTitle>
      </CardHeader>
      <CardContent>
        {monthlyAggregates.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">
            No data available
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={monthlyAggregates}
              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis
                dataKey="monthLabel"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) =>
                  COMPACT_FORMATTER.format(value)
                }
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="top"
                height={36}
                formatter={(value: string) => (
                  <span className="text-xs">
                    {value === 'totalIncome' ? 'Income' : 'Expenses'}
                  </span>
                )}
              />
              <Bar
                dataKey="totalIncome"
                fill="#22c55e"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
              <Bar
                dataKey="totalSpending"
                fill="#ef4444"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

const IncomeVsExpenses = memo(IncomeVsExpensesInner);
export default IncomeVsExpenses;
