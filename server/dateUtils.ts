const TIMEZONE = 'Asia/Kuala_Lumpur';

export function todayInKL(): string {
    const t = new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE }));
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, '0');
    const d = String(t.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function daysAgoInKL(days: number): string {
    const t = new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE }));
    t.setDate(t.getDate() - days);
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, '0');
    const d = String(t.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function parseDateRange(
    start?: string,
    end?: string
): { start: string; end: string } {
    const resolvedEnd = end && /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : todayInKL();
    const resolvedStart =
        start && /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : daysAgoInKL(29);
    return { start: resolvedStart, end: resolvedEnd };
}

export function currentMonthInKL(): string {
    const t = new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE }));
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

export function parseMonth(month?: string): { month: string; start: string; end: string } {
    const resolved =
        month && /^\d{4}-\d{2}$/.test(month) ? month : currentMonthInKL();
    const [yearStr, monthStr] = resolved.split('-');
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);
    const lastDay = new Date(year, monthNum, 0).getDate();
    return {
        month: resolved,
        start: `${resolved}-01`,
        end: `${resolved}-${String(lastDay).padStart(2, '0')}`,
    };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A month's first and last day, or an explicit start/end when both are valid dates
 * (used for the 3M / 6M / YTD / Year / All periods). `month` stays the anchor month.
 */
export function parseMonthOrRange(
    month?: string,
    start?: string,
    end?: string
): { month: string; start: string; end: string } {
    const parsed = parseMonth(month);
    if (start && end && ISO_DATE.test(start) && ISO_DATE.test(end) && start <= end) {
        return { month: parsed.month, start, end };
    }
    return parsed;
}

export function enumerateDates(start: string, end: string): string[] {
    const dates: string[] = [];
    const current = new Date(`${start}T12:00:00`);
    const last = new Date(`${end}T12:00:00`);
    while (current <= last) {
        const y = current.getFullYear();
        const m = String(current.getMonth() + 1).padStart(2, '0');
        const d = String(current.getDate()).padStart(2, '0');
        dates.push(`${y}-${m}-${d}`);
        current.setDate(current.getDate() + 1);
    }
    return dates;
}
