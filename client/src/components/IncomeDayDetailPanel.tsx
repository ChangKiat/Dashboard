import type { IncomeDailyPoint } from '../api';

interface Props {
    selectedDate: string;
    daySummary: IncomeDailyPoint | undefined;
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
    formatAmount,
}: Props) {
    const dayTotal = daySummary?.total ?? 0;

    return (
        <div className="day-detail-panel income-day-panel">
            <h3>{formatDateLabel(selectedDate)}</h3>
            <p className="day-detail-stat">Income: {formatAmount(dayTotal)}</p>
        </div>
    );
}
