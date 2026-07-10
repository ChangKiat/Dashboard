import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
    ExpenseOverviewResponse,
    ExpenseTransaction,
    IncomeDailyPoint,
    IncomeTransaction,
} from '../api';
import {
    fetchExpenseOverview,
    fetchExpenseTransactions,
    fetchIncomeDaily,
    fetchIncomeTransactions,
} from '../api';
import { countIncomeDays, sumIncomeDailyTotals } from '../utils/incomeAggregates';
import { monthToDateRange, pickDefaultIncomeDate } from '../utils/dateRange';

import IncomeCalendar from './IncomeCalendar';
import IncomeDayDetailPanel from './IncomeDayDetailPanel';
import IncomeTransactionsTable from './IncomeTransactionsTable';
import PaymentAccountsPanel from './PaymentAccountsPanel';
import SummaryCard from './SummaryCard';

interface Props {
    month: string;
}

function formatMYR(amount: number) {
    return `RM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function IncomeSection({ month }: Props) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [overview, setOverview] = useState<ExpenseOverviewResponse | null>(null);
    const [incomes, setIncomes] = useState<IncomeTransaction[]>([]);
    const [recentExpenses, setRecentExpenses] = useState<ExpenseTransaction[]>([]);
    const [dailySeries, setDailySeries] = useState<IncomeDailyPoint[]>([]);

    const loadData = useCallback(async (options?: { silent?: boolean }) => {
        const range = monthToDateRange(month);
        const [overviewRes, incomesRes, expensesRes, dailyRes] = await Promise.all([
            fetchExpenseOverview(month),
            fetchIncomeTransactions(month),
            fetchExpenseTransactions(month),
            fetchIncomeDaily(range),
        ]);
        setOverview(overviewRes);
        setIncomes(incomesRes.entries);
        setRecentExpenses(expensesRes.entries);
        setDailySeries(dailyRes.series);

        if (!options?.silent) {
            setSelectedDate((prev) => {
                if (prev.startsWith(`${month}-`)) return prev;
                return pickDefaultIncomeDate(month, dailyRes.series);
            });
        }
    }, [month]);

    useEffect(() => {
        let cancelled = false;
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
        loadData({ silent: true }).catch((err) => {
            setError(err instanceof Error ? err.message : 'Failed to refresh');
        });
    }, [loadData]);

    const monthTotal = useMemo(() => sumIncomeDailyTotals(dailySeries), [dailySeries]);
    const incomeDays = useMemo(() => countIncomeDays(dailySeries), [dailySeries]);
    const avgPerIncomeDay = incomeDays > 0 ? monthTotal / incomeDays : null;

    const dayIncomes = useMemo(
        () =>
            incomes
                .filter((row) => row.date === selectedDate)
                .sort((a, b) => b.id - a.id),
        [incomes, selectedDate]
    );

    const daySummary = useMemo(
        () => dailySeries.find((d) => d.date === selectedDate),
        [dailySeries, selectedDate]
    );

    if (loading) return <section className="panel"><p className="muted">Loading income…</p></section>;
    if (error) return <section className="panel"><p className="error">{error}</p></section>;
    if (!overview) return null;

    return (
        <section className="panel">
            <h2>Income</h2>
            <div className="income-layout">
                <div className="income-hero-row">
                    <SummaryCard
                        label="Total income"
                        value={formatMYR(monthTotal)}
                        variant="highlight"
                    />
                    <SummaryCard label="Income days" value={String(incomeDays)} />
                    <SummaryCard
                        label="Avg per income day"
                        value={avgPerIncomeDay != null ? formatMYR(avgPerIncomeDay) : '—'}
                    />
                    <SummaryCard
                        label="Net cashflow"
                        value={formatMYR(overview.totals.netCashflow)}
                    />
                    <SummaryCard
                        label="Reimbursements"
                        value={formatMYR(overview.totals.totalReimbursed)}
                    />
                </div>

                <div className="income-main-grid">
                    <div className="income-main-left">
                        <IncomeCalendar
                            month={month}
                            dailySeries={dailySeries}
                            selectedDate={selectedDate}
                            onSelectDate={setSelectedDate}
                            formatAmount={formatMYR}
                        />
                    </div>

                    <div className="income-main-right">
                        <div className="income-section-card income-transactions-card">
                            {selectedDate ? (
                                <>
                                    <IncomeDayDetailPanel
                                        selectedDate={selectedDate}
                                        daySummary={daySummary}
                                        transactionCount={dayIncomes.length}
                                        formatAmount={formatMYR}
                                    />
                                    <IncomeTransactionsTable
                                        entries={dayIncomes}
                                        recentExpenses={recentExpenses}
                                        formatAmount={formatMYR}
                                        onChanged={handleChanged}
                                        variant="day"
                                        defaultDate={selectedDate}
                                    />
                                </>
                            ) : (
                                <p className="muted">Select a date on the calendar.</p>
                            )}
                        </div>
                    </div>
                </div>

                <PaymentAccountsPanel formatAmount={formatMYR} onChanged={handleChanged} />
            </div>
        </section>
    );
}
