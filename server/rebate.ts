import { resolvePaymentMethod } from '../../AI Agent/src/config/paymentMethods';
import type {
    PaymentAccount,
    RebateConfig,
    RebateCategoryDef,
    SimpleRebateConfig,
    TieredRebateConfig,
} from '../../AI Agent/src/services/paymentAccountService';
import {
    getPaymentAccountById,
    isSimpleRebateConfig,
    isTieredRebateConfig,
    listActivePaymentAccounts,
} from '../../AI Agent/src/services/paymentAccountService';
import { upsertRebateIncomes } from '../../AI Agent/src/services/incomeService';
import { requireDb } from '../../AI Agent/src/db/client';
import { expenses, incomes } from '../../AI Agent/src/db/schema';
import type { ExpenseRow } from './accountBalances';
import { accountPeriodToDateRange, isDateInRange } from './statementPeriod';
import { parseMonth } from './dateUtils';

export type RebateCategoryResult = {
    category: string;
    spend: number;
    rate: number;
    earned: number;
    cap: number | null;
    remaining: number | null;
    fullyClaimed: boolean;
    requirementMet: boolean;
    requirementNote?: string;
    isDefault?: boolean;
};

export type RebateEligibleExpense = {
    id: number;
    date: string;
    description: string;
    category: string;
    rebateCategory: string;
    amount: number;
};

export type RebateSummary = {
    month: string;
    periodStart: string;
    periodEnd: string;
    ruleType: 'simple' | 'tiered';
    totalSpend: number;
    minSpendThreshold?: number;
    minSpendMet?: boolean;
    rate?: number;
    activeTier?: { minTotalSpend: number; label: string } | null;
    categories: RebateCategoryResult[];
    totalEarned: number;
    eligibleExpenses: RebateEligibleExpense[];
};

function parseAmount(value: string): number {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
}

function roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
}

function matchesAccount(stored: string | null | undefined, accountName: string): boolean {
    if (!stored) return false;
    return resolvePaymentMethod(stored) === accountName;
}

async function getFundedExpenseIds(): Promise<Set<number>> {
    const db = requireDb();
    const incomeRows = await db.select().from(incomes);
    const funded = new Set<number>();
    for (const income of incomeRows) {
        if (income.category === 'Account transfer' && income.expenseId != null) {
            funded.add(income.expenseId);
        }
    }
    return funded;
}

function filterPeriodExpenses(
    account: PaymentAccount,
    expenseRows: ExpenseRow[],
    month: string,
    fundedExpenseIds: Set<number>
): { start: string; end: string; periodExpenses: ExpenseRow[] } {
    const { start, end } = accountPeriodToDateRange(account, month);
    const periodExpenses = expenseRows.filter(
        (expense) =>
            !fundedExpenseIds.has(expense.id) &&
            matchesAccount(expense.paymentMethod, account.name) &&
            isDateInRange(expense.date, { start, end })
    );
    return { start, end, periodExpenses };
}

