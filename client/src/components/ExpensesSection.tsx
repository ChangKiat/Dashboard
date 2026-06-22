import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ExpenseDailyPoint, ExpenseOverviewResponse, ExpenseTransaction, FixedExpenseConfig } from '../api';
import {
    fetchExpenseDaily,
    fetchExpenseOverview,
    fetchExpenseTransactions,
    fetchFixedExpenses,
} from '../api';
import { monthToDateRange, pickDefaultExpenseDate } from '../utils/dateRange';
import { getBudgetStatus } from '../utils/budgetStatus';

import ExpenseCalendar from './ExpenseCalendar';
import ExpenseDayDetailPanel from './ExpenseDayDetailPanel';
import FixedExpensesTable from './FixedExpensesTable';
import SummaryCard from './SummaryCard';
import VariableExpensesTable from './VariableExpensesTable';

interface Props {
    month: string;
}

function formatMYR(amount: number) {
    return `RM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ExpensesSection({ month }: Props) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [data, setData] = useState<ExpenseOverviewResponse | null>(null);
    const [transactions, setTransactions] = useState<ExpenseTransaction[]>([]);
    const [fixedConfigs, setFixedConfigs] = useState<FixedExpenseConfig[]>([]);
    const [dailySeries, setDailySeries] = useState<ExpenseDailyPoint[]>([]);

    const loadData = useCallback(async () => {
        const range = monthToDateRange(month);
        const [overviewRes, transactionsRes, fixedRes, dailyRes] = await Promise.all([
            fetchExpenseOverview(month),
            fetchExpenseTransactions(month),
            fetchFixedExpenses(),
            fetchExpenseDaily(range),
        ]);
        setData(overviewRes);
        setTransactions(transactionsRes.entries);
        setFixedConfigs(fixedRes.entries);
        setDailySeries(dailyRes.series);

        setSelectedDate((prev) => {
            if (prev.startsWith(`${month}-`)) return prev;
            return pickDefaultExpenseDate(month, dailyRes.series);
        });
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
        loadData().catch((err) => {
            setError(err instanceof Error ? err.message : 'Failed to refresh');
        });
    }, [loadData]);

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
        () => transactions.filter((t) => t.date === selectedDate),
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
            <h2>Expenses</h2>
            <div className="expenses-layout">
                <div className="expenses-hero-row">
                    <SummaryCard
                        label="Salary After Tax"
                        value={formatMYR(data.salaryAfterTax)}
                        variant="highlight"
                    />
                    <SummaryCard label="Amount can use" value={formatMYR(data.totals.amountCanUse)} />
                    <SummaryCard label="Fix Expenses Total" value={formatMYR(data.totals.fixExpensesTotal)} />
                    <SummaryCard label="Budget" value={formatMYR(data.totals.budget)} />
                    <SummaryCard
                        label="Actual spend"
                        value={formatMYR(data.totals.actualSpend)}
                        variant={actualSpendVariant}
                    />
                </div>

                <VariableExpensesTable rows={data.variable} formatAmount={formatMYR} />

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

                <FixedExpensesTable
                    rows={fixedConfigs}
                    variableCategories={variableCategories}
                    formatAmount={formatMYR}
                    onChanged={handleChanged}
                />
            </div>
        </section>
    );
}
