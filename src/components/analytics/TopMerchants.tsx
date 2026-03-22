import { memo } from 'react';
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
import type { MerchantSummary } from '@/types/bank';

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

const BAR_COLOR = '#6366f1';

interface TopMerchantsProps {
  merchants: MerchantSummary[];
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    payload: { merchantName: string; transactionCount: number };
  }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0];
  return (
    <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium">{data.payload.merchantName}</p>
      <p className="text-muted-foreground" dir="ltr">
        {CURRENCY_FORMATTER.format(data.value)}
      </p>
      <p className="text-muted-foreground">
        {data.payload.transactionCount} transactions
      </p>
    </div>
  );
}

function TopMerchantsInner({ merchants }: TopMerchantsProps) {
  // Reverse so the largest bar appears at the top in horizontal layout
  const chartData = [...merchants].reverse();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Top Merchants</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">
            No merchant data available
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 20, left: 5, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) =>
                  COMPACT_FORMATTER.format(value)
                }
              />
              <YAxis
                type="category"
                dataKey="merchantName"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={100}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="totalAmount"
                fill={BAR_COLOR}
                radius={[0, 4, 4, 0]}
                maxBarSize={24}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

const TopMerchants = memo(TopMerchantsInner);
export default TopMerchants;
