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
const MAX_CATEGORIES = 8;

function getCategoryColor(categoryId: string): string {
  const match = CATEGORIES.find((cat) => cat.id === categoryId);
  return match?.color ?? DEFAULT_COLOR;
}

function getCategoryEnglishLabel(categoryId: string): string {
  const match = CATEGORIES.find((cat) => cat.id === categoryId);
  return match?.labelEn ?? categoryId;
}

const CURRENCY_FORMATTER = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

interface CategoryBreakdownProps {
  categoryBreakdown: CategorySummary[];
}

interface ChartEntry {
  name: string;
  value: number;
  percentage: number;
  color: string;
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
        {CURRENCY_FORMATTER.format(data.value)}
      </p>
      <p className="text-muted-foreground">{data.percentage}%</p>
    </div>
  );
}

function CategoryBreakdownInner({
  categoryBreakdown,
}: CategoryBreakdownProps) {
  // Take top N categories and aggregate the rest as "Other"
  const topCategories = categoryBreakdown.slice(0, MAX_CATEGORIES);
  const restCategories = categoryBreakdown.slice(MAX_CATEGORIES);

  const chartData: ChartEntry[] = topCategories.map((entry) => ({
    name: getCategoryEnglishLabel(entry.category),
    value: entry.totalAmount,
    percentage: entry.percentage,
    color: getCategoryColor(entry.category),
  }));

  if (restCategories.length > 0) {
    const otherTotal = restCategories.reduce(
      (sum, cat) => sum + cat.totalAmount,
      0,
    );
    const otherPercentage = restCategories.reduce(
      (sum, cat) => sum + cat.percentage,
      0,
    );
    chartData.push({
      name: 'Other',
      value: Math.round(otherTotal * 100) / 100,
      percentage: Math.round(otherPercentage * 100) / 100,
      color: '#9e9e9e',
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Category Breakdown</CardTitle>
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
                innerRadius={55}
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
                height={48}
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

const CategoryBreakdown = memo(CategoryBreakdownInner);
export default CategoryBreakdown;
