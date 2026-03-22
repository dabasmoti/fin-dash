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
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import type {
  CashFlowProjection as CashFlowProjectionData,
  CategoryForecast,
  ProjectedDay,
  RecurringItemSummary,
} from '@/types/bank';
import {
  fetchCashFlowProjection,
  confirmRecurringPattern,
} from '@/lib/cashflow-utils';

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

const CV_STABLE_THRESHOLD = 0.3;
const CV_MODERATE_THRESHOLD = 0.6;

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

interface ChartDataPoint {
  date: string;
  dateLabel: string;
  historicalBalance: number | null;
  projectedBalance: number | null;
  isHistorical: boolean;
  hasSalary: boolean;
  hasCardCharge: boolean;
  eventSummary: string;
  events: Array<{
    description: string;
    amount: number;
    type: string;
  }>;
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    dataKey: string;
    payload: ChartDataPoint;
  }>;
  label?: string;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
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
            const isForecast = event.type === 'forecast';
            const color = isIncome ? HEALTHY_COLOR : WARNING_COLOR;
            const prefix = isIncome ? '+' : '-';
            const suffix = isForecast ? ' (estimated)' : '';
            return (
              <p key={idx} style={{ color }} dir="ltr">
                {prefix} {CURRENCY_FORMATTER.format(Math.abs(event.amount))} {event.description}{suffix}
              </p>
            );
          })}
        </div>
      )}
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
  const historicalPoints: ChartDataPoint[] = historicalDays.map((day) => ({
    date: day.date,
    dateLabel: format(parseISO(day.date), 'dd MMM yyyy'),
    historicalBalance: Math.round(day.projectedBalance),
    projectedBalance: null,
    isHistorical: true,
    hasSalary: day.events.some((e) => e.type === 'income'),
    hasCardCharge: day.events.some((e) => e.type === 'card_charge'),
    eventSummary: day.events
      .map(
        (e) =>
          `${e.type === 'income' ? '+' : '-'} ${CURRENCY_FORMATTER.format(Math.abs(e.amount))} ${e.description}`,
      )
      .join('\n'),
    events: day.events.map((e) => ({
      description: e.description,
      amount: e.amount,
      type: e.type,
    })),
  }));

  const projectedPoints: ChartDataPoint[] = projectedDays.map((day, idx) => ({
    date: day.date,
    dateLabel: format(parseISO(day.date), 'dd MMM yyyy'),
    historicalBalance: idx === 0 ? Math.round(day.projectedBalance) : null,
    projectedBalance: Math.round(day.projectedBalance),
    isHistorical: false,
    hasSalary: day.events.some((e) => e.type === 'income'),
    hasCardCharge: day.events.some((e) => e.type === 'card_charge'),
    eventSummary: day.events
      .map(
        (e) =>
          `${e.type === 'income' ? '+' : '-'} ${CURRENCY_FORMATTER.format(Math.abs(e.amount))} ${e.description}`,
      )
      .join('\n'),
    events: day.events.map((e) => ({
      description: e.description,
      amount: e.amount,
      type: e.type,
    })),
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

function getCvRowStyle(cv: number): string {
  if (cv < CV_STABLE_THRESHOLD) {
    return 'bg-green-50 dark:bg-green-950/20';
  }
  if (cv < CV_MODERATE_THRESHOLD) {
    return 'bg-amber-50 dark:bg-amber-950/20';
  }
  return 'bg-red-50 dark:bg-red-950/20';
}

function getCvLabel(cv: number): string {
  if (cv < CV_STABLE_THRESHOLD) return 'Stable';
  if (cv < CV_MODERATE_THRESHOLD) return 'Moderate';
  return 'Volatile';
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

        // Optimistically update the local state
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

    const categoryForecasts = projection.categoryForecasts ?? [];
    const monthlyExpenses = categoryForecasts.reduce(
      (sum, cf) => sum + cf.projectedMonthly,
      0,
    );

    const netCashFlow = monthlyIncome - monthlyExpenses;

    return { endBalance, monthlyIncome, monthlyExpenses, netCashFlow };
  }, [projection]);

  // Total projected expenses for proportion calculation
  const totalProjectedExpenses = useMemo(() => {
    const forecasts = projection?.categoryForecasts ?? [];
    return forecasts.reduce((sum, cf) => sum + cf.projectedMonthly, 0);
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

  const categoryForecasts: CategoryForecast[] = projection.categoryForecasts ?? [];

  return (
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

            <Tooltip content={<CustomTooltip />} />

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
            <span>Card charge</span>
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

        {/* Category Forecast Table */}
        {categoryForecasts.length > 0 && (
          <>
            <h3 className="text-sm font-semibold pt-2">Expense Forecast by Category</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Monthly Avg</TableHead>
                    <TableHead>Projected</TableHead>
                    <TableHead>Proportion</TableHead>
                    <TableHead>Std Dev</TableHead>
                    <TableHead>CV%</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>90% CI Range</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoryForecasts.map((cf) => {
                    const proportion =
                      totalProjectedExpenses > 0
                        ? (cf.projectedMonthly / totalProjectedExpenses) * 100
                        : 0;
                    const cvPercent = (cf.cv * 100).toFixed(1) + '%';
                    const stabilityLabel = getCvLabel(cf.cv);

                    return (
                      <TableRow key={cf.category} className={getCvRowStyle(cf.cv)}>
                        <TableCell className="font-medium">{cf.category}</TableCell>
                        <TableCell dir="ltr">
                          {CURRENCY_FORMATTER.format(cf.monthlyAvg)}
                        </TableCell>
                        <TableCell dir="ltr">
                          {CURRENCY_FORMATTER.format(cf.projectedMonthly)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.min(proportion, 100)}%`,
                                  backgroundColor: FORECAST_COLOR,
                                }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {proportion.toFixed(1)}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell dir="ltr">
                          {CURRENCY_FORMATTER.format(cf.stdDev)}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs">
                            {cvPercent} ({stabilityLabel})
                          </span>
                        </TableCell>
                        <TableCell className="capitalize">{cf.method}</TableCell>
                        <TableCell dir="ltr" className="text-xs">
                          {CURRENCY_FORMATTER.format(cf.confidenceLow)} -{' '}
                          {CURRENCY_FORMATTER.format(cf.confidenceHigh)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {/* Recurring Items Table */}
        {projection.recurringItems.length > 0 && (
          <>
            <h3 className="text-sm font-semibold pt-2">Recurring Items</h3>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">Confirmed</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Day</TableHead>
                  <TableHead>Direction</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projection.recurringItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Checkbox
                        checked={item.isUserConfirmed}
                        disabled={item.isUserConfirmed || confirmingIds.has(item.id)}
                        onCheckedChange={() => handleConfirmPattern(item)}
                      />
                    </TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate">
                      {item.description}
                    </TableCell>
                    <TableCell dir="ltr">
                      {CURRENCY_FORMATTER.format(item.amount)}
                    </TableCell>
                    <TableCell>
                      {FREQUENCY_LABELS[item.frequency] ?? item.frequency}
                    </TableCell>
                    <TableCell>{item.typicalDay > 0 ? item.typicalDay : '-'}</TableCell>
                    <TableCell>
                      <span
                        className={
                          item.direction === 'income'
                            ? 'text-green-600'
                            : 'text-red-500'
                        }
                      >
                        {DIRECTION_LABELS[item.direction] ?? item.direction}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const CashFlowProjection = memo(CashFlowProjectionInner);
export default CashFlowProjection;
