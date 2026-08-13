import type { IncomeDailyPoint } from '../api';

interface Props {
    selectedDate: string;
    daySummary: IncomeDailyPoint | undefined;
    transactionCount: number;
    formatAmount: (amount: number) => string;
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

export default function IncomeDayDetailPanel({
    selectedDate,
    daySummary,
    transactionCount,
    formatAmount,
}: Props) {
    const dayTotal = daySummary?.total ?? 0;

    return (
        <div className="income-day-header">
            <h3>{formatDateLabel(selectedDate)}</h3>
            <p className="day-detail-stat">Income: {formatAmount(dayTotal)}</p>
            {transactionCount > 0 && (
                <p className="income-day-meta muted">
                    {transactionCount} transaction{transactionCount === 1 ? '' : 's'}
                </p>
            )}
        </div>
    );
}
