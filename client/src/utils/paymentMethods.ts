import type { PaymentAccount, PaymentAccountType } from '../api';

export interface PaymentMethodOptionsConfig {
    /** Account types to omit from the picker (e.g. investment for expenses). */
    excludeTypes?: PaymentAccountType[];
}

export function buildPaymentMethodOptions(
    accounts: PaymentAccount[],
    currentValue?: string | null,
    config?: PaymentMethodOptionsConfig
): string[] {
    const excluded = new Set(config?.excludeTypes ?? []);
    const options = accounts
        .filter((account) => !excluded.has(account.accountType))
        .map((account) => account.name);
    if (currentValue && !options.includes(currentValue)) {
        return [currentValue, ...options];
    }
    return options;
}

export function formatPaymentAccountType(accountType: PaymentAccount['accountType']): string {
    if (accountType === 'credit') return 'Credit';
    if (accountType === 'investment') return 'Investment';
    return 'Account';
}
