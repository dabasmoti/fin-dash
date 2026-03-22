import type { CashFlowProjection, RecurringItemSummary, RecurringPatternForMatching } from '@/types/bank';

const DEFAULT_PROJECTION_MONTHS = 2;
const DEFAULT_HISTORICAL_MONTHS = 2;

/**
 * Fetches the cash flow projection from the server.
 * The projection includes daily projected balances and associated events
 * for the requested number of months into the future, plus historical data
 * for the requested number of months back.
 */
export async function fetchCashFlowProjection(
  months: number = DEFAULT_PROJECTION_MONTHS,
  monthsBack: number = DEFAULT_HISTORICAL_MONTHS,
): Promise<CashFlowProjection> {
  const response = await fetch(`/api/cashflow/projection?months=${months}&monthsBack=${monthsBack}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch cash flow projection: ${response.statusText}`);
  }

  const json = await response.json();

  if (!json.success || !json.data) {
    throw new Error(json.error ?? 'Unknown error fetching cash flow projection');
  }

  return json.data as CashFlowProjection;
}

/**
 * Fetches all detected recurring patterns from the server.
 * Patterns include both auto-detected and user-confirmed items.
 */
export async function fetchRecurringPatterns(): Promise<RecurringItemSummary[]> {
  const response = await fetch('/api/recurring-patterns');

  if (!response.ok) {
    throw new Error(`Failed to fetch recurring patterns: ${response.statusText}`);
  }

  const json = await response.json();

  if (!json.success || !json.data) {
    throw new Error(json.error ?? 'Unknown error fetching recurring patterns');
  }

  // Map the stored patterns to the frontend summary shape
  return (json.data as Array<Record<string, unknown>>).map((pattern) => ({
    id: pattern.id as number,
    description: pattern.description as string,
    amount: pattern.avg_amount as number,
    frequency: pattern.frequency as string,
    typicalDay: (pattern.typical_day as number) ?? 0,
    direction: pattern.direction as 'income' | 'expense',
    isUserConfirmed: Boolean(pattern.user_confirmed),
  }));
}

/**
 * Fetches recurring patterns with full matching fields (bankId, accountNumber,
 * normalizedDesc, amountVariance) needed for transaction-to-pattern matching.
 */
export async function fetchRecurringPatternsForMatching(): Promise<RecurringPatternForMatching[]> {
  const response = await fetch('/api/recurring-patterns');

  if (!response.ok) {
    throw new Error(`Failed to fetch recurring patterns: ${response.statusText}`);
  }

  const json = await response.json();

  if (!json.success || !json.data) {
    throw new Error(json.error ?? 'Unknown error fetching recurring patterns');
  }

  return (json.data as Array<Record<string, unknown>>).map((p) => ({
    id: p.id as number,
    description: p.description as string,
    normalizedDesc: p.normalized_desc as string,
    bankId: p.bank_id as string,
    accountNumber: p.account_number as string,
    category: (p.category as string) ?? null,
    avgAmount: p.avg_amount as number,
    amountVariance: (p.amount_variance as number) ?? 0,
    frequency: p.frequency as string,
    typicalDay: (p.typical_day as number) ?? 0,
    direction: p.direction as 'income' | 'expense',
    occurrenceCount: p.occurrence_count as number,
    lastSeen: p.last_seen as string,
    isActive: Boolean(p.is_active),
    isUserConfirmed: Boolean(p.user_confirmed),
  }));
}

/**
 * Marks a recurring pattern as user-confirmed on the server.
 * This increases the pattern's weight in projection calculations.
 */
export async function confirmRecurringPattern(id: number): Promise<void> {
  const response = await fetch(`/api/recurring-patterns/${id}/confirm`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Failed to confirm recurring pattern: ${response.statusText}`);
  }

  const json = await response.json();

  if (!json.success) {
    throw new Error(json.error ?? 'Unknown error confirming pattern');
  }
}
