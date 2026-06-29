import type { ExpenseDailyPoint, ExpenseTransaction, IncomeTransaction } from '../api';
import ExpenseTransactionsTable from './ExpenseTransactionsTable';
import IncomeTransactionsTable from './IncomeTransactionsTable';

interface Props {
    selectedDate: string;
    transactions: ExpenseTransaction[];
    incomes: IncomeTransaction[];
    recentExpenses: ExpenseTransaction[];
    daySummary: ExpenseDailyPoint | undefined;
    incomeDayTotal: number;
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
    incomes,
    recentExpenses,
    daySummary,
    incomeDayTotal,
    variableCategories,
    formatAmount,
    onChanged,
}: Props) {
    const dayTotal = daySummary?.total ?? 0;

    const statLine =
        incomeDayTotal > 0
            ? `Net spend: ${formatAmount(dayTotal)} · Income: ${formatAmount(incomeDayTotal)}`
            : `Net spend: ${formatAmount(dayTotal)}`;

    return (
        <div className="day-detail-panel">
            <h3>{formatDateLabel(selectedDate)}</h3>
            <p className="day-detail-stat">{statLine}</p>
            <div className="day-detail-columns">
                <div className="day-detail-section">
                    <ExpenseTransactionsTable
                        entries={transactions}
                        variableCategories={variableCategories}
                        formatAmount={formatAmount}
                        onChanged={onChanged}
                        defaultDate={selectedDate}
                    />
                </div>
                <div className="day-detail-section">
                    <IncomeTransactionsTable
                        entries={incomes}
                        recentExpenses={recentExpenses}
                        formatAmount={formatAmount}
                        onChanged={onChanged}
                        defaultDate={selectedDate}
                    />
                </div>
            </div>
        </div>
    );
}
