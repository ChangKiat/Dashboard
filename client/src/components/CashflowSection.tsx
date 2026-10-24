import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
    ExpenseDailyPoint,
    ExpenseOverviewResponse,
    ExpenseTransaction,
    FixedExpenseConfig,
    IncomeDailyPoint,
    IncomeTransaction,
} from '../api';
import {
    applyDueFixedContributions,
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
import { getBudgetStatus } from '../utils/budgetStatus';
import { monthToDateRange, pickDefaultCashflowDate } from '../utils/dateRange';
import { sumIncomeDailyTotals } from '../utils/incomeAggregates';

import CashflowCalendar from './CashflowCalendar';
import CashflowDayDetailPanel from './CashflowDayDetailPanel';
import { BankIcon, IncomeIcon, TrendUpIcon, WalletIcon } from './icons';
import MonthPicker from './MonthPicker';
import PaymentAccountsPanel from './PaymentAccountsPanel';
import PeriodPills from './PeriodPills';
import SummaryCard from './SummaryCard';
import SyncBanner from './SyncBanner';
import TripsPanel from './TripsPanel';
import VariableExpensesTable from './VariableExpensesTable';

export default function CashflowSection() {
    const { month, setMonth } = useMonth();
    const formatMYR = useFormatMYR();
    const { accounts, loading: accountsLoading, refresh: refreshAccounts } = usePaymentAccounts();
    const [lastEntryAt, setLastEntryAt] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [data, setData] = useState<ExpenseOverviewResponse | null>(null);
    const [transactions, setTransactions] = useState<ExpenseTransaction[]>([]);
    const [incomes, setIncomes] = useState<IncomeTransaction[]>([]);
    const [recentExpenses, setRecentExpenses] = useState<ExpenseTransaction[]>([]);
    const [expenseSeries, setExpenseSeries] = useState<ExpenseDailyPoint[]>([]);
    const [incomeSeries, setIncomeSeries] = useState<IncomeDailyPoint[]>([]);
    const [fixedConfigs, setFixedConfigs] = useState<FixedExpenseConfig[]>([]);
    const [tripsReloadKey, setTripsReloadKey] = useState(0);
    const fingerprintRef = useRef<string | null>(null);

    const loadData = useCallback(async (options?: { silent?: boolean }) => {
        const range = monthToDateRange(month);
        const prevMonth = shiftMonth(month, -1);
        const [overviewRes, expensesRes, prevExpensesRes, incomesRes, expenseDaily, incomeDaily, fixedRes] =
            await Promise.all([
                fetchExpenseOverview(month),
                fetchExpenseTransactions(month),
                fetchExpenseTransactions(prevMonth),
                fetchIncomeTransactions(month),
                fetchExpenseDaily(range),
                fetchIncomeDaily(range),
                fetchFixedExpenses(),
            ]);
        setData(overviewRes);
        setFixedConfigs(fixedRes.entries);
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
        setLastEntryAt(status.lastEntryAt);
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
        setTripsReloadKey((k) => k + 1);
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

    useRefreshSignal(handleStale);

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

    const variableCategories = useMemo(
        () => data?.variable.map((v) => v.category) ?? [],
        [data?.variable]
    );

    const fixedDescriptions = useMemo(
        () => fixedConfigs.map((f) => f.description),
        [fixedConfigs]
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

    const toolbar = (
        <>
            <div className="page-toolbar">
                <div className="page-toolbar-group">
                    <PeriodPills />
                    <MonthPicker month={month} onChange={setMonth} />
                </div>
            </div>
            <SyncBanner lastEntryAt={lastEntryAt} />
        </>
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

    const netCashflow = data.totals.netCashflow;

    return (
        <section className="panel">
            {toolbar}
            <div className="expenses-layout">
                <div className="cashflow-summary-grid">
                    <SummaryCard
                        tone="spend"
                        icon={<WalletIcon size={26} />}
                        label="Actual spend"
                        value={formatMYR(data.totals.actualSpend)}
                        variant={actualSpendVariant}
                        sub={`of ${formatMYR(data.totals.budget)} budget`}
                    />
                    <SummaryCard
                        tone="income"
                        icon={<IncomeIcon size={26} />}
                        label="Total income"
                        value={formatMYR(monthIncome)}
                        sub={`Salary after tax ${formatMYR(data.salaryAfterTax)}`}
                    />
                    <SummaryCard
                        tone="net"
                        icon={<TrendUpIcon size={26} />}
                        label="Net cashflow"
                        value={formatMYR(netCashflow)}
                        variant={netCashflow < 0 ? 'danger' : 'default'}
                        sub={netCashflow < 0 ? 'Spent more than came in' : 'Left over after spending'}
                    />
                    <SummaryCard
                        tone="net"
                        icon={<BankIcon size={26} />}
                        label="Net worth"
                        value={accountsLoading ? '…' : formatMYR(netWorth.total)}
                        sub={`Accounts + investments − credit cards · ${netWorth.count} accounts`}
                    />
                </div>

                <VariableExpensesTable
                    rows={data.variable}
                    transactions={transactions}
                    incomes={incomes}
                    formatAmount={formatMYR}
                    amountCanUse={data.totals.amountCanUse}
                    budget={data.totals.budget}
                    budgetLeft={budgetLeft}
                />

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
                    reloadKey={tripsReloadKey}
                />
            </div>
        </section>
    );
}
