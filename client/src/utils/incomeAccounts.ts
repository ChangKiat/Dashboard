export function formatIncomeAccountFlow(
    paymentMethod?: string | null,
    fromPaymentMethod?: string | null
): string | null {
    if (fromPaymentMethod && paymentMethod) {
        return `${fromPaymentMethod} → ${paymentMethod}`;
    }
    if (paymentMethod) return `→ ${paymentMethod}`;
    if (fromPaymentMethod) return `${fromPaymentMethod} →`;
    return null;
}

export function countsTowardIncomeTotal(category: string): boolean {
    return category !== 'Account transfer';
}
