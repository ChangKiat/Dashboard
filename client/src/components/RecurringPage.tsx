import { useMemo } from 'react';

import type { FixedExpenseConfig } from '../api';
import { formatHours, hourlyRate, useWorkHours } from '../hooks/useWorkHours';
import { useAmountVisibility } from '../hooks/useAmountVisibility';
import { monthToDateRange, todayInKL } from '../utils/dateRange';
import { dueDatesBetween, monthlyCost } from '../utils/recurring';
import FixedExpensesTable from './FixedExpensesTable';
import { BarsIcon, CalendarIcon, ClockIcon, RepeatIcon } from './icons';
import SummaryCard from './SummaryCard';

const WORKDAY_START_MINUTES = 9 * 60;
const UPCOMING_DAYS = 30;
const UPCOMING_SHOWN = 8;

interface Props {
    rows: FixedExpenseConfig[];
    variableCategories: string[];
    salaryAfterTax: number;
    formatAmount: (amount: number) => string;
    onChanged: () => void;
}

function shiftDate(iso: string, days: number) {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() + days);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
}

/** 15:03 → "3:03 pm". */
function formatClock(minutesFromMidnight: number) {
    const h = Math.floor(minutesFromMidnight / 60) % 24;
    const m = Math.round(minutesFromMidnight % 60);
    const suffix = h < 12 ? 'am' : 'pm';
    return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** Bills and subscriptions that repeat: totals, the list, and what's due in the next 30 days. */
export default function RecurringPage({ rows, variableCategories, salaryAfterTax, formatAmount, onChanged }: Props) {
    const { hidden } = useAmountVisibility();
    const { hoursPerWeek } = useWorkHours();
    const today = todayInKL();
    const rate = hourlyRate(salaryAfterTax, hoursPerWeek);
    /** "6.1 h" of work for an amount, or null without a salary. */
    const workTime = (amount: number) => {
        if (rate == null) return null;
        return hidden ? '•• h' : formatHours(amount / rate);
    };

    const monthlyTotal = rows.reduce((sum, row) => sum + monthlyCost(row), 0);
    const workdayHours = hoursPerWeek / 5;
    // The share of take-home pay the bills use, as hours of each workday.
    const billHoursPerDay = salaryAfterTax > 0 ? (monthlyTotal / salaryAfterTax) * workdayHours : null;

    const monthEnd = monthToDateRange(today.slice(0, 7)).end;
    const stillDueThisMonth = rows.filter((row) => dueDatesBetween(row, today, monthEnd).length > 0).length;

    const upcoming = useMemo(() => {
        const until = shiftDate(today, UPCOMING_DAYS);
        return rows
            .flatMap((row) => dueDatesBetween(row, today, until).map((date) => ({ row, date })))
            .sort((a, b) => a.date.localeCompare(b.date) || b.row.amount - a.row.amount);
    }, [rows, today]);

    let paidOffValue = '—';
    let paidOffSub = 'Needs your salary after tax';
    if (billHoursPerDay != null) {
        paidOffValue =
            billHoursPerDay >= workdayHours
                ? 'After hours'
                : formatClock(WORKDAY_START_MINUTES + billHoursPerDay * 60);
        paidOffSub = `Starting at 9:00, each workday’s first ${formatHours(billHoursPerDay)} covers them (${workdayHours} h days)`;
    }

    return (
        <div className="recurring-page">
            <div className="summary-grid-4">
                <SummaryCard
                    tone="spend"
                    icon={<RepeatIcon size={26} />}
                    label="Fixed costs a month"
                    value={formatAmount(monthlyTotal)}
                    sub={workTime(monthlyTotal) ? `≈ ${workTime(monthlyTotal)} of work` : undefined}
                />
                <SummaryCard
                    tone="spend"
                    icon={<CalendarIcon size={26} />}
                    label="A year"
                    value={formatAmount(monthlyTotal * 12)}
                    sub={workTime(monthlyTotal * 12) ? `≈ ${workTime(monthlyTotal * 12)} of work` : undefined}
                />
                <SummaryCard
                    tone="net"
                    icon={<ClockIcon size={26} />}
                    label="Bills paid off by"
                    value={paidOffValue}
                    sub={paidOffSub}
                />
                <SummaryCard
                    tone="net"
                    icon={<BarsIcon size={26} />}
                    label="Active rules"
                    value={String(rows.length)}
                    sub={`${stillDueThisMonth} still due this month`}
                />
            </div>

            <div className="recurring-grid">
                <FixedExpensesTable
                    rows={rows}
                    variableCategories={variableCategories}
                    formatAmount={formatAmount}
                    onChanged={onChanged}
                    today={today}
                    workTime={workTime}
                />

                <section className="card recurring-upcoming" aria-labelledby="recurring-upcoming-title">
                    <h3 id="recurring-upcoming-title">Coming up</h3>
                    <p className="recurring-sub">The next {UPCOMING_DAYS} days</p>
                    {upcoming.length === 0 ? (
                        <p className="muted">Nothing due in the next {UPCOMING_DAYS} days.</p>
                    ) : (
                        <ol className="recurring-timeline">
                            {upcoming.slice(0, UPCOMING_SHOWN).map(({ row, date }) => (
                                <li key={`${row.id}-${date}`}>
                                    <span className="recurring-timeline-date">
                                        {date === today
                                            ? 'Today'
                                            : new Date(`${date}T12:00:00`).toLocaleDateString('en-MY', {
                                                  weekday: 'short',
                                                  day: 'numeric',
                                                  month: 'short',
                                              })}
                                    </span>
                                    <span className="recurring-timeline-row">
                                        <span className="recurring-timeline-name">{row.description}</span>
                                        <span className="recurring-timeline-amount">{formatAmount(row.amount)}</span>
                                    </span>
                                </li>
                            ))}
                        </ol>
                    )}
                    {upcoming.length > UPCOMING_SHOWN && (
                        <p className="recurring-sub">
                            + {upcoming.length - UPCOMING_SHOWN} more, {formatAmount(
                                upcoming.slice(UPCOMING_SHOWN).reduce((sum, u) => sum + u.row.amount, 0)
                            )}{' '}
                            in total
                        </p>
                    )}
                </section>
            </div>
        </div>
    );
}
