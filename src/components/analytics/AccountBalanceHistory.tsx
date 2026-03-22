import { memo, useMemo } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
import type { BankScraperData } from '@/types/bank';
import { getBankColor } from '@/constants/banks';
import { getAccountBalanceHistory } from '@/lib/chart-utils';

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

interface AccountBalanceHistoryProps {
  bankData: BankScraperData[];
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
          <span style={{ color: entry.color }}>{entry.dataKey}:</span>{' '}
          {CURRENCY_FORMATTER.format(entry.value)}
        </p>
      ))}
    </div>
  );
}

function AccountBalanceHistoryInner({
  bankData,
}: AccountBalanceHistoryProps) {
  const { chartData, accountKeys, accountColors } = useMemo(() => {
    const raw = getAccountBalanceHistory(bankData);

    // Pivot data: each row is a month, each column is an account
    const monthMap = new Map<string, Record<string, number>>();
    const accountKeySet = new Set<string>();
    const colorMap = new Map<string, string>();

    for (const entry of raw) {
      const key = `${entry.bank} ${entry.account}`;
      accountKeySet.add(key);

      if (!monthMap.has(entry.month)) {
        monthMap.set(entry.month, {});
      }
      const row = monthMap.get(entry.month)!;
      row[key] = entry.balance;
    }

    // Derive bank colors for each account key
    for (const bank of bankData) {
      for (const account of bank.result.accounts) {
        const bankName = raw.find(
          (r) => r.account === account.accountNumber,
        )?.bank;
        if (bankName) {
          const key = `${bankName} ${account.accountNumber}`;
          colorMap.set(key, getBankColor(bank.bankId));
        }
      }
    }

    const data = Array.from(monthMap.entries()).map(([month, accounts]) => ({
      month,
      ...accounts,
    }));

    return {
      chartData: data,
      accountKeys: Array.from(accountKeySet),
      accountColors: colorMap,
    };
  }, [bankData]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Account Balance History</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">
            No balance data available
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={chartData}
              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11 }}
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
              <Legend
                verticalAlign="top"
                height={48}
                formatter={(value: string) => (
                  <span className="text-xs">{value}</span>
                )}
              />
              {accountKeys.map((key) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={accountColors.get(key) ?? '#6b7280'}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

const AccountBalanceHistory = memo(AccountBalanceHistoryInner);
export default AccountBalanceHistory;
