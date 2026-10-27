import { useMemo, useRef, useState } from 'react';

import type { ExpenseTransaction, IncomeTransaction } from '../api';
import {
    BUDGET_STATUS_LABELS,
    getBudgetStatus,
    getBudgetUsagePct,
} from '../utils/budgetStatus';
import { BANK_CHARGES_CATEGORY, transferFeesToExpenseEntries } from '../utils/bankCharges';
import CategoryIcon from './CategoryIcon';
import VariableTransactionsList from './VariableTransactionsList';

interface Row {
    category: string;
    monthlyBudget: number;
    spending: number;
    overBudget: boolean;
}

interface Props {
    rows: Row[];
    transactions: ExpenseTransaction[];
    incomes?: IncomeTransaction[];
    formatAmount: (amount: number) => string;
    /** Salary after tax minus fixed expenses. */
    amountCanUse?: number;
    budget?: number;
    budgetLeft?: number;
    /** Shown under the title, e.g. which months a multi-month period covers. */
    subtitle?: string;
    /** Name of a multi-month period ("Aug – Oct 2026") for the transaction list. */
    periodLabel?: string;
}

export default function VariableExpensesTable({
    rows,
    transactions,
    incomes = [],
    formatAmount,
    amountCanUse,
    budget,
    budgetLeft,
    subtitle,
    periodLabel,
}: Props) {
    // The card picked to filter the list below; null lists every variable expense.
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const listRef = useRef<HTMLElement>(null);

    // Every variable-category expense (trip-fund spends are already counted in the exchange),
    // plus account-transfer fees, which count as Bank charges.
    const allTransactions = useMemo(() => {
        const categories = new Set(rows.map((r) => r.category));
        const expenses = transactions.filter((t) => categories.has(t.category) && t.tripLeg !== 'fund');
        return categories.has(BANK_CHARGES_CATEGORY)
            ? [...expenses, ...transferFeesToExpenseEntries(incomes)]
            : expenses;
    }, [rows, transactions, incomes]);

    const shownTransactions = useMemo(
        () => (selectedCategory ? allTransactions.filter((t) => t.category === selectedCategory) : allTransactions),
        [allTransactions, selectedCategory]
    );

    const pickCategory = (category: string) => {
        const next = selectedCategory === category ? null : category;
        setSelectedCategory(next);
        if (next) listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

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
            <div className="variable-expenses-header">
                <div>
                    <h3>Variable expenses</h3>
                    {subtitle && <p className="variable-expenses-sub">{subtitle}</p>}
                </div>
                <div className="variable-expenses-stats">
                    {amountCanUse != null && (
                        <div className="mini-stat">
                            <span className="mini-stat-label">Amount can use</span>
                            <span className="mini-stat-value">{formatAmount(amountCanUse)}</span>
                            <span className="mini-stat-sub">Salary after tax − fixed expenses</span>
                        </div>
                    )}
                    {budgetLeft != null && (
                        <div className="mini-stat">
                            <span className="mini-stat-label">Budget left</span>
                            <span className={budgetLeft < 0 ? 'mini-stat-value negative' : 'mini-stat-value'}>
                                {formatAmount(budgetLeft)}
                            </span>
                            {budget != null && (
                                <span className="mini-stat-sub">Budget {formatAmount(budget)}</span>
                            )}
                        </div>
                    )}
                </div>
            </div>
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
                            className={`variable-expense-card variable-expense-card--clickable budget-row budget-row--${status}${
                                selectedCategory === row.category ? ' selected' : ''
                            }`}
                            aria-pressed={selectedCategory === row.category}
                            onClick={() => pickCategory(row.category)}
                        >
                            <div className="variable-expense-card-header">
                                <CategoryIcon category={row.category} />
                                <div className="variable-expense-card-title">
                                    <h4 title={row.category}>{row.category}</h4>
                                    <span
                                        className={`variable-expense-card-amount${status === 'over' ? ' over-budget-text' : status === 'warning' ? ' near-budget-text' : ''}`}
                                    >
                                        {formatAmount(row.spending)}
                                    </span>
                                </div>
                                {statusLabel && (
                                    <span className={`budget-badge budget-badge--${status}`}>{statusLabel}</span>
                                )}
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
            <VariableTransactionsList
                ref={listRef}
                transactions={shownTransactions}
                category={selectedCategory}
                onClear={() => setSelectedCategory(null)}
                formatAmount={formatAmount}
                periodText={periodLabel ? `in ${periodLabel}` : 'this month'}
            />
        </div>
    );
}
