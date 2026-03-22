import { memo } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Bar,
  BarChart,
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
import type { DailyAggregate } from '@/types/bank';

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

interface DailySpendingProps {
  dailyAggregates: DailyAggregate[];
  monthLabel: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    payload: { date: string; transactionCount: number };
  }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0];
  const dateLabel = format(parseISO(data.payload.date), 'MMM d, yyyy');

  return (
    <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium">{dateLabel}</p>
      <p className="text-muted-foreground" dir="ltr">
        {CURRENCY_FORMATTER.format(data.value)}
      </p>
      <p className="text-muted-foreground">
        {data.payload.transactionCount} transactions
      </p>
    </div>
  );
}

function DailySpendingInner({
  dailyAggregates,
  monthLabel,
}: DailySpendingProps) {
  const chartData = dailyAggregates.map((entry) => ({
    ...entry,
    dayLabel: format(parseISO(entry.date), 'd'),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Daily Spending - {monthLabel}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">
            No daily data available
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={chartData}
              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis
                dataKey="dayLabel"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) =>
                  COMPACT_FORMATTER.format(value)
                }
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="totalSpending"
                fill="#8b5cf6"
                radius={[2, 2, 0, 0]}
                maxBarSize={16}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

const DailySpending = memo(DailySpendingInner);
export default DailySpending;
