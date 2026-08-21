import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
    ExpenseOverviewResponse,
    ExpenseTransaction,
    FixedExpenseConfig,
    IncomeDailyPoint,
    IncomeTransaction,
} from '../api';
import {
    fetchExpenseOverview,
    fetchExpenseTransactions,
    fetchFixedExpenses,
    fetchIncomeDaily,
    fetchIncomeTransactions,
} from '../api';
import { shiftMonth } from '../hooks/useMonth';
import { monthToDateRange, pickDefaultIncomeDate } from '../utils/dateRange';
import { isLoanFixedExpense } from '../utils/expenseCategories';
import { sumIncomeDailyTotals } from '../utils/incomeAggregates';
import { usePaymentAccounts } from '../hooks/usePaymentAccounts';

import IncomeCalendar from './IncomeCalendar';
import IncomeDayDetailPanel from './IncomeDayDetailPanel';
import IncomeTransactionsTable from './IncomeTransactionsTable';
import LoansPanel from './LoansPanel';
import PaymentAccountsPanel from './PaymentAccountsPanel';
import SummaryCard from './SummaryCard';

interface Props {
    month: string;
}

function formatMYR(amount: number) {
    return `RM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function IncomeSection({ month }: Props) {
    const { accounts, refresh: refreshAccounts } = usePaymentAccounts();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [overview, setOverview] = useState<ExpenseOverviewResponse | null>(null);
    const [incomes, setIncomes] = useState<IncomeTransaction[]>([]);
    const [recentExpenses, setRecentExpenses] = useState<ExpenseTransaction[]>([]);
    const [dailySeries, setDailySeries] = useState<IncomeDailyPoint[]>([]);
    const [loanRows, setLoanRows] = useState<FixedExpenseConfig[]>([]);

    const loadData = useCallback(async (options?: { silent?: boolean }) => {
        const range = monthToDateRange(month);
        const prevMonth = shiftMonth(month, -1);
        const [overviewRes, incomesRes, expensesRes, prevExpensesRes, dailyRes, fixedRes] =
            await Promise.all([
                fetchExpenseOverview(month),
                fetchIncomeTransactions(month),
                fetchExpenseTransactions(month),
                fetchExpenseTransactions(prevMonth),
                fetchIncomeDaily(range),
                fetchFixedExpenses(),
            ]);
        setOverview(overviewRes);
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
        setDailySeries(dailyRes.series);
        setLoanRows(fixedRes.entries.filter(isLoanFixedExpense));

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
        void refreshAccounts();
    }, [loadData, refreshAccounts]);

    const monthTotal = useMemo(() => sumIncomeDailyTotals(dailySeries), [dailySeries]);

    const paymentTotals = useMemo(() => {
        let cashOnHand = 0;
        let creditUsed = 0;
        let availableCredit = 0;
        for (const account of accounts) {
            if (account.accountType === 'credit') {
                creditUsed += account.amountOwed ?? 0;
                availableCredit += account.availableCredit ?? 0;
            } else {
                cashOnHand += account.balance ?? account.initialBalance ?? 0;
            }
        }
        return { cashOnHand, creditUsed, availableCredit };
    }, [accounts]);

    const loansRemaining = useMemo(
        () => loanRows.reduce((sum, row) => sum + (row.remainingPrincipal ?? 0), 0),
        [loanRows]
    );

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
            <div className="income-layout">
                <div className="income-hero-row">
                    <SummaryCard
                        label="Total income"
                        value={formatMYR(monthTotal)}
                        variant="highlight"
                    />
                    <SummaryCard
                        label="Cash on hand"
                        value={formatMYR(paymentTotals.cashOnHand)}
                    />
                    <SummaryCard
                        label="Credit used"
                        value={formatMYR(paymentTotals.creditUsed)}
                    />
                    <SummaryCard
                        label="Loans remaining"
                        value={formatMYR(loansRemaining)}
                    />
                    <SummaryCard
                        label="Available credit"
                        value={formatMYR(paymentTotals.availableCredit)}
                    />
                    <SummaryCard
                        label="Net cashflow"
                        value={formatMYR(overview.totals.netCashflow)}
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
                        <div className="card income-transactions-card">
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

                <PaymentAccountsPanel
                    mode="balances"
                    month={month}
                    formatAmount={formatMYR}
                    onChanged={handleChanged}
                />
                <LoansPanel
                    mode="view"
                    rows={loanRows}
                    formatAmount={formatMYR}
                />
            </div>
        </section>
    );
}
