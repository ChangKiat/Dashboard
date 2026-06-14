export function formatCell(value: number | string | null | undefined) {
    if (value == null || value === '') return '—';
    return String(value);
}

export function parseOptionalNumber(value: string): number | null {
    if (value.trim() === '') return null;
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : null;
}

export function parseOptionalInt(value: string): number | null {
    if (value.trim() === '') return null;
    const n = parseInt(value, 10);
    return Number.isInteger(n) ? n : null;
}

export function parseRequiredNumber(value: string): number | null {
    if (value.trim() === '') return null;
    const n = parseFloat(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
}
