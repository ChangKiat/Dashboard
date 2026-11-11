import type { FixedExpenseConfig } from '../api';

const AVERAGE_DAYS_PER_MONTH = 365.25 / 12;

/** The every-N-days schedule of a rule, or null when it repeats on a day of the month. */
function intervalOf(row: FixedExpenseConfig) {
    return row.intervalDays && row.intervalStartDate
        ? { days: row.intervalDays, startDate: row.intervalStartDate }
        : null;
}

function utcDay(iso: string) {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
}

function addDays(iso: string, days: number) {
    return new Date(utcDay(iso) + days * 86_400_000).toISOString().slice(0, 10);
}

/** What a rule costs per month on average (a yearly RM 1,200 bill is RM 100 a month). */
export function monthlyCost(row: FixedExpenseConfig) {
    const interval = intervalOf(row);
    if (interval) return (row.amount * AVERAGE_DAYS_PER_MONTH) / interval.days;
    return row.amount / (row.frequencyMonths || 1);
}

export function frequencyLabel(row: FixedExpenseConfig) {
    const interval = intervalOf(row);
    if (interval) return interval.days === 1 ? 'Every day' : `Every ${interval.days} days`;
    const months = row.frequencyMonths;
    if (months === 1) return 'Every month';
    if (months === 12) return 'Every year';
    return `Every ${months} months`;
}

/** Same rule as the bot's 9 am job: due when (month − start month) is a multiple of the frequency. */
function isDueInMonth(row: FixedExpenseConfig, month: number) {
    const freq = row.frequencyMonths || 1;
    const diff = month - row.startMonth;
    return ((diff % freq) + freq) % freq === 0;
}

/** The rule's day in that month, moved back to the last day for short months. */
function dueDate(row: FixedExpenseConfig, year: number, month: number) {
    const day = Math.min(row.dayOfMonth, new Date(year, month, 0).getDate());
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Every due date from `from` to `to` (YYYY-MM-DD, both included), oldest first. */
export function dueDatesBetween(row: FixedExpenseConfig, from: string, to: string): string[] {
    const dates: string[] = [];
    const interval = intervalOf(row);
    if (interval) {
        // Same rule as the 9 am job: the start date, then every N days after it.
        const behind = Math.round((utcDay(from) - utcDay(interval.startDate)) / 86_400_000);
        let date =
            behind > 0
                ? addDays(interval.startDate, Math.ceil(behind / interval.days) * interval.days)
                : interval.startDate;
        while (date <= to && dates.length < 1500) {
            dates.push(date);
            date = addDays(date, interval.days);
        }
        return dates;
    }
    let year = parseInt(from.slice(0, 4), 10);
    let month = parseInt(from.slice(5, 7), 10);
    for (let i = 0; i < 36; i += 1) {
        if (isDueInMonth(row, month)) {
            const date = dueDate(row, year, month);
            if (date > to) break;
            if (date >= from) dates.push(date);
        }
        month += 1;
        if (month > 12) {
            month = 1;
            year += 1;
        }
        if (`${year}-${String(month).padStart(2, '0')}-01` > to) break;
    }
    return dates;
}

/** The next due date on or after `today`, or null if none within three years. */
export function nextDueDate(row: FixedExpenseConfig, today: string): string | null {
    const year = parseInt(today.slice(0, 4), 10);
    return dueDatesBetween(row, today, `${year + 3}${today.slice(4)}`)[0] ?? null;
}
