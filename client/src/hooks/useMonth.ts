import { useCallback, useState } from 'react';

const TIMEZONE = 'Asia/Kuala_Lumpur';

export function currentMonthInKL(): string {
    const t = new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE }));
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

export function shiftMonth(month: string, delta: number): string {
    const [yearStr, monthStr] = month.split('-');
    const date = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1 + delta, 1);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

export function formatMonthLabel(month: string): string {
    const [yearStr, monthStr] = month.split('-');
    const date = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
    return date.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });
}

export function useMonth(initialMonth?: string) {
    const [month, setMonth] = useState(initialMonth ?? currentMonthInKL());

    const setMonthValue = useCallback((value: string) => {
        if (/^\d{4}-\d{2}$/.test(value)) {
            setMonth(value);
        }
    }, []);

    return { month, setMonth: setMonthValue };
}
