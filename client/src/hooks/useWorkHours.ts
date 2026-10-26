import { useState } from 'react';

// Set earlier from the Cashflow page's rate popover; still read so a saved work week is kept.
const HOURS_KEY = 'dashboard-work-hours-per-week';

export const DEFAULT_HOURS_PER_WEEK = 40;
const WEEKS_PER_MONTH = 52 / 12;

function readHoursPerWeek() {
    try {
        const stored = parseFloat(localStorage.getItem(HOURS_KEY) ?? '');
        return Number.isFinite(stored) && stored >= 1 && stored <= 100 ? stored : DEFAULT_HOURS_PER_WEEK;
    } catch {
        return DEFAULT_HOURS_PER_WEEK;
    }
}

/** Hours worked per week, used to turn amounts into hours of work. */
export function useWorkHours() {
    const [hoursPerWeek] = useState(readHoursPerWeek);
    return { hoursPerWeek };
}

/** Take-home pay per hour worked, or null when there is no salary to divide. */
export function hourlyRate(salaryAfterTax: number, hoursPerWeek: number): number | null {
    const hours = hoursPerWeek * WEEKS_PER_MONTH;
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
