export type BudgetStatus = 'ok' | 'warning' | 'over';

const WARNING_THRESHOLD = 0.8;

export function getBudgetStatus(spending: number, monthlyBudget: number): BudgetStatus {
    if (monthlyBudget <= 0) {
        return spending > 0 ? 'over' : 'ok';
    }
    if (spending > monthlyBudget) return 'over';
    if (spending >= monthlyBudget * WARNING_THRESHOLD) return 'warning';
    return 'ok';
}

export function getBudgetUsagePct(spending: number, monthlyBudget: number): number {
    if (monthlyBudget <= 0) return spending > 0 ? 100 : 0;
    return Math.round((spending / monthlyBudget) * 100);
}

export const BUDGET_STATUS_LABELS: Record<BudgetStatus, string | null> = {
    ok: null,
    warning: 'Near limit',
    over: 'Over budget',
};
