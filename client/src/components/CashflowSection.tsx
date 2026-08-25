import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
    ExpenseDailyPoint,
    ExpenseOverviewResponse,
    ExpenseTransaction,
    IncomeDailyPoint,
    IncomeTransaction,
} from '../api';
import {
    applyDueFixedContributions,
    fetchExpenseDaily,
    fetchExpenseOverview,
    fetchExpenseTransactions,
    fetchIncomeDaily,
    fetchIncomeTransactions,
    fetchSyncStatus,
} from '../api';
import { shiftMonth } from '../hooks/useMonth';
import { usePaymentAccounts } from '../hooks/usePaymentAccounts';
import { useSmartRefresh } from '../hooks/useSmartRefresh';
import { getBudgetStatus } from '../utils/budgetStatus';
import { monthToDateRange, pickDefaultCashflowDate } from '../utils/dateRange';
import { sumIncomeDailyTotals } from '../utils/incomeAggregates';

import CashflowCalendar from './CashflowCalendar';
import CashflowDayDetailPanel from './CashflowDayDetailPanel';
import PaymentAccountsPanel from './PaymentAccountsPanel';
import SummaryCard from './SummaryCard';
import TripsPanel from './TripsPanel';
import VariableExpensesTable from './VariableExpensesTable';

interface Props {
    month: string;
}

function formatMYR(amount: number) {
    return `RM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CashflowSection({ month }: Props) {
    const { refresh: refreshAccounts } = usePaymentAccounts();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [data, setData] = useState<ExpenseOverviewResponse | null>(null);
    const [transactions, setTransactions] = useState<ExpenseTransaction[]>([]);
    const [incomes, setIncomes] = useState<IncomeTransaction[]>([]);
    const [recentExpenses, setRecentExpenses] = useState<ExpenseTransaction[]>([]);
    const [expenseSeries, setExpenseSeries] = useState<ExpenseDailyPoint[]>([]);
    const [incomeSeries, setIncomeSeries] = useState<IncomeDailyPoint[]>([]);
    const fingerprintRef = useRef<string | null>(null);

    const loadData = useCallback(async (options?: { silent?: boolean }) => {
        const range = monthToDateRange(month);
        const prevMonth = shiftMonth(month, -1);
        const [overviewRes, expensesRes, prevExpensesRes, incomesRes, expenseDaily, incomeDaily] =
            await Promise.all([
                fetchExpenseOverview(month),
                fetchExpenseTransactions(month),
                fetchExpenseTransactions(prevMonth),
                fetchIncomeTransactions(month),
                fetchExpenseDaily(range),
                fetchIncomeDaily(range),
            ]);
        setData(overviewRes);
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

    const actualSpendVariant = useMemo(() => {
        if (!data) return 'default' as const;
        const { budget, actualSpend } = data.totals;
        const status = getBudgetStatus(actualSpend, budget);
        if (status === 'over') return 'danger' as const;
        if (status === 'warning') return 'warning' as const;
        return 'default' as const;
    }, [data]);

    const monthIncome = useMemo(() => sumIncomeDailyTotals(incomeSeries), [incomeSeries]);

    const budgetLeft = data ? data.totals.budget - data.totals.actualSpend : 0;

    const variableCategories = useMemo(
        () => data?.variable.map((v) => v.category) ?? [],
        [data?.variable]
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

    if (loading) return <section className="panel"><p className="muted">Loading cashflow…</p></section>;
    if (error) return <section className="panel"><p className="error">{error}</p></section>;
    if (!data) return null;

    return (
        <section className="panel">
            <div className="expenses-layout">
                <div className="expenses-hero-row cashflow-hero-row">
                    <SummaryCard
                        label="Total income"
                        value={formatMYR(monthIncome)}
                        variant="highlight"
                    />
                    <SummaryCard
                        label="Actual spend"
                        value={formatMYR(data.totals.actualSpend)}
                        variant={actualSpendVariant}
                    />
                    <SummaryCard
                        label="Net cashflow"
                        value={formatMYR(data.totals.netCashflow)}
                    />
                    <SummaryCard label="Amount can use" value={formatMYR(data.totals.amountCanUse)} />
                    <SummaryCard
                        label="Budget left"
                        value={formatMYR(budgetLeft)}
                        sub={`Budget ${formatMYR(data.totals.budget)}`}
                    />
                </div>

                <VariableExpensesTable
                    rows={data.variable}
                    transactions={transactions}
                    incomes={incomes}
                    formatAmount={formatMYR}
                />

                <div className="expenses-calendar-row">
                    <div className="expenses-calendar">
                        <CashflowCalendar
                            month={month}
                            expenseSeries={expenseSeries}
                            incomeSeries={incomeSeries}
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

                <TripsPanel
                    variableCategories={variableCategories}
                    formatAmount={formatMYR}
                    onChanged={handleChanged}
                />
            </div>
        </section>
    );
}
