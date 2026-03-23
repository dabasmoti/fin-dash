import { AlertCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getBankColor, getBankDisplayName, getBankAccountType } from '@/constants/banks';
import type { CompanyType, TransactionsAccount } from '@/types/bank';
import type { UpcomingCardBilling } from '@/services/api-client';

const CURRENCY_FORMATTER = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function maskAccountNumber(accountNumber: string): string {
  if (accountNumber.length <= 4) return accountNumber;
  const visible = accountNumber.slice(-4);
  const masked = accountNumber.slice(0, -4).replace(/[0-9]/g, '*');
  return `${masked}${visible}`;
}

const ERROR_LABELS: Record<string, string> = {
  INVALID_PASSWORD: 'Invalid password',
  CHANGE_PASSWORD: 'Password change required',
  ACCOUNT_IS_LOCKED: 'Account locked',
  SCRAPER_ERROR: 'Scraper error',
  GENERAL_ERROR: 'Connection error',
};

function friendlyError(errorType?: string): string {
  if (!errorType) return 'Connection failed';
  return ERROR_LABELS[errorType] ?? errorType.replace(/_/g, ' ').toLowerCase();
}

interface AccountCardProps {
  account: TransactionsAccount;
  bankId: CompanyType;
  billing?: UpcomingCardBilling;
}

export default function AccountCard({ account, bankId, billing }: AccountCardProps) {
  const bankColor = getBankColor(bankId);
  const bankName = getBankDisplayName(bankId);
  const isCreditCard = getBankAccountType(bankId) === 'credit_card';
  const balance = account.balance ?? 0;
  const hasBalance = balance !== 0;

  return (
    <Card
      className="min-w-[220px] overflow-hidden"
      style={{ borderLeftWidth: '4px', borderLeftColor: bankColor }}
    >
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-medium" style={{ color: bankColor }}>
          {bankName}
        </CardTitle>
        <p className="text-muted-foreground text-xs">
          {maskAccountNumber(account.accountNumber)}
        </p>
      </CardHeader>
      <CardContent>
        {isCreditCard && billing ? (
          <div>
            <p className="text-xl font-bold text-red-600 dark:text-red-400" dir="ltr">
              {CURRENCY_FORMATTER.format(billing.amount)}
            </p>
            <p className="text-xs text-muted-foreground">
              Next charge {format(parseISO(billing.chargeDate), 'dd/MM')}
            </p>
          </div>
        ) : isCreditCard && !hasBalance ? (
          <p className="text-sm text-muted-foreground">No billing data</p>
        ) : (
          <p
            className={`text-xl font-bold ${balance < 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}
            dir="ltr"
          >
            {CURRENCY_FORMATTER.format(balance)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

interface BankErrorCardProps {
  bankId: CompanyType;
  errorType?: string;
  errorMessage?: string;
}

export function BankErrorCard({ bankId, errorType, errorMessage }: BankErrorCardProps) {
  const bankColor = getBankColor(bankId);
  const bankName = getBankDisplayName(bankId);

  return (
    <Card
      className="min-w-[220px] overflow-hidden border-dashed opacity-80"
      style={{ borderLeftWidth: '4px', borderLeftColor: bankColor }}
    >
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-medium" style={{ color: bankColor }}>
          {bankName}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
          <AlertCircle className="size-4 shrink-0" />
          <p className="text-sm font-medium">{friendlyError(errorType)}</p>
        </div>
        {errorMessage && (
          <p className="text-muted-foreground text-xs mt-1 line-clamp-2">{errorMessage}</p>
        )}
      </CardContent>
    </Card>
  );
}
