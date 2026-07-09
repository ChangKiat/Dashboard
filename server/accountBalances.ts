import { resolvePaymentMethod } from '../../AI Agent/src/config/paymentMethods';
import type { PaymentAccount } from '../../AI Agent/src/services/paymentAccountService';

export type ExpenseRow = {
    id: number;
    date: string;
    amount: string;
    category: string;
    description: string;
    paymentMethod?: string | null;
};

export type IncomeRow = {
    id: number;
    date: string;
    amount: string;
    category: string;
    description: string;
    paymentMethod?: string | null;
    fromPaymentMethod?: string | null;
};

export type AccountBalanceFields = {
    balance?: number;
    amountOwed?: number;
    availableCredit?: number;
};

export type PaymentAccountWithBalance = PaymentAccount & AccountBalanceFields;

export type AccountActivityType =
    | 'expense'
    | 'income'
    | 'transfer_in'
    | 'transfer_out';

export type AccountActivityEntry = {
    id: number;
    date: string;
    type: AccountActivityType;
    description: string;
    category: string;
    amount: number;
    direction: 'in' | 'out';
    runningBalance?: number;
    runningOwed?: number;
};

function matchesAccount(stored: string | null | undefined, accountName: string): boolean {
    if (!stored) return false;
    return resolvePaymentMethod(stored) === accountName;
}

function parseAmount(value: string): number {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
}

function getBaselineDate(account: PaymentAccount): string {
    return account.balanceBaselineDate || '0000-00-00';
}

function isOnOrAfterBaseline(date: string, account: PaymentAccount): boolean {
    if (account.accountType !== 'account') return true;
    return date >= getBaselineDate(account);
}

export function computeAccountBalances(
    accounts: PaymentAccount[],
    expenses: ExpenseRow[],
    incomes: IncomeRow[]
): PaymentAccountWithBalance[] {
    const deltas = new Map<number, { debitDelta: number; creditOwedDelta: number }>();
    for (const account of accounts) {
        deltas.set(account.id, { debitDelta: 0, creditOwedDelta: 0 });
    }

    const accountByName = new Map(
        accounts.map((account) => [account.name.toLowerCase(), account])
    );

    function getAccountByStoredName(stored: string | null | undefined): PaymentAccount | undefined {
        if (!stored) return undefined;
        const resolved = resolvePaymentMethod(stored);
        if (!resolved) return undefined;
        return accountByName.get(resolved.toLowerCase());
    }

    for (const expense of expenses) {
        const account = getAccountByStoredName(expense.paymentMethod);
        if (!account) continue;
        if (!isOnOrAfterBaseline(expense.date, account)) continue;
        const amount = parseAmount(expense.amount);
        const entry = deltas.get(account.id)!;
        if (account.accountType === 'credit') {
            entry.creditOwedDelta += amount;
        } else {
            entry.debitDelta -= amount;
        }
    }

    for (const income of incomes) {
        const amount = parseAmount(income.amount);
        if (income.category === 'Account transfer') {
            const fromAccount = getAccountByStoredName(income.fromPaymentMethod);
            const toAccount = getAccountByStoredName(income.paymentMethod);
            if (fromAccount && isOnOrAfterBaseline(income.date, fromAccount)) {
                const fromEntry = deltas.get(fromAccount.id)!;
                if (fromAccount.accountType === 'credit') {
                    fromEntry.creditOwedDelta += amount;
                } else {
                    fromEntry.debitDelta -= amount;
                }
            }
            if (toAccount && isOnOrAfterBaseline(income.date, toAccount)) {
                const toEntry = deltas.get(toAccount.id)!;
                if (toAccount.accountType === 'credit') {
                    toEntry.creditOwedDelta -= amount;
                } else {
                    toEntry.debitDelta += amount;
                }
            }
            continue;
        }

        const account = getAccountByStoredName(income.paymentMethod);
        if (!account) continue;
        if (!isOnOrAfterBaseline(income.date, account)) continue;
        const entry = deltas.get(account.id)!;
        if (account.accountType === 'credit') {
            entry.creditOwedDelta -= amount;
        } else {
            entry.debitDelta += amount;
        }
    }

    return accounts.map((account) => {
        const { debitDelta, creditOwedDelta } = deltas.get(account.id)!;
        if (account.accountType === 'credit') {
            const amountOwed = Math.max(0, creditOwedDelta);
            const limit = account.creditLimit ?? 0;
            return {
                ...account,
                amountOwed,
                availableCredit: limit - amountOwed,
            };
        }
        return {
            ...account,
            balance: account.initialBalance + debitDelta,
        };
    });
}

export function buildAccountActivity(
    account: PaymentAccount,
    expenses: ExpenseRow[],
    incomes: IncomeRow[]
): AccountActivityEntry[] {
    const entries: Omit<AccountActivityEntry, 'runningBalance' | 'runningOwed'>[] = [];

    for (const expense of expenses) {
        if (!matchesAccount(expense.paymentMethod, account.name)) continue;
        if (!isOnOrAfterBaseline(expense.date, account)) continue;
        entries.push({
            id: expense.id,
            date: expense.date,
            type: 'expense',
            description: expense.description,
            category: expense.category,
            amount: parseAmount(expense.amount),
            direction: account.accountType === 'credit' ? 'out' : 'out',
        });
    }

    for (const income of incomes) {
        const amount = parseAmount(income.amount);
        if (income.category === 'Account transfer') {
            if (
                matchesAccount(income.paymentMethod, account.name) &&
                isOnOrAfterBaseline(income.date, account)
            ) {
                entries.push({
                    id: income.id,
                    date: income.date,
                    type: 'transfer_in',
                    description: income.description || 'Account transfer',
                    category: income.category,
                    amount,
                    direction: 'in',
                });
            }
            if (
                matchesAccount(income.fromPaymentMethod, account.name) &&
                isOnOrAfterBaseline(income.date, account)
            ) {
                entries.push({
                    id: income.id,
                    date: income.date,
                    type: 'transfer_out',
                    description: income.description || 'Account transfer',
                    category: income.category,
                    amount,
                    direction: 'out',
                });
            }
            continue;
        }

        if (!matchesAccount(income.paymentMethod, account.name)) continue;
        if (!isOnOrAfterBaseline(income.date, account)) continue;
        entries.push({
            id: income.id,
            date: income.date,
            type: 'income',
            description: income.description,
            category: income.category,
            amount,
            direction: 'in',
        });
    }

    entries.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

    let runningDebit = account.accountType === 'account' ? account.initialBalance : undefined;
    let runningOwed = account.accountType === 'credit' ? 0 : undefined;

    const chronological = [...entries].sort(
        (a, b) => a.date.localeCompare(b.date) || a.id - b.id
    );
    const runningByKey = new Map<string, { runningBalance?: number; runningOwed?: number }>();

    for (const entry of chronological) {
        if (account.accountType === 'account') {
            runningDebit =
                (runningDebit ?? account.initialBalance) +
                (entry.direction === 'in' ? entry.amount : -entry.amount);
            runningByKey.set(`${entry.date}:${entry.id}:${entry.type}`, {
                runningBalance: runningDebit,
            });
        } else {
            runningOwed =
                (runningOwed ?? 0) +
                (entry.direction === 'out' ? entry.amount : -entry.amount);
            runningOwed = Math.max(0, runningOwed);
            runningByKey.set(`${entry.date}:${entry.id}:${entry.type}`, {
                runningOwed,
            });
        }
    }

    return entries.map((entry) => ({
        ...entry,
        ...runningByKey.get(`${entry.date}:${entry.id}:${entry.type}`),
    }));
}
