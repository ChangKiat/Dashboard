import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ExpenseOverviewResponse, MonthlyCashflowPoint } from '../api';
import {
    applyDueFixedContributions,
    fetchExpenseOverview,
    fetchMonthlyCashflow,
    fetchSyncStatus,
} from '../api';
import CashflowTrendChart from '../charts/CashflowTrendChart';
import { formatHours, hourlyRate, monthlyWorkHours, useAmountUnit } from '../hooks/useAmountUnit';
import { useAmountVisibility, useFormatMYR } from '../hooks/useAmountVisibility';
import { currentMonthInKL, formatMonthLabel, useMonth } from '../hooks/useMonth';
import { usePaymentAccounts } from '../hooks/usePaymentAccounts';
import {
    budgetMonthsFor,
    chartMonthsFor,
    periodEndMonthFor,
    periodLabel,
    periodRange,
    usePeriod,
} from '../hooks/usePeriod';
import { useRefreshSignal } from '../hooks/useRefreshSignal';
import { useSmartRefresh } from '../hooks/useSmartRefresh';
import { getBudgetStatus } from '../utils/budgetStatus';
import { formatCompactMYR } from '../utils/money';

import AmountUnitToggle from './AmountUnitToggle';
import { BankIcon, IncomeIcon, TrendUpIcon, WalletIcon } from './icons';
import PaymentAccountsPanel from './PaymentAccountsPanel';
import PeriodControls from './PeriodControls';
import SummaryCard from './SummaryCard';

const hasEntries = (p: MonthlyCashflowPoint) => p.income !== 0 || p.spending !== 0;

export default function CashflowSection() {
    const { month, setMonth } = useMonth();
    const { period, setPeriod } = usePeriod();
    const periodEndMonth = periodEndMonthFor(period, month, currentMonthInKL());
    const formatMYR = useFormatMYR();
    const { hidden } = useAmountVisibility();
    const { unit, setUnit, hoursPerWeek, setHoursPerWeek } = useAmountUnit();
    const { accounts, loading: accountsLoading, refresh: refreshAccounts } = usePaymentAccounts();
    const [data, setData] = useState<ExpenseOverviewResponse | null>(null);
    const [monthlySeries, setMonthlySeries] = useState<MonthlyCashflowPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const fingerprintRef = useRef<string | null>(null);

    const loadData = useCallback(async () => {
        const dates = period === 'month' ? undefined : periodRange(period, periodEndMonth);
        const chart = chartMonthsFor(period, periodEndMonth);
        const [overviewRes, monthlyRes] = await Promise.all([
            fetchExpenseOverview(periodEndMonth, dates),
            fetchMonthlyCashflow(chart.end, chart.count),
        ]);
        setData(overviewRes);
        setMonthlySeries(monthlyRes.series);

        const status = await fetchSyncStatus(periodEndMonth, 'expenses');
        fingerprintRef.current = status.fingerprint;
    }, [period, periodEndMonth]);

    useEffect(() => {
        let cancelled = false;
        fingerprintRef.current = null;
        setLoading(true);
        setError(null);
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
            await loadData();
        } catch {
            // error left for next explicit refresh
        }
        await refreshAccounts();
    }, [loadData, refreshAccounts]);

    useSmartRefresh({
        month: periodEndMonth,
        scope: 'expenses',
        fingerprintRef,
        onStale: handleStale,
    });

    useRefreshSignal(handleStale);

    /** First month with any income or spending (the "All" period starts there). */
    const firstDataMonth = useMemo(() => monthlySeries.find(hasEntries)?.month ?? null, [monthlySeries]);
    const budgetMonths = budgetMonthsFor(period, periodEndMonth, monthlySeries.filter(hasEntries).length);

    const actualSpendVariant = useMemo(() => {
        if (!data) return 'default' as const;
        const status = getBudgetStatus(data.totals.actualSpend, data.totals.budget * budgetMonths);
        if (status === 'over') return 'danger' as const;
        if (status === 'warning') return 'warning' as const;
        return 'default' as const;
    }, [data, budgetMonths]);

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

    // Month and All drop leading months with no entries; a chosen range shows all its months.
    const trendSeries = useMemo(() => {
        if (period !== 'month' && period !== 'all') return monthlySeries;
        const first = monthlySeries.findIndex(hasEntries);
        return first === -1 ? [] : monthlySeries.slice(first);
    }, [monthlySeries, period]);

    const rate = data ? hourlyRate(data.salaryAfterTax, hoursPerWeek) : null;
    const effectiveUnit = data && rate == null ? 'rm' : unit;
    const showHours = effectiveUnit === 'hours' && rate != null;
    const toHours = (amount: number) => (hidden ? '•• h' : formatHours(amount / rate!));
    /** A card's main figure: RM, or hours of work when Hours is on. */
    const formatFigure = (amount: number) => (showHours ? toHours(amount) : formatMYR(amount));

    const toolbar = (
        <div className="page-toolbar">
            <div className="page-toolbar-group">
                <PeriodControls
                    period={period}
                    onPeriodChange={setPeriod}
                    month={month}
                    onMonthChange={setMonth}
                    firstDataMonth={firstDataMonth}
                    allEndMonth={periodEndMonth}
                />
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
    const chartEnd = monthlySeries[monthlySeries.length - 1]?.month ?? periodEndMonth;
    let trendRange: string;
    if (period === 'month') {
        trendRange = `The 12 months up to ${formatMonthLabel(chartEnd)}`;
        if (trendSeries.length > 0 && trendSeries.length < monthlySeries.length) {
            trendRange += ` · entries start ${formatMonthLabel(trendSeries[0].month)}`;
        }
    } else if (period === 'all') {
        trendRange = `${formatMonthLabel(trendSeries[0]?.month ?? chartEnd)} to ${formatMonthLabel(chartEnd)}`;
    } else {
        trendRange = `${periodLabel(period, periodEndMonth, null)}, month by month`;
    }

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
                        <p className="empty-chart">No income or spending in this period.</p>
                    )}
                    <p className="cashflow-trend-note">
                        Income leaves out reimbursements and transfers between your own accounts; spending
                        is after reimbursements.
                    </p>
                </section>

                <PaymentAccountsPanel
                    mode="balances"
                    month={periodEndMonth}
                    formatAmount={formatMYR}
                    onChanged={handleChanged}
                />
            </div>
        </section>
    );
}
