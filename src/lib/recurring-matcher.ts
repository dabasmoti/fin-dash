import type { EnrichedTransaction, RecurringPatternForMatching } from '@/types/bank';
import { getEffectiveAmount } from '@/lib/data-utils';
import { getEffectiveCategory } from '@/lib/category-classifier';

const INSTALLMENT_SUFFIX_PATTERN = /\s*[-\u2013]\s*\u05EA\u05E9\u05DC\u05D5\u05DD\s*\d+\s*\u05DE\u05EA\u05D5\u05DA\s*\d+\s*$/;
const WHITESPACE_PATTERN = /\s+/g;
const INTERNAL_TRANSFER_CATEGORIES = new Set(['card_payment']);
const FIXED_EXPENSE_VARIANCE_THRESHOLD = 0.10;

/** Categories that are inherently fixed expenses regardless of amount variance. */
const FIXED_EXPENSE_CATEGORIES = new Set([
  'mortgage',
  'loan',
  'pension',
  'insurance',
  'utilities',
  'subscriptions',
  'bank_fees',
]);

export function normalizeDescription(desc: string): string {
  return desc
    .replace(INSTALLMENT_SUFFIX_PATTERN, '')
    .replace(WHITESPACE_PATTERN, ' ')
    .trim()
    .toLowerCase();
}

function buildCompositeKey(normalizedDesc: string, bankId: string, accountNumber: string): string {
  return `${normalizedDesc}|${bankId}|${accountNumber}`;
}

/**
 * Builds a Set of composite keys for expense patterns that qualify as "fixed".
 * A pattern is fixed if:
 * - Low variance (≤ 10%), OR
 * - Its category is inherently fixed (mortgage, loan, insurance, etc.)
 */
function buildRecurringLookup(
  patterns: RecurringPatternForMatching[],
): Set<string> {
  const lookup = new Set<string>();
  for (const p of patterns) {
    if (p.direction !== 'expense' || !p.isActive) continue;

    const isLowVariance = p.amountVariance <= FIXED_EXPENSE_VARIANCE_THRESHOLD;
    const isFixedCategory = p.category != null && FIXED_EXPENSE_CATEGORIES.has(p.category);

    if (isLowVariance || isFixedCategory) {
      lookup.add(buildCompositeKey(p.normalizedDesc, p.bankId, p.accountNumber));
    }
  }
  return lookup;
}

export interface RecurringExpenseRow {
  pattern: RecurringPatternForMatching;
  latestAmount: number;
  totalSpend: number;
  transactionCount: number;
}

export interface ExpenseSplit {
  recurringRows: RecurringExpenseRow[];
  otherTransactions: EnrichedTransaction[];
  totalRecurring: number;
  totalOther: number;
}

/**
 * Splits filtered expense transactions into recurring (fixed) vs other (variable).
 * A transaction is "fixed" if it matches a recurring pattern that has either
 * low variance (≤ 10%) or belongs to a fixed-expense category.
 * Uses the latest actual transaction amount per pattern, not the statistical average.
 */
export function splitExpensesByRecurrence(
  transactions: EnrichedTransaction[],
  patterns: RecurringPatternForMatching[],
  categoryRules?: Map<string, string>,
): ExpenseSplit {
  const lookup = buildRecurringLookup(patterns);

  // Also build a set of pattern keys where the frontend-classified category is fixed,
  // even if the backend-stored category is null.
  const patternKeyToCategory = new Map<string, string | null>();
  for (const p of patterns) {
    if (p.direction === 'expense' && p.isActive) {
      patternKeyToCategory.set(
        buildCompositeKey(p.normalizedDesc, p.bankId, p.accountNumber),
        p.category,
      );
    }
  }

  const accByKey = new Map<string, { latestAmount: number; latestDate: string; totalSpend: number; count: number; effectiveCategory: string }>();
  const otherTransactions: EnrichedTransaction[] = [];
  let totalOther = 0;

  for (const txn of transactions) {
    const amount = getEffectiveAmount(txn);
    if (amount >= 0) continue;

    const category = getEffectiveCategory(txn, categoryRules);
    if (INTERNAL_TRANSFER_CATEGORIES.has(category)) continue;

    const key = buildCompositeKey(
      normalizeDescription(txn.description),
      txn.bankId,
      txn.accountNumber,
    );

    // A transaction is recurring-fixed if it matches a pattern in the lookup,
    // OR if it matches an active expense pattern and its effective category is fixed.
    const inLookup = lookup.has(key);
    const hasPattern = patternKeyToCategory.has(key);
    const isCategoryFixed = FIXED_EXPENSE_CATEGORIES.has(category);
    const isFixed = inLookup || (hasPattern && isCategoryFixed);

    if (isFixed) {
      const absAmount = Math.abs(amount);
      const existing = accByKey.get(key);
      if (!existing) {
        accByKey.set(key, { latestAmount: absAmount, latestDate: txn.date, totalSpend: absAmount, count: 1, effectiveCategory: category });
      } else {
        existing.totalSpend += absAmount;
        existing.count += 1;
        if (txn.date > existing.latestDate) {
          existing.latestAmount = absAmount;
          existing.latestDate = txn.date;
        }
      }
    } else {
      otherTransactions.push(txn);
      totalOther += Math.abs(amount);
    }
  }

  const recurringRows: RecurringExpenseRow[] = [];
  let totalRecurring = 0;

  for (const p of patterns) {
    if (p.direction !== 'expense' || !p.isActive) continue;
    const key = buildCompositeKey(p.normalizedDesc, p.bankId, p.accountNumber);
    const match = accByKey.get(key);
    if (match) {
      recurringRows.push({
        pattern: { ...p, category: p.category ?? match.effectiveCategory },
        latestAmount: match.latestAmount,
        totalSpend: Math.round(match.totalSpend * 100) / 100,
        transactionCount: match.count,
      });
      totalRecurring += match.latestAmount;
    }
  }

  return {
    recurringRows,
    otherTransactions,
    totalRecurring: Math.round(totalRecurring * 100) / 100,
    totalOther: Math.round(totalOther * 100) / 100,
  };
}
