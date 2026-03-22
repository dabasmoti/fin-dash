import { memo } from 'react';
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { CurrencyBreakdown as CurrencyBreakdownType } from '@/types/bank';

const CURRENCY_COLORS: Record<string, string> = {
  ILS: '#2563eb',
  USD: '#16a34a',
  EUR: '#d97706',
};

const CURRENCY_LABELS: Record<string, string> = {
  ILS: 'ILS (Shekel)',
  USD: 'USD (Dollar)',
  EUR: 'EUR (Euro)',
};

const NUMBER_FORMATTER = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

interface CurrencyBreakdownProps {
  currencyBreakdown: CurrencyBreakdownType[];
}

interface ChartEntry {
  name: string;
  value: number;
  percentage: number;
  color: string;
  currency: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: ChartEntry;
  }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0].payload;
  return (
    <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium">{data.name}</p>
      <p className="text-muted-foreground" dir="ltr">
        {data.currency} {NUMBER_FORMATTER.format(data.value)}
      </p>
      <p className="text-muted-foreground">{data.percentage}%</p>
    </div>
  );
}

function CurrencyBreakdownInner({
  currencyBreakdown,
}: CurrencyBreakdownProps) {
  const chartData: ChartEntry[] = currencyBreakdown.map((entry) => ({
    name: CURRENCY_LABELS[entry.currency] ?? entry.currency,
    value: entry.totalAmount,
    percentage: entry.percentage,
    color: CURRENCY_COLORS[entry.currency] ?? '#6b7280',
    currency: entry.currency,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Currency Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">
            No currency data available
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={0}
                outerRadius={95}
                paddingAngle={2}
                dataKey="value"
                nameKey="name"
              >
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={(value: string) => (
                  <span className="text-xs">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

const CurrencyBreakdownChart = memo(CurrencyBreakdownInner);
export default CurrencyBreakdownChart;
