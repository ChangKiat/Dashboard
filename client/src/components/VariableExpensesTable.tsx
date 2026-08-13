import { useMemo, useState } from 'react';

import type { ExpenseTransaction } from '../api';
import {
    BUDGET_STATUS_LABELS,
    getBudgetStatus,
    getBudgetUsagePct,
} from '../utils/budgetStatus';
import VariableCategoryDetailModal from './VariableCategoryDetailModal';

interface Row {
    category: string;
    monthlyBudget: number;
    spending: number;
    overBudget: boolean;
}

interface Props {
    rows: Row[];
    transactions: ExpenseTransaction[];
    formatAmount: (amount: number) => string;
}

export default function VariableExpensesTable({ rows, transactions, formatAmount }: Props) {
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    const selectedRow = useMemo(
        () => rows.find((r) => r.category === selectedCategory) ?? null,
        [rows, selectedCategory]
    );

    const selectedTransactions = useMemo(() => {
        if (!selectedCategory) return [];
        return transactions.filter(
            (t) => t.category === selectedCategory && t.tripLeg !== 'fund'
        );
    }, [transactions, selectedCategory]);

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
        <div className="card expenses-variable-table">
            <h3>Variable expenses</h3>
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
                    const remaining = row.monthlyBudget - row.spending;

                    return (
                        <button
                            key={row.category}
                            type="button"
                            className={`variable-expense-card variable-expense-card--clickable budget-row budget-row--${status}`}
                            onClick={() => setSelectedCategory(row.category)}
                        >
                            <div className="variable-expense-card-header">
                                <div className="variable-expense-card-title">
                                    <h4>{row.category}</h4>
                                    {statusLabel && (
                                        <span className={`budget-badge budget-badge--${status}`}>
                                            {statusLabel}
                                        </span>
                                    )}
                                </div>
                                <span
                                    className={`variable-expense-card-amount${status === 'over' ? ' over-budget-text' : status === 'warning' ? ' near-budget-text' : ''}`}
                                >
                                    {formatAmount(row.spending)}
                                </span>
                            </div>
                            <div className="variable-expense-card-meta">
                                <span>
                                    <span className="variable-expense-meta-label">Budget</span>
                                    {formatAmount(row.monthlyBudget)}
                                </span>
                                <span>
                                    <span className="variable-expense-meta-label">Spent</span>
                                    {formatAmount(row.spending)}
                                </span>
                                <span className={remaining < 0 ? 'over-budget-text' : undefined}>
                                    <span className="variable-expense-meta-label">Remaining</span>
                                    {formatAmount(Math.max(0, remaining))}
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
                        </button>
                    );
                })}
            </div>
            {selectedRow && selectedCategory && (
                <VariableCategoryDetailModal
                    category={selectedCategory}
                    monthlyBudget={selectedRow.monthlyBudget}
                    spending={selectedRow.spending}
                    transactions={selectedTransactions}
                    formatAmount={formatAmount}
                    onClose={() => setSelectedCategory(null)}
                />
            )}
        </div>
    );
}
