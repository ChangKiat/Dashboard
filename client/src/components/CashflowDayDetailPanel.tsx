import { useEffect, useState } from 'react';

import type { ExpenseDailyPoint, ExpenseTransaction, IncomeDailyPoint, IncomeTransaction } from '../api';
import ExpenseTransactionsTable from './ExpenseTransactionsTable';
import IncomeTransactionsTable from './IncomeTransactionsTable';

interface Props {
    selectedDate: string;
    expenses: ExpenseTransaction[];
    incomes: IncomeTransaction[];
    recentExpenses: ExpenseTransaction[];
    expenseSummary: ExpenseDailyPoint | undefined;
    incomeSummary: IncomeDailyPoint | undefined;
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

export default function CashflowDayDetailPanel({
    selectedDate,
    expenses,
    incomes,
    recentExpenses,
    expenseSummary,
    incomeSummary,
    variableCategories,
    formatAmount,
    onChanged,
}: Props) {
    const spendTotal = expenseSummary?.total ?? 0;
    const incomeTotal = incomeSummary?.total ?? 0;
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        setSearchQuery('');
    }, [selectedDate]);

    return (
        <div className="day-detail-panel cashflow-day-panel">
            <h3>{formatDateLabel(selectedDate)}</h3>
            <p className="day-detail-stat cashflow-day-stats">
                <span className="cashflow-stat income">Income: {formatAmount(incomeTotal)}</span>
                <span className="cashflow-stat expense">Spend: {formatAmount(spendTotal)}</span>
            </p>
            {incomes.length + expenses.length > 0 && (
                <div className="category-detail-search">
                    <input
                        type="search"
                        placeholder="Search income and expenses…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        aria-label="Search income and expenses"
                    />
                </div>
            )}
            <div className="cashflow-day-streams">
                <div className="cashflow-day-stream">
                    <h4>Income</h4>
                    <IncomeTransactionsTable
                        entries={incomes}
                        recentExpenses={recentExpenses}
                        formatAmount={formatAmount}
                        onChanged={onChanged}
                        variant="day"
                        defaultDate={selectedDate}
                        searchQuery={searchQuery}
                    />
                </div>
                <div className="cashflow-day-stream">
                    <h4>Expenses</h4>
                    <ExpenseTransactionsTable
                        entries={expenses}
                        variableCategories={variableCategories}
                        formatAmount={formatAmount}
                        onChanged={onChanged}
                        defaultDate={selectedDate}
                        searchQuery={searchQuery}
                    />
                </div>
            </div>
        </div>
    );
}
