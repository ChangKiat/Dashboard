import { useCallback, useEffect, useState } from 'react';

import type { FixedExpenseConfig, InterestScheduleConfig } from '../api';
import { fetchExpenseOverview, fetchFixedExpenses, fetchInterestSchedules } from '../api';
import { usePaymentAccounts } from '../hooks/usePaymentAccounts';

import FixedExpensesTable from './FixedExpensesTable';
import InterestSchedulesTable from './InterestSchedulesTable';
import MealsSetupPanel from './MealsSetupPanel';
import PaymentAccountsPanel from './PaymentAccountsPanel';

interface Props {
    month: string;
}

function formatMYR(amount: number) {
    return `RM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SetupSection({ month }: Props) {
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

    if (loading) return <section className="panel"><p className="muted">Loading setup…</p></section>;
    if (error) return <section className="panel"><p className="error">{error}</p></section>;

    return (
        <section className="panel">
            <div className="setup-layout">
                <MealsSetupPanel />
                <FixedExpensesTable
                    rows={fixedConfigs}
                    variableCategories={variableCategories}
                    formatAmount={formatMYR}
                    onChanged={handleChanged}
                />
                <InterestSchedulesTable
                    rows={interestSchedules}
                    formatAmount={formatMYR}
                    onChanged={handleChanged}
                />
                <PaymentAccountsPanel mode="manage" formatAmount={formatMYR} onChanged={handleChanged} />
            </div>
        </section>
    );
}
