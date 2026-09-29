import { resolvePaymentMethod } from '../agent/config/paymentMethods';
import type { PaymentAccount } from '../agent/services/paymentAccountService';
import { isDebitBalanceType } from '../agent/services/paymentAccountService';

export type ExpenseRow = {
    id: number;
    date: string;
    amount: string;
    category: string;
    description: string;
    paymentMethod?: string | null;
    tripLeg?: string | null;
};

export type IncomeRow = {
    id: number;
    date: string;
    amount: string;
    category: string;
    description: string;
    paymentMethod?: string | null;
    fromPaymentMethod?: string | null;
    expenseId?: number | null;
    transferFee?: string | null;
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
    beforeBaseline: boolean;
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

function parseTransferFee(value: string | null | undefined): number {
    if (!value) return 0;
    const n = parseFloat(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Expense id → the account its linked Account transfer paid into. */
function getFundingDestinations(incomes: IncomeRow[]): Map<number, string | null | undefined> {
    const destinations = new Map<number, string | null | undefined>();
    for (const income of incomes) {
        if (income.category === 'Account transfer' && income.expenseId != null) {
            destinations.set(income.expenseId, income.paymentMethod);
        }
    }
    return destinations;
}

/**
 * Account an expense's amount leaves. A linked Account transfer already moved the money out of the
 * paying account, so the expense itself is skipped — unless a holding buy is linked to it: then the
 * transferred cash went on from the destination account into the holding.
 */
function expenseDebitAccountName(
    expense: ExpenseRow,
    fundingDestinations: Map<number, string | null | undefined>,
    investedExpenseIds: ReadonlySet<number>
): string | null | undefined {
    if (!fundingDestinations.has(expense.id)) return expense.paymentMethod;
    return investedExpenseIds.has(expense.id) ? fundingDestinations.get(expense.id) : null;
}

function getBaselineDate(account: PaymentAccount): string {
    return account.balanceBaselineDate || '0000-00-00';
}

function isOnOrAfterBaseline(date: string, account: PaymentAccount): boolean {
    if (account.accountType === 'credit') return true;
    return date >= getBaselineDate(account);
}

export function computeAccountBalances(
    accounts: PaymentAccount[],
    expenses: ExpenseRow[],
    incomes: IncomeRow[],
    investedExpenseIds: ReadonlySet<number> = new Set()
): PaymentAccountWithBalance[] {
    const deltas = new Map<number, { debitDelta: number; creditOwedDelta: number }>();
    for (const account of accounts) {
        deltas.set(account.id, { debitDelta: 0, creditOwedDelta: 0 });
    }

    const accountByName = new Map(
        accounts.map((account) => [account.name.toLowerCase(), account])
    );

    const fundingDestinations = getFundingDestinations(incomes);

    function getAccountByStoredName(stored: string | null | undefined): PaymentAccount | undefined {
        if (!stored) return undefined;
        const resolved = resolvePaymentMethod(stored);
        if (!resolved) return undefined;
        return accountByName.get(resolved.toLowerCase());
    }

    for (const expense of expenses) {
        if (expense.tripLeg === 'fund') continue;
        const account = getAccountByStoredName(
            expenseDebitAccountName(expense, fundingDestinations, investedExpenseIds)
        );
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
            const transferFee = parseTransferFee(income.transferFee);
            const fromDebit = amount + transferFee;
            const fromAccount = getAccountByStoredName(income.fromPaymentMethod);
            const toAccount = getAccountByStoredName(income.paymentMethod);
            if (fromAccount && isOnOrAfterBaseline(income.date, fromAccount)) {
                const fromEntry = deltas.get(fromAccount.id)!;
                if (fromAccount.accountType === 'credit') {
                    fromEntry.creditOwedDelta += fromDebit;
                } else {
                    fromEntry.debitDelta -= fromDebit;
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
            const amountOwed = Math.max(0, account.initialBalance + creditOwedDelta);
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
    incomes: IncomeRow[],
    investedExpenseIds: ReadonlySet<number> = new Set()
): AccountActivityEntry[] {
    const entries: Omit<AccountActivityEntry, 'runningBalance' | 'runningOwed'>[] = [];

    const fundingDestinations = getFundingDestinations(incomes);

    function pushEntry(
        partial: Omit<AccountActivityEntry, 'runningBalance' | 'runningOwed' | 'beforeBaseline'>
    ) {
        entries.push({
            ...partial,
            beforeBaseline: !isOnOrAfterBaseline(partial.date, account),
        });
    }

    for (const expense of expenses) {
        if (expense.tripLeg === 'fund') continue;
        const debitAccount = expenseDebitAccountName(expense, fundingDestinations, investedExpenseIds);
        if (!matchesAccount(debitAccount, account.name)) continue;
        pushEntry({
            id: expense.id,
            date: expense.date,
            type: 'expense',
            description: expense.description,
            category: expense.category,
            amount: parseAmount(expense.amount),
            direction: 'out',
        });
    }

    for (const income of incomes) {
        const amount = parseAmount(income.amount);
        if (income.category === 'Account transfer') {
            const transferFee = parseTransferFee(income.transferFee);
            const fromDebit = amount + transferFee;
            const feeNote =
                transferFee > 0 ? ` (+${transferFee.toFixed(2)} fee)` : '';
            if (matchesAccount(income.paymentMethod, account.name)) {
                pushEntry({
                    id: income.id,
                    date: income.date,
                    type: 'transfer_in',
                    description: (income.description || 'Account transfer') + feeNote,
                    category: income.category,
                    amount,
                    direction: 'in',
                });
            }
            if (matchesAccount(income.fromPaymentMethod, account.name)) {
                pushEntry({
                    id: income.id,
                    date: income.date,
                    type: 'transfer_out',
                    description: (income.description || 'Account transfer') + feeNote,
                    category: income.category,
                    amount: fromDebit,
                    direction: 'out',
                });
            }
            continue;
        }

        if (!matchesAccount(income.paymentMethod, account.name)) continue;
        pushEntry({
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

    let runningDebit = isDebitBalanceType(account.accountType)
        ? account.initialBalance
        : undefined;
    let runningOwed = account.accountType === 'credit' ? account.initialBalance : undefined;

    const chronological = [...entries].sort(
        (a, b) => a.date.localeCompare(b.date) || a.id - b.id
    );
    const runningByKey = new Map<string, { runningBalance?: number; runningOwed?: number }>();

    for (const entry of chronological) {
        if (entry.beforeBaseline) continue;

        if (isDebitBalanceType(account.accountType)) {
            runningDebit =
                (runningDebit ?? account.initialBalance) +
                (entry.direction === 'in' ? entry.amount : -entry.amount);
            runningByKey.set(`${entry.date}:${entry.id}:${entry.type}`, {
                runningBalance: runningDebit,
            });
        } else {
            runningOwed =
                (runningOwed ?? account.initialBalance) +
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
