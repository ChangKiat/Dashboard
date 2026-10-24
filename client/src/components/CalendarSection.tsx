import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
    ExpenseDailyPoint,
    ExpenseTransaction,
    FixedExpenseConfig,
    IncomeDailyPoint,
    IncomeTransaction,
} from '../api';
import {
    fetchExpenseDaily,
    fetchExpenseOverview,
    fetchExpenseTransactions,
    fetchFixedExpenses,
    fetchIncomeDaily,
    fetchIncomeTransactions,
    fetchSyncStatus,
} from '../api';
import SpendingHeatmap from '../charts/SpendingHeatmap';
import { formatHours, hourlyRate, useAmountUnit } from '../hooks/useAmountUnit';
import { useAmountVisibility, useFormatMYR } from '../hooks/useAmountVisibility';
import { shiftMonth, useMonth } from '../hooks/useMonth';
import { usePaymentAccounts } from '../hooks/usePaymentAccounts';
import { useRefreshSignal } from '../hooks/useRefreshSignal';
import { useSmartRefresh } from '../hooks/useSmartRefresh';
import { monthToDateRange, pickDefaultCashflowDate, todayInKL } from '../utils/dateRange';
import { longestNoSpendRun, monthSpendStats } from '../utils/spendingStats';
import CashflowCalendar from './CashflowCalendar';
import CashflowDayDetailPanel from './CashflowDayDetailPanel';
import { CalendarCheckIcon, CalendarIcon, FlameIcon, TrendUpIcon } from './icons';
import SummaryCard from './SummaryCard';

function shiftDate(iso: string, days: number) {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() + days);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
}

function formatDay(iso: string, withYear: boolean) {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('en-MY', {
        ...(withYear ? { weekday: 'long', year: 'numeric' } : {}),
        day: 'numeric',
        month: withYear ? 'long' : 'short',
    });
}

/** The heatmap's last day: today in the current month, else the month's last day. */
function heatmapEnd(month: string, today: string) {
    const monthEnd = monthToDateRange(month).end;
    return today.startsWith(month) ? today : monthEnd;
}

