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
    const dayTotal = daySummary?.total ?? 0;

    return (
        <div className="day-detail-panel">
            <h3>{formatDateLabel(selectedDate)}</h3>
            <p className="day-detail-stat">Net spend: {formatAmount(dayTotal)}</p>
            <ExpenseTransactionsTable
                entries={transactions}
                variableCategories={variableCategories}
                formatAmount={formatAmount}
                onChanged={onChanged}
                defaultDate={selectedDate}
            />
        </div>
    );
}
