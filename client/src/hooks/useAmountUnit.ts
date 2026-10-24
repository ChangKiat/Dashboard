import { useEffect, useState } from 'react';

export type AmountUnit = 'rm' | 'hours';

const UNIT_KEY = 'dashboard-amount-unit';
const HOURS_KEY = 'dashboard-work-hours-per-week';

export const DEFAULT_HOURS_PER_WEEK = 40;
export const MIN_HOURS_PER_WEEK = 1;
export const MAX_HOURS_PER_WEEK = 100;
const WEEKS_PER_MONTH = 52 / 12;

function readStored(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeStored(key: string, value: string) {
    try {
        localStorage.setItem(key, value);
    } catch {
        // localStorage unavailable
    }
}

export function isValidHoursPerWeek(value: number) {
    return Number.isFinite(value) && value >= MIN_HOURS_PER_WEEK && value <= MAX_HOURS_PER_WEEK;
}

/** Whether amounts show in RM or in hours of work, plus the work week used for the rate. */
export function useAmountUnit() {
    const [unit, setUnit] = useState<AmountUnit>(() => (readStored(UNIT_KEY) === 'hours' ? 'hours' : 'rm'));
    const [hoursPerWeek, setHoursPerWeek] = useState<number>(() => {
        const stored = parseFloat(readStored(HOURS_KEY) ?? '');
        return isValidHoursPerWeek(stored) ? stored : DEFAULT_HOURS_PER_WEEK;
    });

    useEffect(() => writeStored(UNIT_KEY, unit), [unit]);
    useEffect(() => writeStored(HOURS_KEY, String(hoursPerWeek)), [hoursPerWeek]);

    return { unit, setUnit, hoursPerWeek, setHoursPerWeek };
}

export function monthlyWorkHours(hoursPerWeek: number) {
    return hoursPerWeek * WEEKS_PER_MONTH;
}

/** Take-home pay per hour worked, or null when there is no salary to divide. */
export function hourlyRate(salaryAfterTax: number, hoursPerWeek: number): number | null {
    const hours = monthlyWorkHours(hoursPerWeek);
    return salaryAfterTax > 0 && hours > 0 ? salaryAfterTax / hours : null;
}

/** 0.4 → "24 min", 7.62 → "7.6 h", 1388.7 → "1,389 h". */
export function formatHours(hours: number): string {
    const sign = hours < 0 ? '-' : '';
    const abs = Math.abs(hours);
    const minutes = Math.round(abs * 60);
    if (minutes < 60) return `${sign}${minutes} min`;
    if (abs < 10) return `${sign}${abs.toFixed(1)} h`;
    return `${sign}${Math.round(abs).toLocaleString('en-MY')} h`;
}
