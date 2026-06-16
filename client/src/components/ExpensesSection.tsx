import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ExpenseOverviewResponse, ExpenseTransaction, FixedExpenseConfig } from '../api';
import {
    fetchExpenseDaily,
    fetchExpenseOverview,
    fetchExpenseTransactions,
    fetchFixedExpenses,
} from '../api';
import { monthToDateRange } from '../utils/dateRange';
import { getBudgetStatus } from '../utils/budgetStatus';

import DailyBarChart from '../charts/DailyBarChart';
import FixedExpenseBarChart from '../charts/FixedExpenseBarChart';
import ExpenseTransactionsTable from './ExpenseTransactionsTable';
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
    const [data, setData] = useState<ExpenseOverviewResponse | null>(null);
    const [transactions, setTransactions] = useState<ExpenseTransaction[]>([]);
    const [fixedConfigs, setFixedConfigs] = useState<FixedExpenseConfig[]>([]);
    const [dailySeries, setDailySeries] = useState<{ date: string; value: number }[]>([]);

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
        setDailySeries(dailyRes.series.map((d) => ({ date: d.date, value: d.total })));
    }, [month]);

    useEffect(() => {
        let cancelled = false;
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
    }, [loadData]);

    const actualSpendVariant = useMemo(() => {
        if (!data) return 'default' as const;
        const { budget, actualSpend } = data.totals;
        const status = getBudgetStatus(actualSpend, budget);
        if (status === 'over') return 'danger' as const;
        if (status === 'warning') return 'warning' as const;
        return 'default' as const;
    }, [data]);

    if (loading) return <section className="panel"><p className="muted">Loading expenses…</p></section>;
    if (error) return <section className="panel"><p className="error">{error}</p></section>;
    if (!data) return null;

    const categories = data.variable.map((v) => v.category);

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

                <div className="chart-card expenses-combo-chart">
                    <h3>Daily Spending</h3>
                    <div className="chart-card-body">
                        <DailyBarChart
                            data={dailySeries}
                            valueFormatter={formatMYR}
                            label="Spending"
                            height="100%"
                        />
                    </div>
                </div>

                <div className="chart-card expenses-pie-chart">
                    <h3>Fixed Expenses Breakdown</h3>
                    <div className="chart-card-body">
                        <FixedExpenseBarChart rows={data.fixed} valueFormatter={formatMYR} />
                    </div>
                </div>

                <FixedExpensesTable
                    rows={fixedConfigs}
                    formatAmount={formatMYR}
                    onChanged={handleChanged}
                />

                <div className="chart-card full-width expenses-transactions">
                    <h3>Transactions</h3>
                    <ExpenseTransactionsTable
                        entries={transactions}
                        categories={categories}
                        formatAmount={formatMYR}
                        onChanged={handleChanged}
                    />
                </div>
            </div>
        </section>
    );
}
