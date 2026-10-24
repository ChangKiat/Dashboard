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
import { useFormatMYR } from '../hooks/useAmountVisibility';
import { shiftMonth, useMonth } from '../hooks/useMonth';
import { usePaymentAccounts } from '../hooks/usePaymentAccounts';
import { useRefreshSignal } from '../hooks/useRefreshSignal';
import { useSmartRefresh } from '../hooks/useSmartRefresh';
import { monthToDateRange, pickDefaultCashflowDate } from '../utils/dateRange';
import CashflowCalendar from './CashflowCalendar';
import CashflowDayDetailPanel from './CashflowDayDetailPanel';

/** Month calendar of income and spending, with the picked day's entries beside it. */
export default function CalendarSection() {
    const { month, setMonth } = useMonth();
    const formatMYR = useFormatMYR();
    const { refresh: refreshAccounts } = usePaymentAccounts();
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
            const [overviewRes, expensesRes, prevExpensesRes, incomesRes, expenseDaily, incomeDaily, fixedRes] =
                await Promise.all([
                    fetchExpenseOverview(month),
                    fetchExpenseTransactions(month),
                    fetchExpenseTransactions(shiftMonth(month, -1)),
                    fetchIncomeTransactions(month),
                    fetchExpenseDaily(range),
                    fetchIncomeDaily(range),
                    fetchFixedExpenses(),
                ]);
            setVariableCategories(overviewRes.variable.map((v) => v.category));
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

    if (loading) return <section className="panel"><p className="muted">Loading calendar…</p></section>;
    if (error) return <section className="panel"><p className="error">{error}</p></section>;

    return (
        <section className="panel">
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
        </section>
    );
}
