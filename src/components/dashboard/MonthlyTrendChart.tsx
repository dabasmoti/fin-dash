import { memo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
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

interface MonthlyTrendChartProps {
  monthlyAggregates: MonthlyAggregate[];
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    dataKey: string;
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
          {entry.dataKey === 'totalSpending' ? 'Expenses' : 'Income'}:{' '}
          {CURRENCY_FORMATTER.format(entry.value)}
        </p>
      ))}
    </div>
  );
}

function MonthlyTrendChartInner({
  monthlyAggregates,
}: MonthlyTrendChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Monthly Spending Trend</CardTitle>
      </CardHeader>
      <CardContent>
        {monthlyAggregates.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">
            No monthly data available
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart
              data={monthlyAggregates}
              margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
            >
              <defs>
                <linearGradient id="spendingGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05} />
                </linearGradient>
              </defs>
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
              <Area
                type="monotone"
                dataKey="totalIncome"
                stroke="#22c55e"
                strokeWidth={2}
                fill="url(#incomeGradient)"
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Area
                type="monotone"
                dataKey="totalSpending"
                stroke="#ef4444"
                strokeWidth={2}
                fill="url(#spendingGradient)"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

const MonthlyTrendChart = memo(MonthlyTrendChartInner);
export default MonthlyTrendChart;
