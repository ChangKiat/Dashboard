import type { IncomeDailyPoint } from '../api';

export function sumIncomeDailyTotals(series: IncomeDailyPoint[]): number {
    return series.reduce((sum, point) => sum + point.total, 0);
}

export function countIncomeDays(series: IncomeDailyPoint[]): number {
    return series.filter((point) => point.total > 0).length;
}

export function rollupIncomeByCategory(series: IncomeDailyPoint[]): Record<string, number> {
    const byCategory: Record<string, number> = {};

    for (const point of series) {
        for (const [category, amount] of Object.entries(point.byCategory)) {
            byCategory[category] = (byCategory[category] ?? 0) + amount;
        }
    }

    return byCategory;
}
