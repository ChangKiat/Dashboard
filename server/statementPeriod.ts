import type { PaymentAccount } from '../agent/services/paymentAccountService';

export type DateRange = { start: string; end: string };

function shiftMonth(month: string, delta: number): string {
    const [yearStr, monthStr] = month.split('-');
    const date = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1 + delta, 1);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

function daysInMonth(year: number, monthNum: number): number {
    return new Date(year, monthNum, 0).getDate();
}

function clampDay(year: number, monthNum: number, day: number): number {
    return Math.min(day, daysInMonth(year, monthNum));
}

function monthToDateRange(month: string): DateRange {
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);
    const lastDay = new Date(year, monthNum, 0).getDate();
    return {
        start: `${month}-01`,
        end: `${month}-${String(lastDay).padStart(2, '0')}`,
    };
}

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

export function isDateInRange(date: string, range: DateRange): boolean {
    return date >= range.start && date <= range.end;
}

export function formatRebateMonthLabel(month: string): string {
    const [yearStr, monthStr] = month.split('-');
    const date = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
    return date.toLocaleDateString('en-MY', { month: 'short', year: 'numeric' });
}
