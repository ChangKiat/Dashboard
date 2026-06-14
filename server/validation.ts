const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseIdParam(value: string): number | null {
    const id = parseInt(value, 10);
    if (!Number.isInteger(id) || id <= 0) return null;
    return id;
}

export function isValidDate(value: unknown): value is string {
    if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
    const [yearStr, monthStr, dayStr] = value.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);
    const date = new Date(year, month - 1, day);
    return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
    );
}

export function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

export function isNonNegativeInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function isPositiveNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function isDayOfMonth(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 31;
}
