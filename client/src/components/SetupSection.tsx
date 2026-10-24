import { useCallback, useEffect, useMemo, useState } from 'react';

import type { FixedExpenseConfig, InterestScheduleConfig } from '../api';
import { fetchExpenseOverview, fetchFixedExpenses, fetchInterestSchedules, applyDueFixedContributions } from '../api';
import { isLoanFixedExpense } from '../utils/expenseCategories';
import { useFormatMYR } from '../hooks/useAmountVisibility';
import { currentMonthInKL } from '../hooks/useMonth';
import { usePaymentAccounts } from '../hooks/usePaymentAccounts';
import { useRefreshSignal } from '../hooks/useRefreshSignal';

import FixedExpensesTable from './FixedExpensesTable';
import InterestSchedulesTable from './InterestSchedulesTable';
import LoansPanel from './LoansPanel';
import MealsSetupPanel from './MealsSetupPanel';
import PaymentAccountsPanel from './PaymentAccountsPanel';

/** The settings pages that used to share one Setup tab. */
export type SetupView = 'recurring' | 'loans' | 'interest' | 'mealGoals' | 'accounts';

export default function SetupSection({ view }: { view: SetupView }) {
    const formatMYR = useFormatMYR();
    const month = currentMonthInKL();
    const { refresh: refreshAccounts } = usePaymentAccounts();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [fixedConfigs, setFixedConfigs] = useState<FixedExpenseConfig[]>([]);
    const [interestSchedules, setInterestSchedules] = useState<InterestScheduleConfig[]>([]);
    const [variableCategories, setVariableCategories] = useState<string[]>([]);

    const loadData = useCallback(async () => {
        const [fixedRes, interestRes, overviewRes] = await Promise.all([
            fetchFixedExpenses(),
            fetchInterestSchedules(),
            fetchExpenseOverview(month),
        ]);
        setFixedConfigs(fixedRes.entries);
        setInterestSchedules(interestRes.entries);
        setVariableCategories(overviewRes.variable.map((v) => v.category));
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
        void refreshAccounts();
    }, [loadData, refreshAccounts]);

    useRefreshSignal(() =>
        Promise.all([loadData(), refreshAccounts()]).catch((err) =>
            setError(err instanceof Error ? err.message : 'Failed to refresh')
        )
    );

    useEffect(() => {
        applyDueFixedContributions()
            .then((result) => {
                if (result.applied > 0) handleChanged();
            })
            .catch(() => {
                /* ignore auto-apply errors; Contribute remains available */
            });
    }, [handleChanged]);

    const billRows = useMemo(
        () => fixedConfigs.filter((row) => !isLoanFixedExpense(row)),
        [fixedConfigs]
    );
    const loanRows = useMemo(
        () => fixedConfigs.filter(isLoanFixedExpense),
        [fixedConfigs]
    );

    if (view === 'mealGoals') {
        return (
            <section className="panel">
                <MealsSetupPanel />
            </section>
        );
    }

    if (loading) return <section className="panel"><p className="muted">Loading…</p></section>;
    if (error) return <section className="panel"><p className="error">{error}</p></section>;

    return (
        <section className="panel">
            <div className="setup-layout">
                {view === 'interest' && (
                    <InterestSchedulesTable
                        rows={interestSchedules}
                        formatAmount={formatMYR}
                        onChanged={handleChanged}
                    />
                )}
                {view === 'loans' && (
                    <LoansPanel rows={loanRows} formatAmount={formatMYR} onChanged={handleChanged} />
                )}
                {view === 'recurring' && (
                    <FixedExpensesTable
                        rows={billRows}
                        variableCategories={variableCategories}
                        formatAmount={formatMYR}
                        onChanged={handleChanged}
                    />
                )}
                {view === 'accounts' && (
                    <PaymentAccountsPanel mode="manage" formatAmount={formatMYR} onChanged={handleChanged} />
                )}
            </div>
        </section>
    );
}
