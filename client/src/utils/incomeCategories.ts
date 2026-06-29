export const INCOME_CATEGORIES = ['Claim', 'Transfer', 'Salary', 'Other'] as const;

export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

export function buildIncomeCategoryOptions(usedCategories: string[] = []): string[] {
    return [...new Set([...INCOME_CATEGORIES, ...usedCategories])].sort();
}
