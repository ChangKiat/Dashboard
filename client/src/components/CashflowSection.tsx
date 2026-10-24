import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
    ExpenseDailyPoint,
    ExpenseOverviewResponse,
    ExpenseTransaction,
    FixedExpenseConfig,
    IncomeDailyPoint,
    IncomeTransaction,
    MonthlyCashflowPoint,
} from '../api';
import {
    applyDueFixedContributions,
    fetchExpenseDaily,
    fetchExpenseOverview,
    fetchExpenseTransactions,
    fetchFixedExpenses,
    fetchIncomeDaily,
    fetchIncomeTransactions,
    fetchMonthlyCashflow,
    fetchSyncStatus,
} from '../api';
import CashflowTrendChart from '../charts/CashflowTrendChart';
import { formatHours, hourlyRate, monthlyWorkHours, useAmountUnit } from '../hooks/useAmountUnit';
import { useAmountVisibility, useFormatMYR } from '../hooks/useAmountVisibility';
import { currentMonthInKL, formatMonthLabel, shiftMonth, useMonth } from '../hooks/useMonth';
import { usePaymentAccounts } from '../hooks/usePaymentAccounts';
import { monthsBetween, periodLabel, periodMonths, periodRange, usePeriod } from '../hooks/usePeriod';
import { useRefreshSignal } from '../hooks/useRefreshSignal';
import { useSmartRefresh } from '../hooks/useSmartRefresh';
import { getBudgetStatus } from '../utils/budgetStatus';
import { monthToDateRange, pickDefaultCashflowDate } from '../utils/dateRange';
import { formatCompactMYR } from '../utils/money';

import AmountUnitToggle from './AmountUnitToggle';
import CashflowCalendar from './CashflowCalendar';
import CashflowDayDetailPanel from './CashflowDayDetailPanel';
import { BankIcon, IncomeIcon, TrendUpIcon, WalletIcon } from './icons';
import MonthPicker from './MonthPicker';
import PaymentAccountsPanel from './PaymentAccountsPanel';
import PeriodPills from './PeriodPills';
import SummaryCard from './SummaryCard';
import VariableExpensesTable from './VariableExpensesTable';

