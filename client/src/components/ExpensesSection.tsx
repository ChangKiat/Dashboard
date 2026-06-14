import { useCallback, useEffect, useState } from 'react';

import type { ExpenseOverviewResponse, ExpenseTransaction, FixedExpenseConfig } from '../api';
import {
    fetchExpenseOverview,
    fetchExpenseTransactions,
    fetchFixedExpenses,
} from '../api';

import BudgetVsSpendingChart from '../charts/BudgetVsSpendingChart';
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

    const loadData = useCallback(async () => {
        const [overviewRes, transactionsRes, fixedRes] = await Promise.all([
            fetchExpenseOverview(month),
            fetchExpenseTransactions(month),
            fetchFixedExpenses(),
        ]);
        setData(overviewRes);
        setTransactions(transactionsRes.entries);
        setFixedConfigs(fixedRes.entries);
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

    if (loading) return <section className="panel"><p className="muted">Loading expenses…</p></section>;
    if (error) return <section className="panel"><p className="error">{error}</p></section>;
    if (!data) return null;

    const categories = data.variable.map((v) => v.category);

    return (
        <section className="panel">
            <h2>Expenses</h2>
            <div className="expenses-layout">
                <VariableExpensesTable rows={data.variable} formatAmount={formatMYR} />

                <FixedExpensesTable
                    rows={fixedConfigs}
                    formatAmount={formatMYR}
                    onChanged={handleChanged}
                />

                <div className="chart-card expenses-combo-chart">
                    <h3>Expense Graph</h3>
                    <BudgetVsSpendingChart rows={data.variable} valueFormatter={formatMYR} />
                </div>

                <div className="chart-card expenses-pie-chart">
                    <h3>Fixed Expenses Breakdown</h3>
                    <FixedExpenseBarChart rows={data.fixed} valueFormatter={formatMYR} />
                </div>

                <div className="expenses-summary-row">
                    <SummaryCard label="Salary After Tax" value={formatMYR(data.salaryAfterTax)} />
                    <SummaryCard label="Fix Expenses Total" value={formatMYR(data.totals.fixExpensesTotal)} />
                    <SummaryCard label="Amount can use" value={formatMYR(data.totals.amountCanUse)} />
                    <SummaryCard label="Budget" value={formatMYR(data.totals.budget)} />
                    <SummaryCard label="Actual spend" value={formatMYR(data.totals.actualSpend)} />
                </div>

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
