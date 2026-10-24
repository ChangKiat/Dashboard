import { useEffect, useState } from 'react';
import type { DateRange } from '../api';
import { formatMonthLabel, shiftMonth } from './useMonth';

export type Period = 'month' | '3m' | '6m' | 'ytd' | 'year' | 'all';

export const PERIODS: { id: Period; label: string }[] = [
    { id: 'month', label: 'Month' },
    { id: '3m', label: '3M' },
    { id: '6m', label: '6M' },
    { id: 'ytd', label: 'YTD' },
    { id: 'year', label: 'Year' },
    { id: 'all', label: 'All' },
];

const STORAGE_KEY = 'dashboard-cashflow-period';
/** Earlier than any entry, so "All" sums everything. */
const ALL_TIME_START = '2000-01-01';

function isPeriod(value: string | null): value is Period {
    return PERIODS.some((p) => p.id === value);
}

/** The Cashflow page's period, remembered in this browser. */
export function usePeriod() {
    const [period, setPeriod] = useState<Period>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return isPeriod(stored) ? stored : 'month';
        } catch {
            return 'month';
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, period);
        } catch {
            // localStorage unavailable
        }
    }, [period]);

    return { period, setPeriod };
}

function lastDayOfMonth(month: string) {
    const [yearStr, monthStr] = month.split('-');
    const day = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10), 0).getDate();
    return `${month}-${String(day).padStart(2, '0')}`;
}

/**
 * First and last month a period covers, counting back from the selected month.
 * "All" returns null: where it starts depends on the data.
 */
export function periodMonths(period: Period, month: string): { first: string; last: string } | null {
    const year = month.slice(0, 4);
    switch (period) {
        case 'month':
            return { first: month, last: month };
        case '3m':
            return { first: shiftMonth(month, -2), last: month };
        case '6m':
            return { first: shiftMonth(month, -5), last: month };
        case 'ytd':
            return { first: `${year}-01`, last: month };
        case 'year':
            return { first: `${year}-01`, last: `${year}-12` };
        case 'all':
            return null;
    }
}

export function periodRange(period: Period, month: string): DateRange {
    const months = periodMonths(period, month);
    if (!months) return { start: ALL_TIME_START, end: lastDayOfMonth(month) };
    return { start: `${months.first}-01`, end: lastDayOfMonth(months.last) };
}

/** Calendar months from `first` to `last`, both included. */
export function monthsBetween(first: string, last: string) {
    const [fy, fm] = first.split('-').map(Number);
    const [ly, lm] = last.split('-').map(Number);
    return Math.max(1, (ly - fy) * 12 + (lm - fm) + 1);
}

function shortMonth(month: string, withYear: boolean) {
    const [yearStr, monthStr] = month.split('-');
    return new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1).toLocaleDateString('en-US', {
        month: 'short',
        ...(withYear ? { year: 'numeric' } : {}),
    });
}

/** "October 2026", "Aug – Oct 2026", "Nov 2025 – Jan 2026", "2026", "Since May 2026". */
export function periodLabel(period: Period, month: string, firstDataMonth: string | null) {
    if (period === 'month') return formatMonthLabel(month);
    if (period === 'year') return month.slice(0, 4);
    if (period === 'all') return firstDataMonth ? `Since ${formatMonthLabel(firstDataMonth)}` : 'All time';
    const { first, last } = periodMonths(period, month)!;
    if (first === last) return formatMonthLabel(month);
    const sameYear = first.slice(0, 4) === last.slice(0, 4);
    return `${shortMonth(first, !sameYear)} – ${shortMonth(last, true)}`;
}
