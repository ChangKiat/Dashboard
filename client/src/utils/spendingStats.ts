export interface DaySpend {
    date: string;
    total: number;
}

export interface MonthSpendStats {
    /** Days of the month up to today (all of them for a past month). */
    daysSoFar: number;
    noSpendDays: number;
    averagePerDay: number;
    biggest: DaySpend | null;
}

/** Stats for one month's daily series, ignoring days after `today`. */
export function monthSpendStats(series: DaySpend[], today: string): MonthSpendStats {
    const sofar = series.filter((d) => d.date <= today);
    const total = sofar.reduce((sum, d) => sum + d.total, 0);
    const biggest = sofar.reduce<DaySpend | null>(
        (best, d) => (d.total > 0 && (best == null || d.total > best.total) ? d : best),
        null
    );
    return {
        daysSoFar: sofar.length,
        noSpendDays: sofar.filter((d) => d.total <= 0).length,
        averagePerDay: sofar.length > 0 ? total / sofar.length : 0,
        biggest,
    };
}

/**
 * Longest stretch of consecutive days with nothing spent, counted from the first day with any
 * spending (days before you started logging aren't a streak).
 */
export function longestNoSpendRun(series: DaySpend[]): { days: number; from: string | null; to: string | null } {
    const firstSpend = series.findIndex((d) => d.total > 0);
    let best = { days: 0, from: null as string | null, to: null as string | null };
    if (firstSpend === -1) return best;
    let runStart = -1;
    for (let i = firstSpend; i < series.length; i += 1) {
        if (series[i].total <= 0) {
            if (runStart === -1) runStart = i;
            const days = i - runStart + 1;
            if (days > best.days) best = { days, from: series[runStart].date, to: series[i].date };
        } else {
            runStart = -1;
        }
    }
    return best;
}

/** Shade 0 for no spending, then 1–4 by quartile of the days that had spending. */
export function spendLevels(series: DaySpend[]): (total: number) => 0 | 1 | 2 | 3 | 4 {
    const sorted = series.map((d) => d.total).filter((t) => t > 0).sort((a, b) => a - b);
    const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
    const [q1, q2, q3] = sorted.length > 0 ? [at(0.25), at(0.5), at(0.75)] : [0, 0, 0];
    return (total) => {
        if (total <= 0) return 0;
        if (total <= q1) return 1;
        if (total <= q2) return 2;
        if (total <= q3) return 3;
        return 4;
    };
}