function buildEligibleExpenses(
    periodExpenses: ExpenseRow[],
    config: RebateConfig
): RebateEligibleExpense[] {
    return periodExpenses
        .map((expense) => {
            const rebateCategory = resolveRebateCategory(expense, config);
            if (!rebateCategory) return null;
            return {
                id: expense.id,
                date: expense.date,
                description: expense.description,
                category: expense.category,
                rebateCategory,
                amount: roundMoney(parseAmount(expense.amount)),
            };
        })
        .filter((e): e is RebateEligibleExpense => e != null)
        .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

function getDefaultCategoryName(config: RebateConfig): string | null {
    const cats =
        config.ruleType === 'tiered'
            ? config.categories
            : config.categories && config.categories.length > 0
              ? config.categories
              : config.rebateCategories.map((name) => ({ name, isDefault: false as boolean | undefined }));
    const found = cats.find((c) => c.isDefault);
    return found?.name ?? null;
}

function applyCap(rawEarned: number, cap: number | null): {
    earned: number;
    remaining: number | null;
    fullyClaimed: boolean;
} {
    if (cap == null) {
        return { earned: roundMoney(rawEarned), remaining: null, fullyClaimed: false };
    }
    const earned = roundMoney(Math.min(rawEarned, cap));
    return {
        earned,
        remaining: roundMoney(Math.max(0, cap - earned)),
        fullyClaimed: earned >= cap,
    };
}

function resolveRebateCategory(expense: ExpenseRow, config: RebateConfig): string | null {
    const descriptionRules = config.descriptionRules ?? [];
    const descLower = expense.description.toLowerCase();
    for (const rule of descriptionRules) {
        if (rule.expenseCategory && rule.expenseCategory !== expense.category) continue;
        if (rule.keywords.some((kw) => descLower.includes(kw.toLowerCase()))) {
            return rule.rebateCategory;
        }
    }
    const mapped = config.categoryMappings[expense.category];
    if (mapped) return mapped;
    return getDefaultCategoryName(config);
}

function computeSimpleRebate(
    account: PaymentAccount,
    config: SimpleRebateConfig,
    expenseRows: ExpenseRow[],
    month: string,
    fundedExpenseIds: Set<number>
): RebateSummary {
    const { start, end, periodExpenses } = filterPeriodExpenses(
        account,
        expenseRows,
        month,
        fundedExpenseIds
    );

    const totalSpend = periodExpenses.reduce((sum, e) => sum + parseAmount(e.amount), 0);
    const minSpendMet = totalSpend >= config.minSpendThreshold;
    const baseRate = minSpendMet ? config.highRate : config.lowRate;

    const spendByRebateCategory = new Map<string, number>();
    const categoryDefs: Array<{
        name: string;
        cap: number | null;
        isDefault?: boolean;
        fixedRate?: number;
    }> =
        config.categories && config.categories.length > 0
            ? config.categories
            : config.rebateCategories.map((name) => ({ name, cap: config.categoryCap as number | null }));

    for (const cat of categoryDefs) {
        spendByRebateCategory.set(cat.name, 0);
    }

    for (const expense of periodExpenses) {
        const rebateCategory = resolveRebateCategory(expense, config);
        if (!rebateCategory) continue;
        if (!spendByRebateCategory.has(rebateCategory)) continue;
        spendByRebateCategory.set(
            rebateCategory,
            (spendByRebateCategory.get(rebateCategory) ?? 0) + parseAmount(expense.amount)
        );
    }

    const categories: RebateCategoryResult[] = categoryDefs.map((catDef) => {
        const spend = spendByRebateCategory.get(catDef.name) ?? 0;
        const rate = catDef.fixedRate != null ? catDef.fixedRate : baseRate;
        const rawEarned = spend * rate;
        const { earned, remaining, fullyClaimed } = applyCap(rawEarned, catDef.cap);
        return {
            category: catDef.name,
            spend: roundMoney(spend),
            rate,
            earned,
            cap: catDef.cap,
            remaining,
            fullyClaimed,
            requirementMet: true,
            isDefault: catDef.isDefault === true,
        };
    });

    return {
        month,
        periodStart: start,
        periodEnd: end,
        ruleType: 'simple',
        totalSpend: roundMoney(totalSpend),
        minSpendThreshold: config.minSpendThreshold,
        minSpendMet,
        rate: baseRate,
        categories,
        totalEarned: roundMoney(categories.reduce((sum, c) => sum + c.earned, 0)),
        eligibleExpenses: buildEligibleExpenses(periodExpenses, config),
    };
}

function checkTieredRequirements(
    catDef: RebateCategoryDef,
    spendByExpenseCategory: Map<string, number>,
    totalCategorySpend: number
): { met: boolean; note?: string } {
    if (catDef.minSpendPerMapping != null) {
        const mappedExpenseCats = [...spendByExpenseCategory.keys()];
        if (mappedExpenseCats.length === 0) {
            return { met: false, note: 'No mapped spend' };
        }
        for (const expenseCat of mappedExpenseCats) {
            const subSpend = spendByExpenseCategory.get(expenseCat) ?? 0;
            if (subSpend < catDef.minSpendPerMapping) {
                return {
                    met: false,
                    note: `Need RM${catDef.minSpendPerMapping} in ${expenseCat} (have RM${roundMoney(subSpend)})`,
                };
            }
        }
    }
    if (catDef.minTotalSpend != null && totalCategorySpend < catDef.minTotalSpend) {
        return {
            met: false,
            note: `Need RM${catDef.minTotalSpend} total (have RM${roundMoney(totalCategorySpend)})`,
        };
    }
    return { met: true };
}

function formatTierLabel(minTotalSpend: number, tiers: TieredRebateConfig['tiers']): string {
    const sorted = [...tiers].sort((a, b) => b.minTotalSpend - a.minTotalSpend);
    const idx = sorted.findIndex((t) => t.minTotalSpend === minTotalSpend);
    if (idx < 0) return `RM${minTotalSpend.toLocaleString()}+ tier`;
    const nextHigher = sorted[idx - 1];
    if (nextHigher) {
        return `RM${minTotalSpend.toLocaleString()}–RM${(nextHigher.minTotalSpend - 0.01).toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} tier`;
    }
    return `RM${minTotalSpend.toLocaleString()}+ tier`;
}

function computeTieredRebate(
    account: PaymentAccount,
    config: TieredRebateConfig,
    expenseRows: ExpenseRow[],
    month: string,
    fundedExpenseIds: Set<number>
): RebateSummary {
    const { start, end, periodExpenses } = filterPeriodExpenses(
        account,
        expenseRows,
        month,
        fundedExpenseIds
    );

    const totalSpend = periodExpenses.reduce((sum, e) => sum + parseAmount(e.amount), 0);
    const sortedTiers = [...config.tiers].sort((a, b) => b.minTotalSpend - a.minTotalSpend);
    const activeTierDef = sortedTiers.find((t) => totalSpend >= t.minTotalSpend) ?? null;

    const spendByRebateCategory = new Map<string, number>();
    const spendByRebateAndExpense = new Map<string, Map<string, number>>();

    for (const cat of config.categories) {
        spendByRebateCategory.set(cat.name, 0);
        spendByRebateAndExpense.set(cat.name, new Map());
    }

    for (const expense of periodExpenses) {
        const rebateCategory = resolveRebateCategory(expense, config);
        if (!rebateCategory) continue;
        const amount = parseAmount(expense.amount);
        spendByRebateCategory.set(
            rebateCategory,
            (spendByRebateCategory.get(rebateCategory) ?? 0) + amount
        );
        const subMap = spendByRebateAndExpense.get(rebateCategory) ?? new Map<string, number>();
        subMap.set(expense.category, (subMap.get(expense.category) ?? 0) + amount);
        spendByRebateAndExpense.set(rebateCategory, subMap);
    }

    const categories: RebateCategoryResult[] = config.categories.map((catDef) => {
        const spend = spendByRebateCategory.get(catDef.name) ?? 0;
        const rate =
            catDef.fixedRate != null ? catDef.fixedRate : (activeTierDef?.rates[catDef.name] ?? 0);
        const subMap = spendByRebateAndExpense.get(catDef.name) ?? new Map();
        const { met, note } = checkTieredRequirements(catDef, subMap, spend);
        const rawEarned = met ? spend * rate : 0;
        const { earned, remaining, fullyClaimed } = applyCap(rawEarned, catDef.cap);
        return {
            category: catDef.name,
            spend: roundMoney(spend),
            rate,
            earned,
            cap: catDef.cap,
            remaining,
            fullyClaimed,
            requirementMet: met,
            requirementNote: met ? undefined : note,
            isDefault: catDef.isDefault === true,
        };
    });

    return {
        month,
        periodStart: start,
        periodEnd: end,
        ruleType: 'tiered',
        totalSpend: roundMoney(totalSpend),
        activeTier: activeTierDef
            ? {
                  minTotalSpend: activeTierDef.minTotalSpend,
                  label: formatTierLabel(activeTierDef.minTotalSpend, config.tiers),
              }
            : null,
        categories,
        totalEarned: roundMoney(categories.reduce((sum, c) => sum + c.earned, 0)),
        eligibleExpenses: buildEligibleExpenses(periodExpenses, config),
    };
}

export function computeRebate(
    account: PaymentAccount,
    config: RebateConfig,
    expenseRows: ExpenseRow[],
    month: string,
    fundedExpenseIds: Set<number>
): RebateSummary {
    if (isTieredRebateConfig(config)) {
        return computeTieredRebate(account, config, expenseRows, month, fundedExpenseIds);
    }
    return computeSimpleRebate(account, config, expenseRows, month, fundedExpenseIds);
}

export async function computeAndSyncRebate(
    accountId: number,
    month?: string
): Promise<RebateSummary | null> {
    const account = await getPaymentAccountById(accountId);
    if (!account || account.accountType !== 'credit' || !account.rebateConfig?.enabled) {
        return null;
    }

    const resolvedMonth = month && /^\d{4}-\d{2}$/.test(month) ? month : parseMonth().month;
    const config = account.rebateConfig;

    const db = requireDb();
    const expenseRows = await db.select().from(expenses);
    const fundedExpenseIds = await getFundedExpenseIds();

    const summary = computeRebate(account, config, expenseRows, resolvedMonth, fundedExpenseIds);

    await upsertRebateIncomes(
        account.id,
        account.name,
        resolvedMonth,
        summary.periodEnd,
        summary.categories.map((c) => ({ category: c.category, earned: c.earned }))
    );

    return summary;
}

export async function syncRebateForPaymentMethod(
    paymentMethod: string | null | undefined,
    month?: string
): Promise<void> {
    if (!paymentMethod) return;

    const resolved = resolvePaymentMethod(paymentMethod);
    if (!resolved) return;

    const accounts = await listActivePaymentAccounts();
    const account = accounts.find(
        (a) => a.name.toLowerCase() === resolved.toLowerCase() && a.accountType === 'credit'
    );
    if (!account?.rebateConfig?.enabled) return;

    try {
        await computeAndSyncRebate(account.id, month);
    } catch (err) {
        console.error('syncRebateForPaymentMethod', err);
    }
}
