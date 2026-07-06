import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ExpenseTransaction, IncomeTransaction } from '../api';
import {
    fetchExpenseTransactions,
    fetchIncomeTransactions,
} from '../api';
import { INCOME_CATEGORIES } from '../utils/incomeCategories';
import { countsTowardIncomeTotal } from '../utils/incomeAccounts';

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
    const [incomes, setIncomes] = useState<IncomeTransaction[]>([]);
    const [recentExpenses, setRecentExpenses] = useState<ExpenseTransaction[]>([]);

    const loadData = useCallback(async () => {
        const [incomesRes, expensesRes] = await Promise.all([
            fetchIncomeTransactions(month),
            fetchExpenseTransactions(month),
        ]);
        setIncomes(incomesRes.entries);
        setRecentExpenses(expensesRes.entries);
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

    const countableIncomes = useMemo(
        () => incomes.filter((row) => countsTowardIncomeTotal(row.category)),
        [incomes]
    );

    const accountTransferCount = useMemo(
        () => incomes.filter((row) => row.category === 'Account transfer').length,
        [incomes]
    );

    const totalIncome = useMemo(
        () => countableIncomes.reduce((sum, row) => sum + row.amount, 0),
        [countableIncomes]
    );

    const categoryTotals = useMemo(() => {
        const totals = new Map<string, number>();
        for (const category of INCOME_CATEGORIES) {
            if (category === 'Account transfer') continue;
            totals.set(category, 0);
        }
        for (const row of countableIncomes) {
            totals.set(row.category, (totals.get(row.category) ?? 0) + row.amount);
        }
        return totals;
    }, [countableIncomes]);

    const sortedIncomes = useMemo(
        () => [...incomes].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id),
        [incomes]
    );

    if (loading) return <section className="panel"><p className="muted">Loading income…</p></section>;
    if (error) return <section className="panel"><p className="error">{error}</p></section>;

    return (
        <section className="panel">
            <h2>Income</h2>
            <div className="income-layout">
                <div className="income-summary-row">
                    <SummaryCard label="Total income" value={formatMYR(totalIncome)} variant="highlight" />
                    {INCOME_CATEGORIES.filter((category) => category !== 'Account transfer').map(
                        (category) => (
                        <SummaryCard
                            key={category}
                            label={category}
                            value={formatMYR(categoryTotals.get(category) ?? 0)}
                        />
                    ))}
                </div>
                {accountTransferCount > 0 && (
                    <p className="muted income-transfer-note">
                        {accountTransferCount} account transfer
                        {accountTransferCount === 1 ? '' : 's'} this month (excluded from total income)
                    </p>
                )}

                <div className="income-section-card income-transactions-card">
                    <IncomeTransactionsTable
                        entries={sortedIncomes}
                        recentExpenses={recentExpenses}
                        formatAmount={formatMYR}
                        onChanged={handleChanged}
                        variant="month"
                        month={month}
                    />
                </div>

                <PaymentAccountsPanel />
            </div>
        </section>
    );
}
