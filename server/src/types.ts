// ---------------------------------------------------------------------------
// Supported bank identifiers for scraping
// ---------------------------------------------------------------------------
export type SupportedBankId = 'beinleumi' | 'max' | 'isracard' | 'visaCal';

// ---------------------------------------------------------------------------
// Credential shapes per bank
// ---------------------------------------------------------------------------
export interface BeinleumiCredentials {
  username: string;
  password: string;
}

export interface MaxCredentials {
  username: string;
  password: string;
}

export interface IsracardCredentials {
  id: string;
  card6Digits: string;
  password: string;
}

export interface VisaCalCredentials {
  username: string;
  password: string;
}

export type BankCredentials =
  | BeinleumiCredentials
  | MaxCredentials
  | IsracardCredentials
  | VisaCalCredentials;

// ---------------------------------------------------------------------------
// Generic API response wrapper
// ---------------------------------------------------------------------------
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ---------------------------------------------------------------------------
// Cache entry for in-memory caching
// ---------------------------------------------------------------------------
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Transaction-related types (mirrored from frontend)
// ---------------------------------------------------------------------------
export type TransactionType = 'normal' | 'installments';
export type TransactionStatus = 'completed' | 'pending';
export type CurrencyCode = 'ILS' | 'USD' | 'EUR';

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

export interface BankScraperData {
  bankId: SupportedBankId;
  result: ScraperResult;
}

// ---------------------------------------------------------------------------
// Scheduler status
// ---------------------------------------------------------------------------
export interface SchedulerStatus {
  enabled: boolean;
  running: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  cronExpression: string;
  lastError: string | null;
}

// ---------------------------------------------------------------------------
// Bank registry entry
// ---------------------------------------------------------------------------
export interface BankRegistryEntry {
  companyId: string;
  displayName: string;
  requiredEnvVars: string[];
}

// ---------------------------------------------------------------------------
// Database: stored transaction row
// ---------------------------------------------------------------------------
export interface StoredTransaction {
  id: number;
  bank_id: string;
  account_number: string;
  type: string;
  identifier: string | null;
  date: string;
  processed_date: string;
  original_amount: number;
  original_currency: string;
  charged_amount: number;
  charged_currency: string | null;
  description: string;
  memo: string | null;
  status: string;
  installment_number: number | null;
  installment_total: number | null;
  category: string | null;
  scrape_timestamp: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Database: stored account row
// ---------------------------------------------------------------------------
export interface StoredAccount {
  id: number;
  bank_id: string;
  account_number: string;
  balance: number | null;
  last_updated: string;
}

// ---------------------------------------------------------------------------
// Database: scrape run record
// ---------------------------------------------------------------------------
export interface ScrapeRunRecord {
  id: number;
  bank_id: string;
  started_at: string;
  completed_at: string | null;
  success: number;
  error_type: string | null;
  error_message: string | null;
  transaction_count: number;
  trigger_type: string;
}

// ---------------------------------------------------------------------------
// Database: query filters
// ---------------------------------------------------------------------------
export interface TransactionFilters {
  bankId?: string;
  from?: string;
  to?: string;
  status?: string;
  category?: string;
  limit?: number;
  offset?: number;
}

export interface ScrapeHistoryFilters {
  bankId?: string;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Recurring patterns
// ---------------------------------------------------------------------------
export type RecurringFrequency = 'monthly' | 'bimonthly' | 'quarterly';
export type RecurringDirection = 'income' | 'expense';

export interface StoredRecurringPattern {
  id: number;
  description: string;
  normalized_desc: string;
  bank_id: string;
  account_number: string;
  category: string | null;
  avg_amount: number;
  amount_variance: number;
  frequency: RecurringFrequency;
  typical_day: number | null;
  direction: RecurringDirection;
  occurrence_count: number;
  last_seen: string;
  is_active: number;
  user_confirmed: number;
  created_at: string;
  updated_at: string;
}

export interface RecurringPatternInput {
  description: string;
  bankId: string;
  accountNumber: string;
  category?: string;
  amount: number;
  frequency: RecurringFrequency;
  typicalDay?: number;
  direction: RecurringDirection;
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
  direction: RecurringDirection;
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
  recurringItems: RecurringItemSummary[];
  historicalDays: ProjectedDay[];
  categoryForecasts: CategoryForecast[];
}

// ---------------------------------------------------------------------------
// Category rules
// ---------------------------------------------------------------------------
export interface CategoryRule {
  id: number;
  description: string;
  category_id: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Database: statistics for health endpoint
// ---------------------------------------------------------------------------
export interface DatabaseStats {
  totalTransactions: number;
  totalAccounts: number;
  totalScrapeRuns: number;
  dbSizeBytes: number;
}