export default function CashflowSection() {
    const { month, setMonth } = useMonth();
    const { period, setPeriod } = usePeriod();
    // "All" always runs to this month; the other periods end at the month picked.
    const periodEndMonth = period === 'all' ? currentMonthInKL() : month;
    const formatMYR = useFormatMYR();
    const { hidden } = useAmountVisibility();
    const { unit, setUnit, hoursPerWeek, setHoursPerWeek } = useAmountUnit();
    const { accounts, loading: accountsLoading, refresh: refreshAccounts } = usePaymentAccounts();
    const [monthlySeries, setMonthlySeries] = useState<MonthlyCashflowPoint[]>([]);
    // Transactions across a multi-month period, for the Variable expenses details; null for Month.
    const [periodExpenses, setPeriodExpenses] = useState<ExpenseTransaction[] | null>(null);
    const [periodIncomes, setPeriodIncomes] = useState<IncomeTransaction[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [data, setData] = useState<ExpenseOverviewResponse | null>(null);
    const [transactions, setTransactions] = useState<ExpenseTransaction[]>([]);
    const [incomes, setIncomes] = useState<IncomeTransaction[]>([]);
    const [recentExpenses, setRecentExpenses] = useState<ExpenseTransaction[]>([]);
    const [expenseSeries, setExpenseSeries] = useState<ExpenseDailyPoint[]>([]);
    const [incomeSeries, setIncomeSeries] = useState<IncomeDailyPoint[]>([]);
    const [fixedConfigs, setFixedConfigs] = useState<FixedExpenseConfig[]>([]);
    const fingerprintRef = useRef<string | null>(null);

    const loadData = useCallback(async (options?: { silent?: boolean }) => {
        // The calendar and day panel always show `month`; the cards, budgets and chart follow the period.
        const range = monthToDateRange(month);
        const prevMonth = shiftMonth(month, -1);
        const dates = period === 'month' ? undefined : periodRange(period, periodEndMonth);
        const chartEnd = periodMonths(period, periodEndMonth)?.last ?? periodEndMonth;
        const [
            overviewRes,
            expensesRes,
            prevExpensesRes,
            incomesRes,
            expenseDaily,
            incomeDaily,
            fixedRes,
            monthlyRes,
            periodExpensesRes,
            periodIncomesRes,
        ] = await Promise.all([
            fetchExpenseOverview(periodEndMonth, dates),
            fetchExpenseTransactions(month),
            fetchExpenseTransactions(prevMonth),
            fetchIncomeTransactions(month),
            fetchExpenseDaily(range),
            fetchIncomeDaily(range),
            fetchFixedExpenses(),
            fetchMonthlyCashflow(chartEnd, period === 'all' ? 120 : 12),
            dates ? fetchExpenseTransactions(periodEndMonth, dates) : null,
            dates ? fetchIncomeTransactions(periodEndMonth, dates) : null,
        ]);
        setData(overviewRes);
        setMonthlySeries(monthlyRes.series);
        setPeriodExpenses(periodExpensesRes?.entries ?? null);
        setPeriodIncomes(periodIncomesRes?.entries ?? null);
        setFixedConfigs(fixedRes.entries);
        setTransactions(expensesRes.entries);
        setIncomes(incomesRes.entries);
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
    }, [month, period, periodEndMonth]);

    useEffect(() => {
        let cancelled = false;
        fingerprintRef.current = null;
        setLoading(true);
        setError(null);
        // Keep the picked day when only the period changes.
        setSelectedDate((prev) => (prev.startsWith(`${month}-`) ? prev : ''));

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

    useEffect(() => {
        applyDueFixedContributions()
            .then((result) => {
                if (result.applied > 0) handleChanged();
            })
            .catch(() => {
                /* ignore auto-apply errors; Contribute remains available */
            });
    }, [handleChanged]);

    const handleStale = useCallback(async () => {
        try {
            await loadData({ silent: true });
        } catch {
            // error left for next explicit refresh
        }
        await refreshAccounts();
    }, [loadData, refreshAccounts]);

    useSmartRefresh({
        month,
        scope: 'expenses',
        fingerprintRef,
        onStale: handleStale,
    });

    useRefreshSignal(handleStale);

    /** First month with any income or spending (the "All" period starts there). */
    const firstDataMonth = useMemo(
        () => monthlySeries.find((p) => p.income !== 0 || p.spending !== 0)?.month ?? null,
        [monthlySeries]
    );
    const coveredMonths = periodMonths(period, periodEndMonth);
    /**
     * Monthly budgets are multiplied by this so a 3-month period gets 3 months of budget.
     * "All" counts only months that have entries, so long gaps between old records don't add budget.
     */
    const budgetMonths = coveredMonths
        ? monthsBetween(coveredMonths.first, coveredMonths.last)
        : Math.max(1, monthlySeries.filter((p) => p.income !== 0 || p.spending !== 0).length);

    const actualSpendVariant = useMemo(() => {
        if (!data) return 'default' as const;
        const status = getBudgetStatus(data.totals.actualSpend, data.totals.budget * budgetMonths);
        if (status === 'over') return 'danger' as const;
        if (status === 'warning') return 'warning' as const;
        return 'default' as const;
    }, [data, budgetMonths]);

    const budgetLeft = data ? data.totals.budget * budgetMonths - data.totals.actualSpend : 0;

    const netWorth = useMemo(() => {
        let total = 0;
        let count = 0;
        for (const account of accounts) {
            if (!account.active) continue;
            count += 1;
            if (account.accountType === 'credit') total -= account.amountOwed ?? 0;
            else if (account.accountType === 'investment') total += account.nav ?? account.balance ?? 0;
            else total += account.balance ?? 0;
        }
        return { total, count };
    }, [accounts]);

    const variableCategories = useMemo(
        () => data?.variable.map((v) => v.category) ?? [],
        [data?.variable]
    );

    const fixedDescriptions = useMemo(
        () => fixedConfigs.map((f) => f.description),
        [fixedConfigs]
    );

    const dayExpenses = useMemo(
        () => transactions.filter((t) => t.date === selectedDate && t.tripLeg !== 'fund'),
        [transactions, selectedDate]
    );

    const dayIncomes = useMemo(
        () =>
            incomes
                .filter((row) => row.date === selectedDate)
                .sort((a, b) => b.id - a.id),
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

    // Leading months with no entries at all are left off the chart.
    const trendSeries = useMemo(() => {
        const first = monthlySeries.findIndex((p) => p.income !== 0 || p.spending !== 0);
        return first === -1 ? [] : monthlySeries.slice(first);
    }, [monthlySeries]);

    const rate = data ? hourlyRate(data.salaryAfterTax, hoursPerWeek) : null;
    const effectiveUnit = data && rate == null ? 'rm' : unit;
    const showHours = effectiveUnit === 'hours' && rate != null;
    const toHours = (amount: number) => (hidden ? '•• h' : formatHours(amount / rate!));
    /** A card's main figure: RM, or hours of work when Hours is on. */
    const formatFigure = (amount: number) => (showHours ? toHours(amount) : formatMYR(amount));

    const toolbar = (
        <>
            <div className="page-toolbar">
                <div className="page-toolbar-group">
                    <PeriodPills value={period} onChange={setPeriod} />
                    {period === 'all' ? (
                        <span className="period-label">{periodLabel('all', periodEndMonth, firstDataMonth)}</span>
                    ) : (
                        <MonthPicker
                            month={month}
                            onChange={setMonth}
                            label={period === 'month' ? undefined : periodLabel(period, month, null)}
                            step={period === 'year' ? 12 : 1}
                        />
                    )}
                </div>
                <div className="page-toolbar-group">
                    <AmountUnitToggle
                        unit={effectiveUnit}
                        onUnitChange={setUnit}
                        hoursPerWeek={hoursPerWeek}
                        onHoursPerWeekChange={setHoursPerWeek}
                        rateLabel={rate == null ? null : `${formatMYR(rate)}/h`}
                        rateExplanation={
                            data
                                ? `${formatMYR(data.salaryAfterTax)} take-home ÷ ${Math.round(
                                      monthlyWorkHours(hoursPerWeek)
                                  )} h a month`
                                : null
                        }
                        hoursDisabledReason={data && rate == null ? 'Needs your salary after tax' : undefined}
                    />
                </div>
            </div>
        </>
    );

    if (loading) {
        return (
            <section className="panel">
                {toolbar}
                <p className="muted">Loading cashflow…</p>
            </section>
        );
    }
    if (error) {
        return (
            <section className="panel">
                {toolbar}
                <p className="error">{error}</p>
            </section>
        );
    }
    if (!data) return null;

    // Income leaves out reimbursements (they reduce spending instead), so income − spend = net.
    const { actualSpend, totalIncome, netCashflow } = data.totals;
    const budget = data.totals.budget * budgetMonths;
    const isMultiMonth = period !== 'month';
    const variableRows =
        budgetMonths === 1
            ? data.variable
            : data.variable.map((row) => {
                  const periodBudget = row.monthlyBudget * budgetMonths;
                  return { ...row, monthlyBudget: periodBudget, overBudget: row.spending > periodBudget };
              });
    const chartEnd = coveredMonths?.last ?? periodEndMonth;

    const chartData = showHours
        ? trendSeries.map((p) => ({ ...p, income: p.income / rate!, spending: p.spending / rate!, net: p.net / rate! }))
        : trendSeries;
    const formatChartValue = (value: number) =>
        showHours ? (hidden ? '•• h' : formatHours(value)) : formatMYR(value);
    const formatChartAxis = (value: number) => {
        if (hidden) return '••';
        if (showHours) return `${Math.round(value).toLocaleString('en-MY')} h`;
        return formatCompactMYR(value);
    };
    const trendRange =
        trendSeries.length === monthlySeries.length && period !== 'all'
            ? `The 12 months up to ${formatMonthLabel(chartEnd)}`
            : `${formatMonthLabel(trendSeries[0]?.month ?? chartEnd)} to ${formatMonthLabel(chartEnd)}`;

    return (
        <section className="panel">
            {toolbar}
            <div className="expenses-layout">
                <div className="cashflow-summary-grid">
                    <SummaryCard
                        tone="spend"
                        icon={<WalletIcon size={26} />}
                        label="Actual spend"
                        value={formatFigure(actualSpend)}
                        variant={actualSpendVariant}
                        sub={
                            showHours
                                ? `${formatMYR(actualSpend)} · budget ${toHours(budget)}`
                                : `of ${formatMYR(budget)} budget`
                        }
                    />
                    <SummaryCard
                        tone="income"
                        icon={<IncomeIcon size={26} />}
                        label="Total income"
                        value={formatFigure(totalIncome)}
                        sub={
                            showHours
                                ? formatMYR(totalIncome)
                                : `Salary after tax ${formatMYR(data.salaryAfterTax)}${isMultiMonth ? ' a month' : ''}`
                        }
                    />
                    <SummaryCard
                        tone="net"
                        icon={<TrendUpIcon size={26} />}
                        label="Net cashflow"
                        value={formatFigure(netCashflow)}
                        variant={netCashflow < 0 ? 'danger' : 'default'}
                        sub={
                            showHours
                                ? formatMYR(netCashflow)
                                : netCashflow < 0
                                  ? 'Spent more than came in'
                                  : 'Left over after spending'
                        }
                    />
                    <SummaryCard
                        tone="net"
                        icon={<BankIcon size={26} />}
                        label="Net worth"
                        value={accountsLoading ? '…' : formatFigure(netWorth.total)}
                        sub={
                            showHours && !accountsLoading
                                ? formatMYR(netWorth.total)
                                : `Accounts + investments − credit cards · ${netWorth.count} accounts`
                        }
                    />
                </div>

                <section className="card cashflow-trend" aria-labelledby="cashflow-trend-title">
                    <div className="cashflow-trend-header">
                        <div>
                            <h3 id="cashflow-trend-title">Cash flow</h3>
                            <p className="cashflow-trend-sub">
                                {trendRange}
                                {showHours && ' · in hours of work'}
                            </p>
                        </div>
                        <div className="chart-legend" aria-hidden="true">
                            <span>
                                <span className="legend-dot legend-dot--income" />
                                Income
                            </span>
                            <span>
                                <span className="legend-dot legend-dot--spending" />
                                Spending
                            </span>
                            <span>
                                <span className="legend-line" />
                                Net
                            </span>
                        </div>
                    </div>
                    {chartData.length > 0 ? (
                        <CashflowTrendChart
                            data={chartData}
                            formatValue={formatChartValue}
                            formatAxis={formatChartAxis}
                        />
                    ) : (
                        <p className="empty-chart">No income or spending in the last 12 months.</p>
                    )}
                    <p className="cashflow-trend-note">
                        Income leaves out reimbursements and transfers between your own accounts; spending
                        is after reimbursements.
                    </p>
                </section>

                <VariableExpensesTable
                    rows={variableRows}
                    transactions={periodExpenses ?? transactions}
                    incomes={periodIncomes ?? incomes}
                    formatAmount={formatMYR}
                    amountCanUse={data.totals.amountCanUse * budgetMonths}
                    budget={budget}
                    budgetLeft={budgetLeft}
                    periodLabel={isMultiMonth ? periodLabel(period, periodEndMonth, firstDataMonth) : undefined}
                    subtitle={
                        isMultiMonth
                            ? `${periodLabel(period, periodEndMonth, firstDataMonth)} · budgets cover ${budgetMonths} ${
                                  budgetMonths === 1 ? 'month' : 'months'
                              }${period === 'all' ? ' with entries' : ''}`
                            : undefined
                    }
                />

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

                <PaymentAccountsPanel
                    mode="balances"
                    month={month}
                    formatAmount={formatMYR}
                    onChanged={handleChanged}
                />
            </div>
        </section>
    );
}
