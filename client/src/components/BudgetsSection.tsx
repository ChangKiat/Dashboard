import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ExpenseOverviewResponse } from '../api';
import { fetchExpenseOverview, updateCategoryBudget } from '../api';
import { useAmountVisibility, useFormatMYR } from '../hooks/useAmountVisibility';
import { currentMonthInKL, useMonth } from '../hooks/useMonth';
import { useRefreshSignal } from '../hooks/useRefreshSignal';
import { BUDGET_STATUS_LABELS, getBudgetStatus } from '../utils/budgetStatus';
import { PieIcon, TrendUpIcon, WalletIcon } from './icons';
import MonthPicker from './MonthPicker';
import SummaryCard from './SummaryCard';

/** Share of the month gone by today, or null for months that aren't the current one. */
function monthPace(month: string): number | null {
    if (month !== currentMonthInKL()) return null;
    const [yearStr, monthStr] = month.split('-');
    const daysInMonth = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10), 0).getDate();
    const today = parseInt(
        new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).slice(8, 10),
        10
    );
    return (today / daysInMonth) * 100;
}

export default function BudgetsSection() {
    const { month, setMonth } = useMonth();
    const formatMYR = useFormatMYR();
    const { hidden } = useAmountVisibility();
    const [data, setData] = useState<ExpenseOverviewResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [savingCategory, setSavingCategory] = useState<string | null>(null);
    const [savedCategory, setSavedCategory] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        setData(await fetchExpenseOverview(month));
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

    useRefreshSignal(() =>
        loadData().catch((err) => setError(err instanceof Error ? err.message : 'Failed to refresh'))
    );

    const rows = useMemo(
        () => [...(data?.variable ?? [])].sort((a, b) => a.category.localeCompare(b.category)),
        [data]
    );
    const pace = monthPace(month);

    async function saveLimit(category: string) {
        const value = parseFloat(drafts[category] ?? '');
        if (!(value > 0)) return;
        setSavingCategory(category);
        setError(null);
        try {
            await updateCategoryBudget(category, value);
            await loadData();
            setDrafts((d) => {
                const next = { ...d };
                delete next[category];
                return next;
            });
            setSavedCategory(category);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save budget');
        } finally {
            setSavingCategory(null);
        }
    }

    const toolbar = (
        <div className="page-toolbar">
            <div className="page-toolbar-group">
                <MonthPicker month={month} onChange={setMonth} />
            </div>
        </div>
    );

    if (loading) {
        return (
            <section className="panel">
                {toolbar}
                <p className="muted">Loading budgets…</p>
            </section>
        );
    }
    if (!data) {
        return (
            <section className="panel">
                {toolbar}
                <p className="error">{error ?? 'Failed to load'}</p>
            </section>
        );
    }

    const { budget, actualSpend } = data.totals;
    const left = budget - actualSpend;

    return (
        <section className="panel">
            {toolbar}
            <div className="expenses-layout">
                <div className="budgets-summary-grid">
                    <SummaryCard
                        tone="net"
                        icon={<PieIcon size={26} />}
                        label="Total budget"
                        value={formatMYR(budget)}
                        sub={`${rows.length} categories`}
                    />
                    <SummaryCard
                        tone="spend"
                        icon={<WalletIcon size={26} />}
                        label="Spent"
                        value={formatMYR(actualSpend)}
                        variant={actualSpend > budget ? 'danger' : 'default'}
                        sub={budget > 0 ? `${Math.round((actualSpend / budget) * 100)}% of budget` : undefined}
                    />
                    <SummaryCard
                        tone="income"
                        icon={<TrendUpIcon size={26} />}
                        label="Left"
                        value={formatMYR(left)}
                        variant={left < 0 ? 'danger' : 'default'}
                        sub={left < 0 ? 'Over the total budget' : 'Still to spend this month'}
                    />
                </div>

                <div className="card budgets-card">
                    <div className="budgets-card-header">
                        <h3>Monthly limits</h3>
                        {pace != null && (
                            <p className="budgets-card-sub">
                                The dark tick on each bar is where you’d be if you spent evenly through the
                                month.
                            </p>
                        )}
                    </div>
                    {error && <p className="error">{error}</p>}
                    <ul className="budget-rows">
                        {rows.map((row) => {
                            const status = getBudgetStatus(row.spending, row.monthlyBudget);
                            const statusLabel = BUDGET_STATUS_LABELS[status];
                            const pct = row.monthlyBudget > 0 ? (row.spending / row.monthlyBudget) * 100 : 0;
                            const draft = drafts[row.category];
                            const draftValue = parseFloat(draft ?? '');
                            const changed = draft != null && draftValue !== row.monthlyBudget;
                            const valid = draftValue > 0;
                            const remaining = row.monthlyBudget - row.spending;
                            const inputId = `budget-${row.category.replace(/\W+/g, '-')}`;
                            return (
                                <li key={row.category} className={`budget-row-item budget-row-item--${status}`}>
                                    <div className="budget-row-main">
                                        <span className="budget-row-name">
                                            {row.category}
                                            {statusLabel && (
                                                <span className={`budget-badge budget-badge--${status}`}>
                                                    {statusLabel}
                                                </span>
                                            )}
                                        </span>
                                        <span className="budget-row-amounts">
                                            {formatMYR(row.spending)} of {formatMYR(row.monthlyBudget)}
                                        </span>
                                    </div>
                                    <div className="budget-bar" aria-hidden="true">
                                        <span
                                            className="budget-bar-fill"
                                            style={{ width: `${Math.min(pct, 100)}%` }}
                                        />
                                        {pace != null && (
                                            <span className="budget-bar-pace" style={{ left: `${pace}%` }} />
                                        )}
                                    </div>
                                    <div className="budget-row-footer">
                                        <span className="budget-row-note">
                                            {remaining < 0
                                                ? `Over by ${formatMYR(-remaining)}`
                                                : `${formatMYR(remaining)} left`}
                                            {savedCategory === row.category && !changed && ' · Saved'}
                                        </span>
                                        {hidden ? (
                                            <span className="budget-row-note">Show amounts to edit</span>
                                        ) : (
                                            <form
                                                className="budget-limit-form"
                                                onSubmit={(e) => {
                                                    e.preventDefault();
                                                    void saveLimit(row.category);
                                                }}
                                            >
                                                <label htmlFor={inputId}>Limit (RM)</label>
                                                <input
                                                    id={inputId}
                                                    type="number"
                                                    inputMode="decimal"
                                                    min="1"
                                                    step="1"
                                                    value={draft ?? String(row.monthlyBudget)}
                                                    aria-invalid={draft != null && !valid}
                                                    onChange={(e) => {
                                                        const value = e.target.value;
                                                        setSavedCategory(null);
                                                        setDrafts((d) => ({ ...d, [row.category]: value }));
                                                    }}
                                                />
                                                {changed && (
                                                    <button
                                                        type="submit"
                                                        className="btn-primary"
                                                        disabled={!valid || savingCategory === row.category}
                                                    >
                                                        {savingCategory === row.category ? 'Saving…' : 'Save'}
                                                    </button>
                                                )}
                                            </form>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                    <p className="budgets-card-note">
                        These limits are shared with the Telegram bot, which picks up a change within a minute.
                    </p>
                </div>
            </div>
        </section>
    );
}
