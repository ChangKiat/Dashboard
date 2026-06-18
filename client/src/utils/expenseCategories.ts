export function buildExpenseCategoryOptions(
    variableCategories: string[],
    usedCategories: string[] = []
): string[] {
    return [...new Set([...variableCategories, ...usedCategories])].sort();
}
