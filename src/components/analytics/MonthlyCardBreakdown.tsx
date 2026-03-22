import { memo, useMemo, useState } from 'react';
import { useData } from '@/contexts/DataContext';
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
import type { AccountType, EnrichedTransaction } from '@/types/bank';
import {
  getMonthlyBreakdownByAccount,
  getAccountKeysFromBreakdown,
  getAccountTypeMap,
} from '@/lib/stacked-chart-utils';

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

const ACCOUNT_COLORS: Record<string, string> = {
  account_3329: '#ff0066',
  account_5525: '#0066cc',
  account_353833: '#00695c',
  account_2262: '#0066cc',
  account_7202: '#3b82f6',
};

const FALLBACK_COLORS = ['#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899'];

function getAccountColor(key: string, index: number): string {
  return ACCOUNT_COLORS[key] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

function formatAccountLabel(key: string, accountTypeMap: Record<string, AccountType>): string {
  const num = key.replace('account_', '');
  const type = accountTypeMap[key];
  const prefix = type === 'bank_account' ? 'Bank' : 'Card';
  return `${prefix} ****${num}`;
}

interface MonthlyCardBreakdownProps {
  transactions: EnrichedTransaction[];
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    dataKey: string;
    color: string;
  }>;
  label?: string;
  accountTypeMap: Record<string, AccountType>;
}

function CustomTooltip({ active, payload, label, accountTypeMap }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const total = payload.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium mb-2">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="flex justify-between gap-4" dir="ltr">
          <span style={{ color: entry.color }}>{formatAccountLabel(entry.dataKey, accountTypeMap)}</span>
          <span className="font-medium">{CURRENCY_FORMATTER.format(entry.value)}</span>
        </p>
      ))}
      <hr className="my-1.5 border-border" />
      <p className="flex justify-between gap-4 font-semibold" dir="ltr">
        <span>Total</span>
        <span>{CURRENCY_FORMATTER.format(total)}</span>
      </p>
    </div>
  );
}

function MonthlyCardBreakdownInner({ transactions }: MonthlyCardBreakdownProps) {
  const { categoryRules } = useData();
  const [mode, setMode] = useState<'expenses' | 'income'>('expenses');

  const accountTypeMap = useMemo(() => getAccountTypeMap(transactions), [transactions]);

  const data = useMemo(
    () => getMonthlyBreakdownByAccount(transactions, mode, categoryRules),
    [transactions, mode, categoryRules],
  );

  const accountKeys = useMemo(() => getAccountKeysFromBreakdown(data), [data]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">Monthly Breakdown by Account</CardTitle>
        <div className="flex gap-1 rounded-lg border p-0.5">
          <button
            onClick={() => setMode('expenses')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              mode === 'expenses'
                ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Expenses
          </button>
          <button
            onClick={() => setMode('income')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              mode === 'income'
                ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Income
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">
            No data available
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart
              data={data}
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
                tickFormatter={(value: number) => COMPACT_FORMATTER.format(value)}
              />
              <Tooltip content={<CustomTooltip accountTypeMap={accountTypeMap} />} />
              <Legend
                verticalAlign="top"
                height={36}
                formatter={(value: string) => (
                  <span className="text-xs">{formatAccountLabel(value, accountTypeMap)}</span>
                )}
              />
              {accountKeys.map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="accounts"
                  fill={getAccountColor(key, index)}
                  radius={index === accountKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  maxBarSize={50}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

const MonthlyCardBreakdown = memo(MonthlyCardBreakdownInner);
export default MonthlyCardBreakdown;
