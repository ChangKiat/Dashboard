import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
    ExpenseDailyPoint,
    ExpenseOverviewResponse,
    ExpenseTransaction,
} from '../api';
import {
    fetchExpenseDaily,
    fetchExpenseOverview,
    fetchExpenseTransactions,
    fetchSyncStatus,
} from '../api';
import { useSmartRefresh } from '../hooks/useSmartRefresh';
import { usePaymentAccounts } from '../hooks/usePaymentAccounts';
import { monthToDateRange, pickDefaultExpenseDate } from '../utils/dateRange';
import { getBudgetStatus } from '../utils/budgetStatus';

import ExpenseCalendar from './ExpenseCalendar';
import ExpenseDayDetailPanel from './ExpenseDayDetailPanel';
import SummaryCard from './SummaryCard';
import TripsPanel from './TripsPanel';
import VariableExpensesTable from './VariableExpensesTable';

interface Props {
    month: string;
}

function formatMYR(amount: number) {
    return `RM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ExpensesSection({ month }: Props) {
    const { refresh: refreshAccounts } = usePaymentAccounts();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [data, setData] = useState<ExpenseOverviewResponse | null>(null);
    const [transactions, setTransactions] = useState<ExpenseTransaction[]>([]);
    const [dailySeries, setDailySeries] = useState<ExpenseDailyPoint[]>([]);
    const fingerprintRef = useRef<string | null>(null);

    const loadData = useCallback(async (options?: { silent?: boolean }) => {
        const range = monthToDateRange(month);
        const [overviewRes, transactionsRes, dailyRes] = await Promise.all([
            fetchExpenseOverview(month),
            fetchExpenseTransactions(month),
            fetchExpenseDaily(range),
        ]);
        setData(overviewRes);
        setTransactions(transactionsRes.entries);
        setDailySeries(dailyRes.series);

        if (!options?.silent) {
            setSelectedDate((prev) => {
                if (prev.startsWith(`${month}-`)) return prev;
                return pickDefaultExpenseDate(month, dailyRes.series);
            });
        }

        const status = await fetchSyncStatus(month, 'expenses');
        fingerprintRef.current = status.fingerprint;
    }, [month]);

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

    useSmartRefresh({
        month,
        scope: 'expenses',
        fingerprintRef,
        onStale: handleStale,
    });

    const actualSpendVariant = useMemo(() => {
        if (!data) return 'default' as const;
        const { budget, actualSpend } = data.totals;
        const status = getBudgetStatus(actualSpend, budget);
        if (status === 'over') return 'danger' as const;
        if (status === 'warning') return 'warning' as const;
        return 'default' as const;
    }, [data]);

    const variableCategories = useMemo(
        () => data?.variable.map((v) => v.category) ?? [],
        [data?.variable]
    );

    const dayTransactions = useMemo(
        () => transactions.filter((t) => t.date === selectedDate && t.tripLeg !== 'fund'),
        [transactions, selectedDate]
    );

    const daySummary = useMemo(
        () => dailySeries.find((d) => d.date === selectedDate),
        [dailySeries, selectedDate]
    );

    if (loading) return <section className="panel"><p className="muted">Loading expenses…</p></section>;
    if (error) return <section className="panel"><p className="error">{error}</p></section>;
    if (!data) return null;

    return (
        <section className="panel">
            <div className="expenses-layout">
                <div className="expenses-hero-row">
                    <SummaryCard
                        label="Salary after tax"
                        value={formatMYR(data.salaryAfterTax)}
                        variant="highlight"
                    />
                    <SummaryCard label="Amount can use" value={formatMYR(data.totals.amountCanUse)} />
                    <SummaryCard label="Fixed expenses" value={formatMYR(data.totals.fixExpensesTotal)} />
                    <SummaryCard label="Budget" value={formatMYR(data.totals.budget)} />
                    <SummaryCard
                        label="Actual spend"
                        value={formatMYR(data.totals.actualSpend)}
                        variant={actualSpendVariant}
                    />
                </div>

                <VariableExpensesTable rows={data.variable} transactions={transactions} formatAmount={formatMYR} />

                <div className="expenses-calendar-row">
                    <div className="expenses-calendar">
                        <ExpenseCalendar
                            month={month}
                            dailySeries={dailySeries}
                            selectedDate={selectedDate}
                            onSelectDate={setSelectedDate}
                            formatAmount={formatMYR}
                        />
                    </div>

                    {selectedDate && (
                        <div className="expenses-day-panel">
                            <ExpenseDayDetailPanel
                                selectedDate={selectedDate}
                                transactions={dayTransactions}
                                daySummary={daySummary}
                                variableCategories={variableCategories}
                                formatAmount={formatMYR}
                                onChanged={handleChanged}
                            />
                        </div>
                    )}
                </div>

                <TripsPanel
                    variableCategories={variableCategories}
                    formatAmount={formatMYR}
                    onChanged={handleChanged}
                />
            </div>
        </section>
    );
}
