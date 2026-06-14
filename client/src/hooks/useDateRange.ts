import { useCallback, useMemo, useState } from 'react';
import type { DateRange } from '../api';

const TIMEZONE = 'Asia/Kuala_Lumpur';

function formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function todayInKL(): Date {
    return new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE }));
}

function rangeFromDays(days: number): DateRange {
    const end = todayInKL();
    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));
    return { start: formatDate(start), end: formatDate(end) };
}

export type Preset = '7d' | '30d' | '90d' | 'custom';

export function useDateRange(initialPreset: Preset = '30d') {
    const [preset, setPreset] = useState<Preset>(initialPreset);
    const [customRange, setCustomRange] = useState<DateRange>(rangeFromDays(30));

    const range = useMemo<DateRange>(() => {
        if (preset === 'custom') return customRange;
        if (preset === '7d') return rangeFromDays(7);
        if (preset === '90d') return rangeFromDays(90);
        return rangeFromDays(30);
    }, [preset, customRange]);

    const setCustom = useCallback((start: string, end: string) => {
        setPreset('custom');
        setCustomRange({ start, end });
    }, []);

    return { range, preset, setPreset, setCustom };
}
