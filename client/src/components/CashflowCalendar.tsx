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
    fixedCategories: string[];
    selectedDate: string;
    onSelectDate: (date: string) => void;
    formatAmount: (amount: number) => string;
}

export default function CashflowCalendar({
    month,
    expenseSeries,
    incomeSeries,
    fixedCategories,
    selectedDate,
    onSelectDate,
    formatAmount,
}: Props) {
    const cells = useMemo(() => getCalendarCells(month), [month]);
    const today = todayInKL();

    const fixedCategorySet = useMemo(() => new Set(fixedCategories), [fixedCategories]);

    const fixedSpendByDate = useMemo(() => {
        const map = new Map<string, number>();
        for (const d of expenseSeries) {
            let fixedTotal = 0;
            for (const [cat, amount] of Object.entries(d.byCategory)) {
                if (fixedCategorySet.has(cat)) fixedTotal += amount;
            }
            if (fixedTotal > 0) map.set(d.date, fixedTotal);
        }
        return map;
    }, [expenseSeries, fixedCategorySet]);

    const variableSpendByDate = useMemo(() => {
        const map = new Map<string, number>();
        for (const d of expenseSeries) {
            const variableTotal = d.total - (fixedSpendByDate.get(d.date) ?? 0);
            if (variableTotal > 0) map.set(d.date, variableTotal);
        }
        return map;
    }, [expenseSeries, fixedSpendByDate]);

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
                <div className="activity-calendar-legend">
                    <span className="legend-item">
                        <span className="legend-dot income" aria-hidden="true" />
                        Income
                    </span>
                    <span className="legend-item">
                        <span className="legend-dot fixed" aria-hidden="true" />
                        Fixed
                    </span>
                    <span className="legend-item">
                        <span className="legend-dot expense" aria-hidden="true" />
                        Variable
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
            <div className="activity-calendar-grid" role="grid" aria-label="Monthly cashflow calendar">
                {cells.map((date, i) => {
                    if (date == null) {
                        return <div key={`pad-${i}`} className="activity-calendar-cell empty" />;
                    }

                    const dayNum = parseInt(date.slice(8), 10);
                    const fixedSpend = fixedSpendByDate.get(date) ?? 0;
                    const variableSpend = variableSpendByDate.get(date) ?? 0;
                    const income = incomeByDate.get(date) ?? 0;
                    const isToday = date === today;
                    const isSelected = date === selectedDate;
                    const parts: string[] = [];
                    if (income > 0) parts.push(`income ${formatAmount(income)}`);
                    if (fixedSpend > 0) parts.push(`fixed ${formatAmount(fixedSpend)}`);
                    if (variableSpend > 0) parts.push(`variable ${formatAmount(variableSpend)}`);

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
                                {fixedSpend > 0 && (
                                    <span
                                        className="activity-badge fixed"
                                        title={`Fixed ${formatAmount(fixedSpend)}`}
                                    >
                                        {compactAmountLabel(fixedSpend)}
                                    </span>
                                )}
                                {variableSpend > 0 && (
                                    <span
                                        className="activity-badge expense"
                                        title={`Variable ${formatAmount(variableSpend)}`}
                                    >
                                        {compactAmountLabel(variableSpend)}
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
