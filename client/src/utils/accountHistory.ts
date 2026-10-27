import type { BalancePoint } from '../api';

export function addDays(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/**
 * One value per day from `from` to `to`, carrying each change forward. Days before the first point
 * are left out, so a short history isn't padded with made-up values.
 */
export function dailyValues(points: BalancePoint[], from: string, to: string): BalancePoint[] {
    if (points.length === 0) return [];
    const start = from > points[0].date ? from : points[0].date;
    let i = 0;
    let value = points[0].value;
    const days: BalancePoint[] = [];
    for (let date = start; date <= to; date = addDays(date, 1)) {
        while (i < points.length && points[i].date <= date) {
            value = points[i].value;
            i += 1;
        }
        days.push({ date, value });
    }
    return days;
}

/** "7 Feb 2027". */
export function formatShortDate(iso: string): string {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('en-MY', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}
