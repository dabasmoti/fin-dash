import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
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
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import type {
  CashFlowProjection as CashFlowProjectionData,
  CashFlowEvent,
  ProjectedDay,
  RecurringItemSummary,
} from '@/types/bank';
import {
  fetchCashFlowProjection,
  fetchBillingDetails,
  confirmRecurringPattern,
  type BillingDetails,
} from '@/lib/cashflow-utils';
import { getBankDisplayName, getBankColor } from '@/constants/banks';
import { getCategoryLabel, getCategoryColor } from '@/constants/categories';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOW_BALANCE_THRESHOLD = 5000;
const CHART_HEIGHT = 380;
const HEALTHY_COLOR = '#22c55e';
const WARNING_COLOR = '#ef4444';
const FORECAST_COLOR = '#6366f1';
const TODAY_COLOR = '#3b82f6';

const HISTORICAL_FILL_ID = 'historicalBalanceGradient';
const FORECAST_FILL_ID = 'forecastBalanceGradient';

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

const DIRECTION_LABELS: Record<string, string> = {
  income: 'Income',
  expense: 'Expense',
};

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  bimonthly: 'Bi-monthly',
  quarterly: 'Quarterly',
};

// ---------------------------------------------------------------------------
// Chart data point type
// ---------------------------------------------------------------------------

interface ChartEventData {
  description: string;
  amount: number;
  type: string;
  bankId?: string;
  accountNumber?: string;
}

interface ChartDataPoint {
  date: string;
  dateLabel: string;
  historicalBalance: number | null;
  projectedBalance: number | null;
  isHistorical: boolean;
  hasSalary: boolean;
  hasCardCharge: boolean;
  eventSummary: string;
  events: ChartEventData[];
}

// ---------------------------------------------------------------------------
// Custom tooltip with clickable card charges
// ---------------------------------------------------------------------------

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    dataKey: string;
    payload: ChartDataPoint;
  }>;
  label?: string;
  onCardChargeClick?: (event: ChartEventData, date: string) => void;
}

