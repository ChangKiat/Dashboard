import type { DateRange, PaymentAccount } from '../api';
import { shiftMonth } from '../hooks/useMonth';
import { monthToDateRange } from './dateRange';

function daysInMonth(year: number, monthNum: number): number {
    return new Date(year, monthNum, 0).getDate();
}

function clampDay(year: number, monthNum: number, day: number): number {
    return Math.min(day, daysInMonth(year, monthNum));
}

function formatShortDate(dateStr: string): string {
    const [yearStr, monthStr, dayStr] = dateStr.split('-');
    const date = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, parseInt(dayStr, 10));
    return date.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
}

/** Credit statement cycle: month label "2025-07" + day 23 → 23 Jun – 22 Jul */
export function statementPeriodToDateRange(month: string, statementDay: number): DateRange {
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);

    const prevMonth = shiftMonth(month, -1);
    const [prevYearStr, prevMonthStr] = prevMonth.split('-');
    const prevYear = parseInt(prevYearStr, 10);
    const prevMonthNum = parseInt(prevMonthStr, 10);

    const startDay = clampDay(prevYear, prevMonthNum, statementDay);
    const start = `${prevMonth}-${String(startDay).padStart(2, '0')}`;

    if (statementDay === 1) {
        const lastDay = daysInMonth(prevYear, prevMonthNum);
        return {
            start,
            end: `${prevMonth}-${String(lastDay).padStart(2, '0')}`,
        };
    }

    const endDay = clampDay(year, monthNum, statementDay - 1);
    const end = `${month}-${String(endDay).padStart(2, '0')}`;

    return { start, end };
}

export function accountPeriodToDateRange(account: PaymentAccount, month: string): DateRange {
    if (account.accountType === 'credit' && account.statementDay != null) {
        return statementPeriodToDateRange(month, account.statementDay);
    }
    return monthToDateRange(month);
}

export function formatPeriodLabel(account: PaymentAccount, month: string): string {
    const { start, end } = accountPeriodToDateRange(account, month);
    if (account.accountType === 'credit' && account.statementDay != null) {
        const endYear = end.slice(0, 4);
        return `${formatShortDate(start)} – ${formatShortDate(end)} ${endYear}`;
    }

    const [yearStr, monthStr] = month.split('-');
    const date = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
    return date.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });
}

export function isDateInRange(date: string, range: DateRange): boolean {
    return date >= range.start && date <= range.end;
}
