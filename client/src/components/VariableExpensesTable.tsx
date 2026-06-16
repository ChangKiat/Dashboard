import { useMemo } from 'react';

import {
    BUDGET_STATUS_LABELS,
    getBudgetStatus,
    getBudgetUsagePct,
} from '../utils/budgetStatus';

interface Row {
    category: string;
    monthlyBudget: number;
    spending: number;
    overBudget: boolean;
}

interface Props {
    rows: Row[];
    formatAmount: (amount: number) => string;
}

export default function VariableExpensesTable({ rows, formatAmount }: Props) {
    const alertCategories = useMemo(() => {
        return rows
            .map((row) => {
                const status = getBudgetStatus(row.spending, row.monthlyBudget);
                if (status === 'ok') return null;
                return `${row.category} (${BUDGET_STATUS_LABELS[status]})`;
            })
            .filter((c): c is string => c != null);
    }, [rows]);

    return (
        <div className="expenses-table-card expenses-variable-table">
            <h3>Variable Expenses</h3>
            {alertCategories.length > 0 && (
                <div className="budget-alert-banner">
                    {alertCategories.join(' · ')}
                </div>
            )}
            <div className="variable-expense-list">
                {rows.map((row) => {
                    const status = getBudgetStatus(row.spending, row.monthlyBudget);
                    const usagePct = getBudgetUsagePct(row.spending, row.monthlyBudget);
                    const barWidth = Math.min(usagePct, 100);
                    const statusLabel = BUDGET_STATUS_LABELS[status];

                    return (
                        <article
                            key={row.category}
                            className={`variable-expense-card budget-row budget-row--${status}`}
                        >
                            <div className="variable-expense-card-header">
                                <h4>{row.category}</h4>
                                {statusLabel && (
                                    <span className={`budget-badge budget-badge--${status}`}>
                                        {statusLabel}
                                    </span>
                                )}
                            </div>
                            <div className="variable-expense-card-meta">
                                <span>Budget: {formatAmount(row.monthlyBudget)}</span>
                                <span className={status === 'over' ? 'over-budget-text' : status === 'warning' ? 'near-budget-text' : undefined}>
                                    Spending: {formatAmount(row.spending)}
                                </span>
                            </div>
                            <div className="budget-usage">
                                <div className="budget-usage-bar">
                                    <div
                                        className={`budget-usage-fill budget-usage-fill--${status}`}
                                        style={{ width: `${barWidth}%` }}
                                    />
                                    {usagePct > 100 && (
                                        <div
                                            className="budget-usage-overflow"
                                            style={{ width: `${Math.min(usagePct - 100, 50)}%` }}
                                        />
                                    )}
                                </div>
                                <span className="budget-usage-pct">{usagePct}%</span>
                            </div>
                        </article>
                    );
                })}
            </div>
        </div>
    );
}
