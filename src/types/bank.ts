export type TransactionType = 'normal' | 'installments';
export type TransactionStatus = 'completed' | 'pending';
export type CurrencyCode = 'ILS' | 'USD' | 'EUR';

export type CompanyType =
  | 'hapoalim'
  | 'leumi'
  | 'mizrahi'
  | 'discount'
  | 'mercantile'
  | 'otsarHahayal'
  | 'visaCal'
  | 'max'
  | 'isracard'
  | 'amex'
  | 'union'
  | 'beinleumi'
  | 'massad'
  | 'yahav'
  | 'behatsdaa'
  | 'beyahadBishvilha'
  | 'oneZero'
  | 'pagi';

export interface TransactionInstallments {
  number: number;
  total: number;
}

export interface Transaction {
  type: TransactionType;
  identifier?: string | number;
  date: string;
  processedDate: string;
  originalAmount: number;
  originalCurrency: CurrencyCode;
  chargedAmount: number;
  chargedCurrency?: string;
  description: string;
  memo?: string;
  status: TransactionStatus;
  installments?: TransactionInstallments;
  category?: string;
}

export interface TransactionsAccount {
  accountNumber: string;
  balance?: number;
  txns: Transaction[];
}

export interface ScraperResult {
  success: boolean;
  accounts: TransactionsAccount[];
  errorType?: string;
  errorMessage?: string;
}

export type AccountType = 'bank_account' | 'credit_card';

export interface BankMetadata {
  id: CompanyType;
  displayName: string;
  color: string;
  accountType: AccountType;
}

export interface BankScraperData {
  bankId: CompanyType;
  result: ScraperResult;
}

export interface EnrichedTransaction extends Transaction {
  accountNumber: string;
  bankId: CompanyType;
  bankDisplayName: string;
  accountType: AccountType;
}

export interface CategorySummary {
  category: string;
  totalAmount: number;
  transactionCount: number;
  percentage: number;
}

export interface MonthlyAggregate {
  month: string;
  monthLabel: string;
  totalSpending: number;
  totalIncome: number;
  netIncome: number;
  transactionCount: number;
}

export interface CurrencyBreakdown {
  currency: CurrencyCode;
  totalAmount: number;
  transactionCount: number;
  percentage: number;
}

export interface DailyAggregate {
  date: string;
  totalSpending: number;
  transactionCount: number;
}

export interface MerchantSummary {
  merchantName: string;
  totalAmount: number;
  transactionCount: number;
  lastTransactionDate: string;
}

export interface InstallmentForecast {
  description: string;
  currentPayment: number;
  totalPayments: number;
  remainingPayments: number;
  monthlyAmount: number;
  totalRemaining: number;
  estimatedCompletionDate: string;
  originalAmount: number;
}

export interface RecurringPatternForMatching {
  id: number;
  description: string;
  normalizedDesc: string;
  bankId: string;
  accountNumber: string;
  category: string | null;
  avgAmount: number;
  amountVariance: number;
  frequency: string;
  typicalDay: number;
  direction: 'income' | 'expense';
  occurrenceCount: number;
  lastSeen: string;
  isActive: boolean;
  isUserConfirmed: boolean;
}

export interface FilterState {
  selectedAccountIds: string[];
  selectedCategories: string[];
  dateRange: { from: Date; to: Date };
  selectedCurrency: CurrencyCode | 'all';
  searchQuery: string;
}

// ---------------------------------------------------------------------------
// Cash flow projection
// ---------------------------------------------------------------------------

export interface CashFlowEvent {
  description: string;
  amount: number;
  type: 'income' | 'expense' | 'card_charge' | 'forecast';
  source: string;
  bankId?: string;
  accountNumber?: string;
}

export interface ProjectedDay {
  date: string;
  projectedBalance: number;
  events: CashFlowEvent[];
}

export interface RecurringItemSummary {
  id: number;
  description: string;
  amount: number;
  frequency: string;
  typicalDay: number;
  direction: 'income' | 'expense';
  isUserConfirmed: boolean;
  category: string | null;
  bankId?: string;
  accountNumber?: string;
}

export interface CategoryForecast {
  category: string;
  monthlyAvg: number;
  monthlyMedian: number;
  stdDev: number;
  cv: number;
  projectedMonthly: number;
  confidenceLow: number;
  confidenceHigh: number;
  method: 'mean' | 'median';
  monthlyHistory: Array<{ month: string; amount: number }>;
}

export interface CashFlowProjection {
  startBalance: number;
  projectedDays: ProjectedDay[];
  historicalDays: ProjectedDay[];
  categoryForecasts: CategoryForecast[];
  recurringItems: RecurringItemSummary[];
}
