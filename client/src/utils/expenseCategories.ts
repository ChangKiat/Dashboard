export function buildExpenseCategoryOptions(
    variableCategories: string[],
    usedCategories: string[] = []
): string[] {
    return [...new Set([...variableCategories, ...usedCategories])].sort();
}

export function isInvestmentCategory(category: string): boolean {
    return category.trim().toLowerCase() === 'investment';
}

export function isOtherCategory(category: string): boolean {
    return category.trim().toLowerCase() === 'other';
}

/** Investment and Other expenses can show from→to account fields. */
export function requiresAccountTransfer(category: string): boolean {
    return isInvestmentCategory(category) || isOtherCategory(category);
}

/**
 * Resolve Other from/to fields:
 * - both → funding transfer
 * - from only → debit from
 * - to only → debit to (treat as payment method)
 * - neither → no payment method
 */
export function resolveOtherAccountFields(
    fromAccount: string | null,
    toAccount: string | null
): { paymentMethod: string | null; toInvestmentAccount: string | null } {
    if (fromAccount && toAccount) {
        return { paymentMethod: fromAccount, toInvestmentAccount: toAccount };
    }
    if (fromAccount) {
        return { paymentMethod: fromAccount, toInvestmentAccount: null };
    }
    if (toAccount) {
        return { paymentMethod: toAccount, toInvestmentAccount: null };
    }
    return { paymentMethod: null, toInvestmentAccount: null };
}
