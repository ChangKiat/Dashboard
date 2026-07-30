export function buildExpenseCategoryOptions(
    variableCategories: string[],
    usedCategories: string[] = []
): string[] {
    return [...new Set([...variableCategories, ...usedCategories])].sort();
}

export function isInvestmentCategory(category: string): boolean {
    return category.trim().toLowerCase() === 'investment';
}

/** Investment and Other expenses create a linked from→to Account transfer. */
export function requiresAccountTransfer(category: string): boolean {
    const c = category.trim().toLowerCase();
    return c === 'investment' || c === 'other';
}
