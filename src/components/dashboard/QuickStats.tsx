import {
  Card,
  CardContent,
} from '@/components/ui/card';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  CalendarDays,
} from 'lucide-react';

const CURRENCY_FORMATTER = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

interface QuickStatsProps {
  totalIncome: number;
  totalExpenses: number;
  pendingCount: number;
  avgDailySpend: number;
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  colorClass: string;
  iconBgClass: string;
}

function StatCard({
  icon,
  label,
  value,
  colorClass,
  iconBgClass,
}: StatCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className={`rounded-full p-2 ${iconBgClass}`}>{icon}</div>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={`text-lg font-bold ${colorClass}`} dir="ltr">
              {value}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function QuickStats({
  totalIncome,
  totalExpenses,
  pendingCount,
  avgDailySpend,
}: QuickStatsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <StatCard
        icon={<TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />}
        label="Total Income"
        value={CURRENCY_FORMATTER.format(totalIncome)}
        colorClass="text-green-600 dark:text-green-400"
        iconBgClass="bg-green-50 dark:bg-green-950"
      />
      <StatCard
        icon={<TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />}
        label="Total Expenses"
        value={CURRENCY_FORMATTER.format(totalExpenses)}
        colorClass="text-red-600 dark:text-red-400"
        iconBgClass="bg-red-50 dark:bg-red-950"
      />
      <StatCard
        icon={<Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
        label="Pending Transactions"
        value={pendingCount.toString()}
        colorClass="text-amber-600 dark:text-amber-400"
        iconBgClass="bg-amber-50 dark:bg-amber-950"
      />
      <StatCard
        icon={<CalendarDays className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
        label="Avg. Daily Spend"
        value={CURRENCY_FORMATTER.format(avgDailySpend)}
        colorClass="text-blue-600 dark:text-blue-400"
        iconBgClass="bg-blue-50 dark:bg-blue-950"
      />
    </div>
  );
}