function CustomTooltip({ active, payload, onCardChargeClick }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0].payload;
  const balance = data.historicalBalance ?? data.projectedBalance ?? 0;
  const balanceColor = balance < LOW_BALANCE_THRESHOLD ? WARNING_COLOR : HEALTHY_COLOR;
  const periodLabel = data.isHistorical ? 'Actual' : 'Projected';

  return (
    <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 text-sm max-w-[300px]">
      <p className="font-medium mb-1">{data.dateLabel}</p>
      <p className="text-xs text-muted-foreground mb-1">({periodLabel})</p>
      <p style={{ color: balanceColor }} dir="ltr">
        Balance: {CURRENCY_FORMATTER.format(balance)}
      </p>
      {data.events.length > 0 && (
        <div className="mt-2 space-y-0.5 text-xs">
          {data.events.map((event, idx) => {
            const isIncome = event.type === 'income';
            const isCardCharge = event.type === 'card_charge' && event.bankId;
            const color = isIncome ? HEALTHY_COLOR : WARNING_COLOR;
            const prefix = isIncome ? '+' : '-';

            if (isCardCharge) {
              return (
                <button
                  key={idx}
                  type="button"
                  className="block w-full text-left cursor-pointer hover:underline"
                  style={{ color }}
                  dir="ltr"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onCardChargeClick?.(event, data.date);
                  }}
                >
                  {prefix} {CURRENCY_FORMATTER.format(Math.abs(event.amount))} {event.description} (details)
                </button>
              );
            }

            return (
              <p key={idx} style={{ color }} dir="ltr">
                {prefix} {CURRENCY_FORMATTER.format(Math.abs(event.amount))} {event.description}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Billing Details Sheet
// ---------------------------------------------------------------------------

interface BillingSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  details: BillingDetails | null;
  isLoading: boolean;
  cardLabel: string;
}

function BillingSheet({ open, onOpenChange, details, isLoading, cardLabel }: BillingSheetProps) {
  const groupedByCategory = useMemo(() => {
    if (!details) return [];
    const groups = new Map<string, { category: string; total: number; count: number }>();
    for (const txn of details.transactions) {
      const cat = txn.category ?? 'other';
      const existing = groups.get(cat);
      if (existing) {
        existing.total += Math.abs(txn.charged_amount);
        existing.count += 1;
      } else {
        groups.set(cat, { category: cat, total: Math.abs(txn.charged_amount), count: 1 });
      }
    }
    return [...groups.values()].sort((a, b) => b.total - a.total);
  }, [details]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{cardLabel} - Billing Details</SheetTitle>
          <SheetDescription>
            {details ? `Charge date: ${format(parseISO(details.chargeDate), 'dd/MM/yyyy')}` : ''}
          </SheetDescription>
        </SheetHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            Loading transactions...
          </div>
        )}

        {!isLoading && details && (
          <div className="px-4 pb-4 space-y-4">
            {/* Totals */}
            <div className="flex gap-3">
              <div className="flex-1 rounded-lg border p-3">
                <span className="text-xs text-muted-foreground">Total Charge</span>
                <p className="font-semibold text-red-600 dark:text-red-400 mt-1" dir="ltr">
                  {CURRENCY_FORMATTER.format(details.total)}
                </p>
              </div>
              {details.pendingTotal > 0 && (
                <div className="flex-1 rounded-lg border p-3">
                  <span className="text-xs text-muted-foreground">Pending</span>
                  <p className="font-semibold text-amber-600 dark:text-amber-400 mt-1" dir="ltr">
                    {CURRENCY_FORMATTER.format(details.pendingTotal)}
                  </p>
                </div>
              )}
              <div className="flex-1 rounded-lg border p-3">
                <span className="text-xs text-muted-foreground">Transactions</span>
                <p className="font-semibold mt-1">{details.count}</p>
              </div>
            </div>

            {/* Category Breakdown */}
            {groupedByCategory.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">By Category</h4>
                <div className="space-y-1.5">
                  {groupedByCategory.map((g) => {
                    const pct = details.total > 0 ? (g.total / details.total) * 100 : 0;
                    const catColor = getCategoryColor(g.category);
                    return (
                      <div key={g.category} className="flex items-center gap-2 text-sm">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: catColor }}
                        />
                        <span className="flex-1 truncate">{getCategoryLabel(g.category, 'en')}</span>
                        <span className="text-muted-foreground text-xs">{g.count}</span>
                        <span className="font-medium text-red-600 dark:text-red-400 w-20 text-right" dir="ltr">
                          {CURRENCY_FORMATTER.format(g.total)}
                        </span>
                        <span className="text-muted-foreground text-xs w-10 text-right">
                          {pct.toFixed(0)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Individual Transactions */}
            <div>
              <h4 className="text-sm font-semibold mb-2">All Transactions</h4>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {details.transactions.map((txn, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="max-w-[200px]">
                          <div className="truncate text-sm">{txn.description}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {txn.category && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0">
                                {getCategoryLabel(txn.category, 'en')}
                              </Badge>
                            )}
                            {txn.installment_total && txn.installment_total > 1 && (
                              <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                {txn.installment_number}/{txn.installment_total}
                              </Badge>
                            )}
                            {txn.status === 'pending' && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 text-amber-600">
                                pending
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(parseISO(txn.date), 'dd/MM')}
                        </TableCell>
                        <TableCell className="text-right font-medium text-red-600 dark:text-red-400 whitespace-nowrap" dir="ltr">
                          {CURRENCY_FORMATTER.format(Math.abs(txn.charged_amount))}
                          {txn.original_currency !== 'ILS' && (
                            <span className="text-muted-foreground text-xs ml-1">
                              ({txn.original_currency})
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Fixed Expenses by Category
// ---------------------------------------------------------------------------

interface CategoryGroup {
  category: string;
  items: RecurringItemSummary[];
  monthlyTotal: number;
}

function getMonthlyEquivalent(amount: number, frequency: string): number {
  switch (frequency) {
    case 'bimonthly': return amount / 2;
    case 'quarterly': return amount / 3;
    default: return amount;
  }
}

function FixedExpensesSummary({
  items,
  confirmingIds,
  onConfirm,
  onCardDetailClick,
}: {
  items: RecurringItemSummary[];
  confirmingIds: Set<number>;
  onConfirm: (item: RecurringItemSummary) => void;
  onCardDetailClick?: (bankId: string, accountNumber: string, chargeDay: number) => void;
}) {
  const { incomeItems, expenseGroups, totalMonthlyExpenses, totalMonthlyIncome } = useMemo(() => {
    const income = items.filter((i) => i.direction === 'income');
    const expenses = items.filter((i) => i.direction === 'expense');

    const grouped = new Map<string, CategoryGroup>();
    for (const item of expenses) {
      const cat = item.category ?? 'other';
      const existing = grouped.get(cat);
      const monthly = getMonthlyEquivalent(item.amount, item.frequency);
      if (existing) {
        existing.items.push(item);
        existing.monthlyTotal += monthly;
      } else {
        grouped.set(cat, { category: cat, items: [item], monthlyTotal: monthly });
      }
    }

    const groups = [...grouped.values()].sort((a, b) => b.monthlyTotal - a.monthlyTotal);
    const expTotal = groups.reduce((s, g) => s + g.monthlyTotal, 0);
    const incTotal = income.reduce((s, i) => s + getMonthlyEquivalent(i.amount, i.frequency), 0);

    return {
      incomeItems: income,
      expenseGroups: groups,
      totalMonthlyExpenses: expTotal,
      totalMonthlyIncome: incTotal,
    };
  }, [items]);

  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {/* Income Section */}
      {incomeItems.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-green-600 mb-2">
            Monthly Income: {CURRENCY_FORMATTER.format(totalMonthlyIncome)}
          </h4>
          <div className="space-y-1">
            {incomeItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm py-1 px-2 rounded hover:bg-muted/50">
                <div className="flex items-center gap-2 min-w-0">
                  <Checkbox
                    checked={item.isUserConfirmed}
                    disabled={item.isUserConfirmed || confirmingIds.has(item.id)}
                    onCheckedChange={() => onConfirm(item)}
                    className="shrink-0"
                  />
                  <span className="truncate">{item.description}</span>
                </div>
                <span className="font-medium text-green-600 shrink-0 ml-2" dir="ltr">
                  +{CURRENCY_FORMATTER.format(item.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expenses by Category */}
      <div>
        <h4 className="text-sm font-semibold text-red-500 mb-2">
          Monthly Fixed Expenses: {CURRENCY_FORMATTER.format(totalMonthlyExpenses)}
        </h4>

        <div className="space-y-1">
          {expenseGroups.map((group) => {
            const isExpanded = expandedCategory === group.category;
            const catColor = getCategoryColor(group.category);
            const catLabel = getCategoryLabel(group.category, 'en');
            const pct = totalMonthlyExpenses > 0
              ? (group.monthlyTotal / totalMonthlyExpenses) * 100
              : 0;

            return (
              <div key={group.category}>
                <button
                  type="button"
                  className="flex items-center gap-2 w-full text-sm py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer"
                  onClick={() => setExpandedCategory(isExpanded ? null : group.category)}
                >
                  <span
                    className="inline-block h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: catColor }}
                  />
                  <span className="flex-1 text-left truncate font-medium">{catLabel}</span>
                  <span className="text-muted-foreground text-xs">{group.items.length} items</span>
                  <span className="text-muted-foreground text-xs w-10 text-right">{pct.toFixed(0)}%</span>
                  <span className="font-medium text-red-500 w-24 text-right shrink-0" dir="ltr">
                    {CURRENCY_FORMATTER.format(group.monthlyTotal)}
                  </span>
                  <span className="text-muted-foreground text-xs">{isExpanded ? '\u25B2' : '\u25BC'}</span>
                </button>

                {isExpanded && (
                  <div className="ml-5 border-l pl-3 mt-1 mb-2 space-y-0.5">
                    {group.items
                      .sort((a, b) => b.amount - a.amount)
                      .map((item) => {
                        const isCard = item.bankId && item.accountNumber;
                        const itemKey = isCard
                          ? `card-${item.bankId}-${item.accountNumber}`
                          : String(item.id);

                        return (
                          <div key={itemKey} className="flex items-center justify-between text-sm py-0.5">
                            <div className="flex items-center gap-2 min-w-0">
                              {item.id !== -1 && (
                                <Checkbox
                                  checked={item.isUserConfirmed}
                                  disabled={item.isUserConfirmed || confirmingIds.has(item.id)}
                                  onCheckedChange={() => onConfirm(item)}
                                  className="shrink-0"
                                />
                              )}
                              {isCard ? (
                                <button
                                  type="button"
                                  className="truncate text-muted-foreground hover:text-foreground hover:underline cursor-pointer text-left"
                                  style={{ color: getBankColor(item.bankId!) }}
                                  onClick={() => onCardDetailClick?.(item.bankId!, item.accountNumber!, item.typicalDay)}
                                >
                                  {item.description}
                                </button>
                              ) : (
                                <span className="truncate text-muted-foreground">{item.description}</span>
                              )}
                              {item.frequency !== 'monthly' && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                                  {FREQUENCY_LABELS[item.frequency] ?? item.frequency}
                                </Badge>
                              )}
                              {isCard && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                                  day {item.typicalDay}
                                </Badge>
                              )}
                            </div>
                            <span className="text-red-500 text-xs shrink-0 ml-2" dir="ltr">
                              {CURRENCY_FORMATTER.format(item.amount)}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Grand total footer */}
        <div className="border-t mt-3 pt-2 flex items-center justify-between px-2">
          <span className="text-sm font-semibold">Net Monthly Cash Flow</span>
          <span
            className="font-bold text-sm"
            style={{ color: totalMonthlyIncome - totalMonthlyExpenses >= 0 ? HEALTHY_COLOR : WARNING_COLOR }}
            dir="ltr"
          >
            {CURRENCY_FORMATTER.format(totalMonthlyIncome - totalMonthlyExpenses)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCombinedChartData(
  historicalDays: ProjectedDay[],
  projectedDays: ProjectedDay[],
): ChartDataPoint[] {
  const mapEvents = (events: CashFlowEvent[]): ChartEventData[] =>
    events.map((e) => ({
      description: e.description,
      amount: e.amount,
      type: e.type,
      bankId: e.bankId,
      accountNumber: e.accountNumber,
    }));

  const historicalPoints: ChartDataPoint[] = historicalDays.map((day) => ({
    date: day.date,
    dateLabel: format(parseISO(day.date), 'dd MMM yyyy'),
    historicalBalance: Math.round(day.projectedBalance),
    projectedBalance: null,
    isHistorical: true,
    hasSalary: day.events.some((e) => e.type === 'income'),
    hasCardCharge: day.events.some((e) => e.type === 'card_charge'),
    eventSummary: '',
    events: mapEvents(day.events),
  }));

  const projectedPoints: ChartDataPoint[] = projectedDays.map((day, idx) => ({
    date: day.date,
    dateLabel: format(parseISO(day.date), 'dd MMM yyyy'),
    historicalBalance: idx === 0 ? Math.round(day.projectedBalance) : null,
    projectedBalance: Math.round(day.projectedBalance),
    isHistorical: false,
    hasSalary: day.events.some((e) => e.type === 'income'),
    hasCardCharge: day.events.some((e) => e.type === 'card_charge'),
    eventSummary: '',
    events: mapEvents(day.events),
  }));

  return [...historicalPoints, ...projectedPoints];
}

function findAnnotationDates(
  chartData: ChartDataPoint[],
  field: 'hasSalary' | 'hasCardCharge',
): string[] {
  return chartData.filter((d) => d[field]).map((d) => d.date);
}

function getTodayDateString(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string;
  value: string;
  color?: string;
}

function StatCard({ label, value, color }: StatCardProps) {
  return (
    <div className="flex flex-col rounded-lg border p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-semibold text-sm mt-1" style={color ? { color } : undefined} dir="ltr">
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function CashFlowProjectionInner() {
  const [projection, setProjection] = useState<CashFlowProjectionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingIds, setConfirmingIds] = useState<Set<number>>(new Set());

  // Billing details sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [billingDetails, setBillingDetails] = useState<BillingDetails | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingCardLabel, setBillingCardLabel] = useState('');

  // Fetch projection data on mount
  useEffect(() => {
    let cancelled = false;

    async function loadProjection() {
      try {
        setIsLoading(true);
        setError(null);
        const data = await fetchCashFlowProjection();
        if (!cancelled) {
          setProjection(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load projection');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadProjection();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleConfirmPattern = useCallback(
    async (item: RecurringItemSummary) => {
      if (item.isUserConfirmed || confirmingIds.has(item.id)) return;

      setConfirmingIds((prev) => new Set(prev).add(item.id));

      try {
        await confirmRecurringPattern(item.id);

        setProjection((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            recurringItems: prev.recurringItems.map((ri) =>
              ri.id === item.id ? { ...ri, isUserConfirmed: true } : ri,
            ),
          };
        });
      } catch {
        // Silently handle - user can retry
      } finally {
        setConfirmingIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }
    },
    [confirmingIds],
  );

  const openBillingSheet = useCallback(async (bankId: string, accountNumber: string, chargeDate: string) => {
    const label = `${getBankDisplayName(bankId)} ...${accountNumber.slice(-4)}`;
    setBillingCardLabel(label);
    setBillingLoading(true);
    setBillingDetails(null);
    setSheetOpen(true);

    try {
      const details = await fetchBillingDetails(bankId, accountNumber, chargeDate);
      setBillingDetails(details);
    } catch {
      setBillingDetails(null);
    } finally {
      setBillingLoading(false);
    }
  }, []);

  const handleCardChargeClick = useCallback(async (event: ChartEventData, date: string) => {
    if (!event.bankId || !event.accountNumber) return;
    openBillingSheet(event.bankId, event.accountNumber, date);
  }, [openBillingSheet]);

  const handleFixedExpenseCardClick = useCallback((bankId: string, accountNumber: string, chargeDay: number) => {
    const now = new Date();
    const today = now.getDate();
    // If charge day hasn't passed this month, use this month; otherwise next month
    const month = today <= chargeDay ? now.getMonth() : now.getMonth() + 1;
    const year = now.getFullYear() + Math.floor(month / 12);
    const adjustedMonth = month % 12;
    const chargeDate = `${year}-${String(adjustedMonth + 1).padStart(2, '0')}-${String(chargeDay).padStart(2, '0')}`;
    openBillingSheet(bankId, accountNumber, chargeDate);
  }, [openBillingSheet]);

  // Build combined chart data from historical + projected days
  const chartData = useMemo(
    () =>
      projection
        ? buildCombinedChartData(
            projection.historicalDays ?? [],
            projection.projectedDays,
          )
        : [],
    [projection],
  );

  const salaryDates = useMemo(
    () => findAnnotationDates(chartData, 'hasSalary'),
    [chartData],
  );

  const cardChargeDates = useMemo(
    () => findAnnotationDates(chartData, 'hasCardCharge'),
    [chartData],
  );

  const todayDate = useMemo(() => getTodayDateString(), []);

  // Header stats
  const headerStats = useMemo(() => {
    if (!projection) return null;

    const endBalance =
      projection.projectedDays.length > 0
        ? projection.projectedDays[projection.projectedDays.length - 1].projectedBalance
        : projection.startBalance;

    const monthlyIncome = projection.recurringItems
      .filter((item) => item.direction === 'income')
      .reduce((sum, item) => sum + item.amount, 0);

    const monthlyExpenses = projection.recurringItems
      .filter((item) => item.direction === 'expense')
      .reduce((sum, item) => sum + item.amount, 0);

    const netCashFlow = monthlyIncome - monthlyExpenses;

    return { endBalance, monthlyIncome, monthlyExpenses, netCashFlow };
  }, [projection]);

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cash Flow Projection</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-16">
            <div className="text-muted-foreground text-sm">
              Loading projection data...
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cash Flow Projection</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive text-sm text-center py-8">{error}</p>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (!projection || chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cash Flow Projection</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm text-center py-8">
            No projection data available. Run a bank scrape first.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cash Flow Projection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Header Stats Grid */}
          {headerStats && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatCard
                label="Current Balance"
                value={CURRENCY_FORMATTER.format(projection.startBalance)}
              />
              <StatCard
                label="End Balance"
                value={CURRENCY_FORMATTER.format(headerStats.endBalance)}
                color={headerStats.endBalance < LOW_BALANCE_THRESHOLD ? WARNING_COLOR : undefined}
              />
              <StatCard
                label="Monthly Income"
                value={CURRENCY_FORMATTER.format(headerStats.monthlyIncome)}
                color={HEALTHY_COLOR}
              />
              <StatCard
                label="Monthly Expenses"
                value={CURRENCY_FORMATTER.format(headerStats.monthlyExpenses)}
                color={WARNING_COLOR}
              />
              <StatCard
                label="Net Cash Flow"
                value={CURRENCY_FORMATTER.format(headerStats.netCashFlow)}
                color={headerStats.netCashFlow >= 0 ? HEALTHY_COLOR : WARNING_COLOR}
              />
            </div>
          )}

          {/* Combined Area Chart */}
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
            >
              <defs>
                <linearGradient id={HISTORICAL_FILL_ID} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={HEALTHY_COLOR} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={HEALTHY_COLOR} stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id={FORECAST_FILL_ID} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={FORECAST_COLOR} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={FORECAST_COLOR} stopOpacity={0.03} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />

              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: string) => format(parseISO(value), 'dd/MM')}
                interval="preserveStartEnd"
              />

              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => COMPACT_FORMATTER.format(value)}
              />

              <Tooltip
                content={<CustomTooltip onCardChargeClick={handleCardChargeClick} />}
              />

              {/* Low balance threshold line */}
              <ReferenceLine
                y={LOW_BALANCE_THRESHOLD}
                stroke={WARNING_COLOR}
                strokeDasharray="6 4"
                strokeOpacity={0.6}
                label={{
                  value: `Low: ${CURRENCY_FORMATTER.format(LOW_BALANCE_THRESHOLD)}`,
                  position: 'insideTopRight',
                  fontSize: 10,
                  fill: WARNING_COLOR,
                }}
              />

              {/* Today line */}
              <ReferenceLine
                x={todayDate}
                stroke={TODAY_COLOR}
                strokeWidth={2}
                strokeDasharray="4 4"
                label={{
                  value: 'Today',
                  position: 'insideTopLeft',
                  fontSize: 11,
                  fill: TODAY_COLOR,
                  fontWeight: 600,
                }}
              />

              {/* Salary deposit markers */}
              {salaryDates.map((date) => (
                <ReferenceLine
                  key={`salary-${date}`}
                  x={date}
                  stroke={HEALTHY_COLOR}
                  strokeDasharray="4 2"
                  strokeOpacity={0.7}
                />
              ))}

              {/* Card charge markers */}
              {cardChargeDates.map((date) => (
                <ReferenceLine
                  key={`card-${date}`}
                  x={date}
                  stroke="#f59e0b"
                  strokeDasharray="4 2"
                  strokeOpacity={0.7}
                />
              ))}

              {/* Historical balance area */}
              <Area
                type="monotone"
                dataKey="historicalBalance"
                name="Actual Balance"
                stroke={HEALTHY_COLOR}
                strokeWidth={2}
                fill={`url(#${HISTORICAL_FILL_ID})`}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls={false}
              />

              {/* Projected balance area */}
              <Area
                type="monotone"
                dataKey="projectedBalance"
                name="Projected Balance"
                stroke={FORECAST_COLOR}
                strokeWidth={2}
                fill={`url(#${FORECAST_FILL_ID})`}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground px-2">
            <div className="flex items-center gap-1.5">
              <div
                className="w-4 border-t-2"
                style={{ borderColor: HEALTHY_COLOR }}
              />
              <span>Actual balance</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className="w-4 border-t-2"
                style={{ borderColor: FORECAST_COLOR }}
              />
              <span>Projected balance</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className="w-4 border-t-2 border-dashed"
                style={{ borderColor: TODAY_COLOR }}
              />
              <span>Today</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className="w-4 border-t-2 border-dashed"
                style={{ borderColor: HEALTHY_COLOR }}
              />
              <span>Salary deposit</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className="w-4 border-t-2 border-dashed"
                style={{ borderColor: '#f59e0b' }}
              />
              <span>Card charge (click for details)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className="w-4 border-t-2 border-dashed"
                style={{ borderColor: WARNING_COLOR }}
              />
              <span>
                Low balance ({CURRENCY_FORMATTER.format(LOW_BALANCE_THRESHOLD)})
              </span>
            </div>
          </div>

          {/* Fixed Expenses Summary (grouped by category) */}
          {projection.recurringItems.length > 0 && (
            <>
              <h3 className="text-sm font-semibold pt-2">Fixed Income & Expenses</h3>
              <FixedExpensesSummary
                items={projection.recurringItems}
                confirmingIds={confirmingIds}
                onConfirm={handleConfirmPattern}
                onCardDetailClick={handleFixedExpenseCardClick}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Billing Details Sheet */}
      <BillingSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        details={billingDetails}
        isLoading={billingLoading}
        cardLabel={billingCardLabel}
      />
    </>
  );
}

const CashFlowProjection = memo(CashFlowProjectionInner);
export default CashFlowProjection;
