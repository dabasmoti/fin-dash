import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Wallet } from 'lucide-react';

const CURRENCY_FORMATTER = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

interface TotalBalanceCardProps {
  totalBalance: number;
  accountCount: number;
}

export default function TotalBalanceCard({
  totalBalance,
  accountCount,
}: TotalBalanceCardProps) {
  const isNegative = totalBalance < 0;

  return (
    <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white border-0">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-slate-300" />
          <CardTitle className="text-sm font-medium text-slate-300">
            Total Balance
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p
          className={`text-3xl font-bold tracking-tight ${isNegative ? 'text-red-400' : 'text-white'}`}
          dir="ltr"
        >
          {CURRENCY_FORMATTER.format(totalBalance)}
        </p>
        <p className="text-sm text-slate-400 mt-1">
          Across {accountCount} accounts
        </p>
      </CardContent>
    </Card>
  );
}
