import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
    ExpenseOverviewResponse,
    ExpenseTransaction,
    IncomeTransaction,
    MonthlyCashflowPoint,
} from '../api';
import {
    fetchExpenseOverview,
    fetchExpenseTransactions,
    fetchIncomeTransactions,
    fetchMonthlyCashflow,
    fetchSyncStatus,
} from '../api';
import { useFormatMYR } from '../hooks/useAmountVisibility';
import { currentMonthInKL, useMonth } from '../hooks/useMonth';
import {
    budgetMonthsFor,
    periodEndMonthFor,
    periodLabel,
    periodRange,
    usePeriod,
} from '../hooks/usePeriod';
import { useRefreshSignal } from '../hooks/useRefreshSignal';
import { useSmartRefresh } from '../hooks/useSmartRefresh';
import PeriodControls from './PeriodControls';
import VariableExpensesTable from './VariableExpensesTable';

const hasEntries = (p: MonthlyCashflowPoint) => p.income !== 0 || p.spending !== 0;

/** Spending in each category against its budget, for the period picked (shared with Cashflow). */
export default function VariableExpensesSection() {
    const { month, setMonth } = useMonth();
    const { period, setPeriod } = usePeriod();
    const periodEndMonth = periodEndMonthFor(period, month, currentMonthInKL());
    const formatMYR = useFormatMYR();
    const [data, setData] = useState<ExpenseOverviewResponse | null>(null);
    const [transactions, setTransactions] = useState<ExpenseTransaction[]>([]);
    const [incomes, setIncomes] = useState<IncomeTransaction[]>([]);
    // Only needed for All: which months have entries.
    const [allMonths, setAllMonths] = useState<MonthlyCashflowPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const fingerprintRef = useRef<string | null>(null);

    const loadData = useCallback(async () => {
        const dates = period === 'month' ? undefined : periodRange(period, periodEndMonth);
        const [overviewRes, expensesRes, incomesRes, monthlyRes] = await Promise.all([
            fetchExpenseOverview(periodEndMonth, dates),
            fetchExpenseTransactions(periodEndMonth, dates),
            fetchIncomeTransactions(periodEndMonth, dates),
            period === 'all' ? fetchMonthlyCashflow(periodEndMonth, 120) : null,
        ]);
        setData(overviewRes);
        setTransactions(expensesRes.entries);
        setIncomes(incomesRes.entries);
        setAllMonths(monthlyRes?.series ?? []);

        const status = await fetchSyncStatus(periodEndMonth, 'expenses');
        fingerprintRef.current = status.fingerprint;
    }, [period, periodEndMonth]);

    useEffect(() => {
        let cancelled = false;
        fingerprintRef.current = null;
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

    const handleStale = useCallback(async () => {
        try {
            await loadData();
        } catch {
            // error left for next explicit refresh
        }
    }, [loadData]);

    useSmartRefresh({ month: periodEndMonth, scope: 'expenses', fingerprintRef, onStale: handleStale });
    useRefreshSignal(handleStale);

    const firstDataMonth = useMemo(() => allMonths.find(hasEntries)?.month ?? null, [allMonths]);
    const budgetMonths = budgetMonthsFor(period, periodEndMonth, allMonths.filter(hasEntries).length);

    const toolbar = (
        <div className="page-toolbar">
            <div className="page-toolbar-group">
                <PeriodControls
                    period={period}
                    onPeriodChange={setPeriod}
                    month={month}
                    onMonthChange={setMonth}
                    firstDataMonth={firstDataMonth}
                    allEndMonth={periodEndMonth}
                />
            </div>
        </div>
    );

    if (loading) {
        return (
            <section className="panel">
                {toolbar}
                <p className="muted">Loading variable expenses…</p>
            </section>
        );
    }
    if (error || !data) {
        return (
            <section className="panel">
                {toolbar}
                <p className="error">{error ?? 'Failed to load'}</p>
            </section>
        );
    }

    const budget = data.totals.budget * budgetMonths;
    const rows =
        budgetMonths === 1
            ? data.variable
            : data.variable.map((row) => {
                  const periodBudget = row.monthlyBudget * budgetMonths;
                  return { ...row, monthlyBudget: periodBudget, overBudget: row.spending > periodBudget };
              });
    const label = periodLabel(period, periodEndMonth, firstDataMonth);
    const isMultiMonth = period !== 'month';

    return (
        <section className="panel">
            {toolbar}
            <VariableExpensesTable
                rows={rows}
                transactions={transactions}
                incomes={incomes}
                formatAmount={formatMYR}
                amountCanUse={data.totals.amountCanUse * budgetMonths}
                budget={budget}
                budgetLeft={budget - data.totals.actualSpend}
                periodLabel={isMultiMonth ? label : undefined}
                onChanged={handleStale}
                subtitle={
                    isMultiMonth
                        ? `${label} · budgets cover ${budgetMonths} ${budgetMonths === 1 ? 'month' : 'months'}${
                              period === 'all' ? ' with entries' : ''
                          }`
                        : undefined
                }
            />
        </section>
    );
}
