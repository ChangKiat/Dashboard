import type { DateRange } from '../api';

const TIMEZONE = 'Asia/Kuala_Lumpur';

export function todayInKL(): string {
    const t = new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE }));
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, '0');
    const d = String(t.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function monthToDateRange(month: string): DateRange {
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);
    const lastDay = new Date(year, monthNum, 0).getDate();
    return {
        start: `${month}-01`,
        end: `${month}-${String(lastDay).padStart(2, '0')}`,
    };
}

export function getCalendarCells(month: string): (string | null)[] {
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const monthIndex = parseInt(monthStr, 10) - 1;
    const firstDay = new Date(year, monthIndex, 1);
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const startOffset = (firstDay.getDay() + 6) % 7;

    const cells: (string | null)[] = Array(startOffset).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
        cells.push(`${month}-${String(d).padStart(2, '0')}`);
    }
    return cells;
}

export function pickDefaultSelectedDate(
    month: string,
    workoutDates: { date: string; sessionCount: number }[],
    mealDates: { date: string; mealCount: number }[]
): string {
    const today = todayInKL();
    if (today.startsWith(`${month}-`)) return today;

    const activeDates = new Set<string>();
    for (const d of workoutDates) {
        if (d.sessionCount > 0) activeDates.add(d.date);
    }
    for (const d of mealDates) {
        if (d.mealCount > 0) activeDates.add(d.date);
    }
    if (activeDates.size === 0) return `${month}-01`;

    return [...activeDates].sort().reverse()[0];
}