/** Month calendar of income and spending, with the picked day's entries beside it. */
export default function CalendarSection() {
    const { month, setMonth } = useMonth();
    const formatMYR = useFormatMYR();
    const { hidden } = useAmountVisibility();
    const { hoursPerWeek } = useAmountUnit();
    const { refresh: refreshAccounts } = usePaymentAccounts();
    const [salaryAfterTax, setSalaryAfterTax] = useState(0);
    // A year of daily spending ending at the month shown, for the heatmap and the no-spend run.
    const [yearSeries, setYearSeries] = useState<ExpenseDailyPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [variableCategories, setVariableCategories] = useState<string[]>([]);
    const [transactions, setTransactions] = useState<ExpenseTransaction[]>([]);
    const [incomes, setIncomes] = useState<IncomeTransaction[]>([]);
    const [recentExpenses, setRecentExpenses] = useState<ExpenseTransaction[]>([]);
    const [expenseSeries, setExpenseSeries] = useState<ExpenseDailyPoint[]>([]);
    const [incomeSeries, setIncomeSeries] = useState<IncomeDailyPoint[]>([]);
    const [fixedConfigs, setFixedConfigs] = useState<FixedExpenseConfig[]>([]);
    const fingerprintRef = useRef<string | null>(null);

    const loadData = useCallback(
        async (options?: { silent?: boolean }) => {
            const range = monthToDateRange(month);
            const yearEnd = heatmapEnd(month, todayInKL());
            const [
                overviewRes,
                expensesRes,
                prevExpensesRes,
                incomesRes,
                expenseDaily,
                incomeDaily,
                fixedRes,
                yearDaily,
            ] = await Promise.all([
                fetchExpenseOverview(month),
                fetchExpenseTransactions(month),
                fetchExpenseTransactions(shiftMonth(month, -1)),
                fetchIncomeTransactions(month),
                fetchExpenseDaily(range),
                fetchIncomeDaily(range),
                fetchFixedExpenses(),
                fetchExpenseDaily({ start: shiftDate(yearEnd, -364), end: yearEnd }),
            ]);
            setVariableCategories(overviewRes.variable.map((v) => v.category));
            setSalaryAfterTax(overviewRes.salaryAfterTax);
            setYearSeries(yearDaily.series);
            setFixedConfigs(fixedRes.entries);
            setTransactions(expensesRes.entries);
            setIncomes(incomesRes.entries);
            // Last month's entries too, so the day panel can suggest recent descriptions.
            const byId = new Map<number, ExpenseTransaction>();
            for (const entry of [...prevExpensesRes.entries, ...expensesRes.entries]) {
                byId.set(entry.id, entry);
            }
            setRecentExpenses(
                [...byId.values()].sort((a, b) =>
                    b.date !== a.date ? (b.date < a.date ? -1 : 1) : b.id - a.id
                )
            );
            setExpenseSeries(expenseDaily.series);
            setIncomeSeries(incomeDaily.series);

            if (!options?.silent) {
                setSelectedDate((prev) => {
                    if (prev.startsWith(`${month}-`)) return prev;
                    return pickDefaultCashflowDate(month, expenseDaily.series, incomeDaily.series);
                });
            }

            const status = await fetchSyncStatus(month, 'expenses');
            fingerprintRef.current = status.fingerprint;
        },
        [month]
    );

    useEffect(() => {
        let cancelled = false;
        fingerprintRef.current = null;
        setLoading(true);
        setError(null);
        setSelectedDate('');
        loadData()
            .catch((err) => {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [loadData]);

    const handleChanged = useCallback(() => {
        loadData().catch((err) => {
            setError(err instanceof Error ? err.message : 'Failed to refresh');
        });
        void refreshAccounts();
    }, [loadData, refreshAccounts]);

    const handleStale = useCallback(async () => {
        try {
            await loadData({ silent: true });
        } catch {
            // error left for next explicit refresh
        }
        await refreshAccounts();
    }, [loadData, refreshAccounts]);

    useSmartRefresh({ month, scope: 'expenses', fingerprintRef, onStale: handleStale });
    useRefreshSignal(handleStale);

    const fixedDescriptions = useMemo(() => fixedConfigs.map((f) => f.description), [fixedConfigs]);

    const dayExpenses = useMemo(
        () => transactions.filter((t) => t.date === selectedDate && t.tripLeg !== 'fund'),
        [transactions, selectedDate]
    );

    const dayIncomes = useMemo(
        () => incomes.filter((row) => row.date === selectedDate).sort((a, b) => b.id - a.id),
        [incomes, selectedDate]
    );

    const dayExpenseSummary = useMemo(
        () => expenseSeries.find((d) => d.date === selectedDate),
        [expenseSeries, selectedDate]
    );

    const dayIncomeSummary = useMemo(
        () => incomeSeries.find((d) => d.date === selectedDate),
        [incomeSeries, selectedDate]
    );

    const today = todayInKL();
    const stats = useMemo(() => monthSpendStats(expenseSeries, today), [expenseSeries, today]);
    const run = useMemo(() => longestNoSpendRun(yearSeries), [yearSeries]);

    if (loading) return <section className="panel"><p className="muted">Loading calendar…</p></section>;
    if (error) return <section className="panel"><p className="error">{error}</p></section>;

    const isCurrentMonth = today.startsWith(month);
    const rate = hourlyRate(salaryAfterTax, hoursPerWeek);
    const yearStart = yearSeries[0]?.date;
    const yearEnd = yearSeries[yearSeries.length - 1]?.date;
    const spendDays = yearSeries.filter((d) => d.total > 0).length;
    const heatmapSummary = yearStart
        ? `Daily spending from ${formatDay(yearStart, true)} to ${formatDay(yearEnd, true)}: money spent on ${spendDays} of ${yearSeries.length} days.`
        : 'No daily spending to show.';

    return (
        <section className="panel">
            <div className="summary-grid-4">
                <SummaryCard
                    tone="spend"
                    icon={<CalendarIcon size={26} />}
                    label="Average per day"
                    value={formatMYR(stats.averagePerDay)}
                    sub={
                        rate != null && stats.averagePerDay > 0
                            ? `≈ ${hidden ? '•• h' : formatHours(stats.averagePerDay / rate)} of work a day`
                            : `Across ${stats.daysSoFar} days`
                    }
                />
                <SummaryCard
                    tone="income"
                    icon={<CalendarCheckIcon size={26} />}
                    label="No-spend days"
                    value={String(stats.noSpendDays)}
                    sub={`Of ${stats.daysSoFar} days${isCurrentMonth ? ' so far' : ''}`}
                />
                <SummaryCard
                    tone="net"
                    icon={<FlameIcon size={26} />}
                    label="Longest no-spend run"
                    value={`${run.days} ${run.days === 1 ? 'day' : 'days'}`}
                    sub={
                        run.from && run.to
                            ? `${
                                  run.from === run.to
                                      ? formatDay(run.from, false)
                                      : `${formatDay(run.from, false)} – ${formatDay(run.to, false)}`
                              } · last 12 months`
                            : 'In the last 12 months'
                    }
                />
                <SummaryCard
                    tone="net"
                    icon={<TrendUpIcon size={26} />}
                    label="Biggest day"
                    value={stats.biggest ? formatMYR(stats.biggest.total) : '—'}
                    sub={stats.biggest ? formatDay(stats.biggest.date, true) : 'Nothing spent yet'}
                />
            </div>

            <div className="expenses-calendar-row">
                <div className="expenses-calendar">
                    <CashflowCalendar
                        month={month}
                        onMonthChange={setMonth}
                        expenseSeries={expenseSeries}
                        incomeSeries={incomeSeries}
                        transactions={transactions}
                        fixedDescriptions={fixedDescriptions}
                        selectedDate={selectedDate}
                        onSelectDate={setSelectedDate}
                        formatAmount={formatMYR}
                    />
                </div>

                {selectedDate && (
                    <div className="expenses-day-panel">
                        <CashflowDayDetailPanel
                            selectedDate={selectedDate}
                            expenses={dayExpenses}
                            incomes={dayIncomes}
                            recentExpenses={recentExpenses}
                            expenseSummary={dayExpenseSummary}
                            incomeSummary={dayIncomeSummary}
                            variableCategories={variableCategories}
                            fixedDescriptions={fixedDescriptions}
                            formatAmount={formatMYR}
                            onChanged={handleChanged}
                        />
                    </div>
                )}
            </div>

            <section className="card heatmap-card" aria-labelledby="heatmap-title">
                <h3 id="heatmap-title">
                    {isCurrentMonth || !yearEnd
                        ? 'The last 12 months'
                        : `The 12 months to ${new Date(`${yearEnd}T12:00:00`).toLocaleDateString('en-MY', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                          })}`}
                </h3>
                <p className="heatmap-sub">Each square is a day; darker means more spent</p>
                <SpendingHeatmap series={yearSeries} formatAmount={formatMYR} summary={heatmapSummary} />
            </section>
        </section>
    );
}
