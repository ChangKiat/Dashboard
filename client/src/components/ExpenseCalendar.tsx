import { useMemo } from 'react';
import type { ExpenseDailyPoint } from '../api';
import { getCalendarCells, todayInKL } from '../utils/dateRange';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function compactSpendLabel(total: number): string {
    if (total >= 1000) return `${(total / 1000).toFixed(1)}k`;
    return String(Math.round(total));
}

interface Props {
    month: string;
    dailySeries: ExpenseDailyPoint[];
    selectedDate: string;
    onSelectDate: (date: string) => void;
    formatAmount: (amount: number) => string;
}

export default function ExpenseCalendar({
    month,
    dailySeries,
    selectedDate,
    onSelectDate,
    formatAmount,
}: Props) {
    const cells = useMemo(() => getCalendarCells(month), [month]);
    const today = todayInKL();

    const spendByDate = useMemo(() => {
        const map = new Map<string, number>();
        for (const d of dailySeries) {
            if (d.total > 0) map.set(d.date, d.total);
        }
        return map;
    }, [dailySeries]);

    return (
        <div className="activity-calendar">
            <div className="activity-calendar-header">
                <h3>Spending calendar</h3>
                <div className="activity-calendar-legend">
                    <span className="legend-item">
                        <span className="legend-dot expense" aria-hidden="true" />
                        Spending
                    </span>
                </div>
            </div>
            <div className="activity-calendar-weekdays">
                {WEEKDAYS.map((day) => (
                    <span key={day} className="activity-calendar-weekday">
                        {day}
                    </span>
                ))}
            </div>
            <div className="activity-calendar-grid" role="grid" aria-label="Monthly spending calendar">
                {cells.map((date, i) => {
                    if (date == null) {
                        return <div key={`pad-${i}`} className="activity-calendar-cell empty" />;
                    }

                    const dayNum = parseInt(date.slice(8), 10);
                    const total = spendByDate.get(date) ?? 0;
                    const isToday = date === today;
                    const isSelected = date === selectedDate;

                    return (
                        <button
                            key={date}
                            type="button"
                            role="gridcell"
                            className={[
                                'activity-calendar-cell',
                                isToday ? 'today' : '',
                                isSelected ? 'selected' : '',
                            ]
                                .filter(Boolean)
                                .join(' ')}
                            aria-label={`${date}${total > 0 ? `, spent ${formatAmount(total)}` : ''}`}
                            aria-selected={isSelected}
                            onClick={() => onSelectDate(date)}
                        >
                            <span className="activity-calendar-day">{dayNum}</span>
                            <span className="activity-calendar-badges">
                                {total > 0 && (
                                    <span
                                        className="activity-badge expense"
                                        title={formatAmount(total)}
                                    >
                                        {compactSpendLabel(total)}
                                    </span>
                                )}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );

}
