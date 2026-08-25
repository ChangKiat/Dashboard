import type { ExpenseTransaction, IncomeTransaction } from '../api';
import { formatIncomeAccountFlow } from './incomeAccounts';

export const BANK_CHARGES_CATEGORY = 'Bank charges';

export function transferFeesToExpenseEntries(incomes: IncomeTransaction[]): ExpenseTransaction[] {
    return incomes
        .filter((entry) => entry.category === 'Account transfer' && (entry.transferFee ?? 0) > 0)
        .map((entry) => {
            const flow = formatIncomeAccountFlow(entry.paymentMethod, entry.fromPaymentMethod);
            const baseDescription = entry.description.trim() || 'Account transfer';
            const flowLabel = flow ? ` · ${flow}` : '';

            return {
                id: -entry.id,
                date: entry.date,
                amount: entry.transferFee!,
                category: BANK_CHARGES_CATEGORY,
                description: `${baseDescription} (transfer fee)${flowLabel}`,
                paymentMethod: entry.fromPaymentMethod ?? null,
            };
        });
}
