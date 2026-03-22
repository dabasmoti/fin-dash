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
import type { CategorySummary } from '@/types/bank';
import { CATEGORIES } from '@/constants/categories';

const DEFAULT_COLOR = '#9e9e9e';

/**
 * Resolve category color from the Hebrew label stored on transactions.
 * Categories are stored as Hebrew strings (e.g. "מזון"), so we look up
 * the matching CategoryDefinition by its labelHe.
 */
function getCategoryColorByLabel(hebrewLabel: string): string {
  const match = CATEGORIES.find((cat) => cat.labelHe === hebrewLabel);
  return match?.color ?? DEFAULT_COLOR;
}

function getCategoryEnglishLabel(hebrewLabel: string): string {
  const match = CATEGORIES.find((cat) => cat.labelHe === hebrewLabel);
  return match?.labelEn ?? hebrewLabel;
}

const CURRENCY_FORMATTER = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

interface SpendingCategoryChartProps {
  categoryBreakdown: CategorySummary[];
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: {
      name: string;
      value: number;
      percentage: number;
    };
  }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0].payload;
  return (
    <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium">{data.name}</p>
      <p className="text-muted-foreground" dir="ltr">
        {CURRENCY_FORMATTER.format(data.value)}
      </p>
      <p className="text-muted-foreground">{data.percentage}%</p>
    </div>
  );
}

function SpendingCategoryChartInner({
  categoryBreakdown,
}: SpendingCategoryChartProps) {
  const chartData = categoryBreakdown.map((entry) => ({
    name: getCategoryEnglishLabel(entry.category),
    value: entry.totalAmount,
    percentage: entry.percentage,
    color: getCategoryColorByLabel(entry.category),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Spending by Category</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">
            No spending data available
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
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

const SpendingCategoryChart = memo(SpendingCategoryChartInner);
export default SpendingCategoryChart;
