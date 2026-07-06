import type { PaymentAccount } from '../api';

export function buildPaymentMethodOptions(
    accounts: PaymentAccount[],
    currentValue?: string | null
): string[] {
    const options = accounts.map((account) => account.name);
    if (currentValue && !options.includes(currentValue)) {
        return [currentValue, ...options];
    }
    return options;
}

export function formatPaymentAccountType(accountType: PaymentAccount['accountType']): string {
    return accountType === 'credit' ? 'Credit' : 'Account';
}
