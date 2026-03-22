import { memo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
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

interface MonthlySpendingTrendProps {
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
            {entry.dataKey === 'totalSpending' ? 'Expenses' : 'Net'}:
          </span>{' '}
          {CURRENCY_FORMATTER.format(entry.value)}
        </p>
      ))}
    </div>
  );
}

function MonthlySpendingTrendInner({
  monthlyAggregates,
}: MonthlySpendingTrendProps) {
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
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart
              data={monthlyAggregates}
              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
            >
              <defs>
                <linearGradient id="spendingTrendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
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
              <Legend
                verticalAlign="top"
                height={36}
                formatter={(value: string) => (
                  <span className="text-xs">
                    {value === 'totalSpending' ? 'Expenses' : 'Net Income'}
                  </span>
                )}
              />
              <Area
                type="monotone"
                dataKey="totalSpending"
                stroke="#ef4444"
                strokeWidth={2}
                fill="url(#spendingTrendGradient)"
                dot={{ r: 4, fill: '#ef4444' }}
                activeDot={{ r: 6 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

const MonthlySpendingTrend = memo(MonthlySpendingTrendInner);
export default MonthlySpendingTrend;
