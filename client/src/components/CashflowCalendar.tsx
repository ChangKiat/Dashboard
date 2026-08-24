import { useMemo } from 'react';
import type { ExpenseDailyPoint, IncomeDailyPoint } from '../api';
import { getCalendarCells, todayInKL } from '../utils/dateRange';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function compactAmountLabel(total: number): string {
    if (total >= 1000) return `${(total / 1000).toFixed(1)}k`;
    return String(Math.round(total));
}

interface Props {
    month: string;
    expenseSeries: ExpenseDailyPoint[];
    incomeSeries: IncomeDailyPoint[];
    selectedDate: string;
    onSelectDate: (date: string) => void;
    formatAmount: (amount: number) => string;
}

export default function CashflowCalendar({
    month,
    expenseSeries,
    incomeSeries,
    selectedDate,
    onSelectDate,
    formatAmount,
}: Props) {
    const cells = useMemo(() => getCalendarCells(month), [month]);
    const today = todayInKL();

    const spendByDate = useMemo(() => {
        const map = new Map<string, number>();
        for (const d of expenseSeries) {
            if (d.total > 0) map.set(d.date, d.total);
        }
        return map;
    }, [expenseSeries]);

    const incomeByDate = useMemo(() => {
        const map = new Map<string, number>();
        for (const d of incomeSeries) {
            if (d.total > 0) map.set(d.date, d.total);
        }
        return map;
    }, [incomeSeries]);

    return (
        <div className="activity-calendar">
            <div className="activity-calendar-header">
                <h3>Cashflow calendar</h3>
            </div>
            <div className="activity-calendar-weekdays">
                {WEEKDAYS.map((day) => (
                    <span key={day} className="activity-calendar-weekday">
                        {day}
                    </span>
                ))}
            </div>
            <div className="activity-calendar-grid" role="grid" aria-label="Monthly cashflow calendar">
                {cells.map((date, i) => {
                    if (date == null) {
                        return <div key={`pad-${i}`} className="activity-calendar-cell empty" />;
                    }

                    const dayNum = parseInt(date.slice(8), 10);
                    const spend = spendByDate.get(date) ?? 0;
                    const income = incomeByDate.get(date) ?? 0;
                    const isToday = date === today;
                    const isSelected = date === selectedDate;
                    const parts: string[] = [];
                    if (income > 0) parts.push(`income ${formatAmount(income)}`);
                    if (spend > 0) parts.push(`spent ${formatAmount(spend)}`);

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
                            aria-label={`${date}${parts.length ? `, ${parts.join(', ')}` : ''}`}
                            aria-selected={isSelected}
                            onClick={() => onSelectDate(date)}
                        >
                            <span className="activity-calendar-day">{dayNum}</span>
                            <span className="activity-calendar-badges">
                                {income > 0 && (
                                    <span
                                        className="activity-badge income"
                                        title={formatAmount(income)}
                                    >
                                        {compactAmountLabel(income)}
                                    </span>
                                )}
                                {spend > 0 && (
                                    <span
                                        className="activity-badge expense"
                                        title={formatAmount(spend)}
                                    >
                                        {compactAmountLabel(spend)}
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
