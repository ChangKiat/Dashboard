import { useMemo } from 'react';
import type { ExpenseDailyPoint, ExpenseTransaction } from '../api';
import ExpenseTransactionsTable from './ExpenseTransactionsTable';

interface Props {
    selectedDate: string;
    transactions: ExpenseTransaction[];
    daySummary: ExpenseDailyPoint | undefined;
    variableCategories: string[];
    formatAmount: (amount: number) => string;
    onChanged: () => void;
}

function formatDateLabel(date: string): string {
    const d = new Date(`${date}T12:00:00`);
    return d.toLocaleDateString('en-MY', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
}

export default function ExpenseDayDetailPanel({
    selectedDate,
    transactions,
    daySummary,
    variableCategories,
    formatAmount,
    onChanged,
}: Props) {
    const categoryBreakdown = useMemo(() => {
        if (!daySummary) return [];
        return Object.entries(daySummary.byCategory)
            .map(([category, amount]) => ({ category, amount }))
            .sort((a, b) => b.amount - a.amount);
    }, [daySummary]);

    const dayTotal = daySummary?.total ?? 0;

    return (
        <div className="day-detail-panel">
            <h3>{formatDateLabel(selectedDate)}</h3>
            <div className="expense-day-summary">
                <p className="expense-day-total">
                    Total: <strong>{formatAmount(dayTotal)}</strong>
                </p>
                {categoryBreakdown.length > 0 && (
                    <ul className="expense-day-categories">
                        {categoryBreakdown.map(({ category, amount }) => (
                            <li key={category}>
                                <span>{category}</span>
                                <span>{formatAmount(amount)}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <div className="day-detail-section">
                <h4>Transactions</h4>
                <ExpenseTransactionsTable
                    entries={transactions}
                    variableCategories={variableCategories}
                    formatAmount={formatAmount}
                    onChanged={onChanged}
                />
            </div>
        </div>
    );
}
