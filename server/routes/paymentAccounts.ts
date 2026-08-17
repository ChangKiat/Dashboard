import { Router } from 'express';
import { desc } from 'drizzle-orm';
import { loadPaymentAccounts } from '../../agent/config/paymentMethods';
import { requireDb } from '../../agent/db/client';
import { expenses, incomes } from '../../agent/db/schema';
import {
    createPaymentAccount,
    deactivatePaymentAccount,
    getPaymentAccountById,
    isValidPaymentAccountType,
    isValidRebateConfig,
    isValidStatementDay,
    listActivePaymentAccounts,
    normalizePaymentAccountName,
    normalizeRebateConfig,
    updatePaymentAccount,
} from '../../agent/services/paymentAccountService';
import { sumFdLockedByAccount, sumHoldingsByAccount } from '../../agent/services/investmentPortfolioService';
import {
    buildAccountActivity,
    computeAccountBalances,
} from '../accountBalances';
import { parseMonth } from '../dateUtils';
import { computeAccountRebate, computeAndSyncRebate } from '../rebate';
import { isNonEmptyString, parseIdParam } from '../validation';

function applyFdOverlay<T extends { id: number; accountType: string; balance?: number }>(
    entry: T,
    fdLockedByAccount: Map<number, number>
): T {
    if (entry.accountType !== 'account') return entry;
    const fdLocked = fdLockedByAccount.get(entry.id) ?? 0;
    if (fdLocked <= 0) return entry;
    const cash = entry.balance ?? 0;
    return {
        ...entry,
        fdLocked,
        available: Math.round((cash - fdLocked) * 100) / 100,
    };
}

const router = Router();

async function refreshPaymentAccountsCache() {
    await loadPaymentAccounts();
}

function isNonNegativeNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

async function loadAllTransactions() {
    const db = requireDb();
    const [expenseRows, incomeRows] = await Promise.all([
        db.select().from(expenses).orderBy(desc(expenses.date), desc(expenses.id)),
        db.select().from(incomes).orderBy(desc(incomes.date), desc(incomes.id)),
    ]);
    return { expenseRows, incomeRows };
}

router.get('/', async (_req, res) => {
    try {
        const emptyHoldings = {
            marketValue: new Map<number, number>(),
            costBasis: new Map<number, number>(),
            unrealizedGain: new Map<number, number>(),
            names: new Map<number, string[]>(),
            holdings: new Map<number, { id: number; name: string; kind: string }[]>(),
        };
        const [accounts, { expenseRows, incomeRows }, holdings, fdLockedByAccount] =
            await Promise.all([
                listActivePaymentAccounts(),
                loadAllTransactions(),
                sumHoldingsByAccount().catch(() => emptyHoldings),
                sumFdLockedByAccount().catch(() => new Map<number, number>()),
            ]);
        const entries = computeAccountBalances(accounts, expenseRows, incomeRows).map((entry) => {
            if (entry.accountType === 'investment') {
                const holdingsMarketValue = holdings.marketValue.get(entry.id) ?? 0;
                const cash = entry.balance ?? 0;
                return {
                    ...entry,
                    holdingsMarketValue,
                    totalCostBasis: holdings.costBasis.get(entry.id) ?? 0,
                    unrealizedGain: holdings.unrealizedGain.get(entry.id) ?? 0,
                    holdingNames: holdings.names.get(entry.id) ?? [],
                    holdings: holdings.holdings.get(entry.id) ?? [],
                    nav: Math.round((cash + holdingsMarketValue) * 100) / 100,
                };
            }
            return applyFdOverlay(entry, fdLockedByAccount);
        });
        res.json({ entries });
    } catch (err) {
        console.error('GET /api/payment-accounts', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.get('/:id/rebate', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });

        const month =
            typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month)
                ? req.query.month
                : parseMonth().month;

        const summary = await computeAccountRebate(id, month);
        if (!summary) {
            return res.status(404).json({ error: 'Rebate tracking not enabled for this account' });
        }

        res.json(summary);
    } catch (err) {
        console.error('GET /api/payment-accounts/:id/rebate', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.post('/:id/rebate/sync', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });

        const month =
            typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month)
                ? req.query.month
                : parseMonth().month;

        const summary = await computeAndSyncRebate(id, month);
        if (!summary) {
            return res.status(404).json({ error: 'Rebate tracking not enabled for this account' });
        }

        res.json(summary);
    } catch (err) {
        console.error('POST /api/payment-accounts/:id/rebate/sync', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.get('/:id/activity', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });

        const account = await getPaymentAccountById(id);
        if (!account) return res.status(404).json({ error: 'Payment account not found' });

        const { expenseRows, incomeRows } = await loadAllTransactions();
        const [withBalance] = computeAccountBalances([account], expenseRows, incomeRows);
        const entries = buildAccountActivity(account, expenseRows, incomeRows);
        const fdLockedByAccount = await sumFdLockedByAccount().catch(
            () => new Map<number, number>()
        );

        res.json({
            account: applyFdOverlay(withBalance, fdLockedByAccount),
            entries,
        });
    } catch (err) {
        console.error('GET /api/payment-accounts/:id/activity', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.post('/', async (req, res) => {
    try {
        const body = req.body ?? {};
        if (!isNonEmptyString(body.name)) {
            return res.status(400).json({ error: 'Invalid account name' });
        }
        const accountType =
            body.accountType != null && isValidPaymentAccountType(body.accountType)
                ? body.accountType
                : 'account';

        const fields: {
            initialBalance?: number;
            creditLimit?: number | null;
            statementDay?: number | null;
            rebateConfig?: import('../../agent/services/paymentAccountService').RebateConfig | null;
        } = {};
        if (body.initialBalance != null) {
            if (!isNonNegativeNumber(body.initialBalance)) {
                return res.status(400).json({ error: 'initialBalance must be a non-negative number' });
            }
            fields.initialBalance = body.initialBalance;
        }
        if (accountType === 'credit') {
            if (body.creditLimit == null || !isNonNegativeNumber(body.creditLimit)) {
                return res.status(400).json({ error: 'creditLimit is required for credit accounts' });
            }
            fields.creditLimit = body.creditLimit;
            if (body.statementDay != null) {
                if (!isValidStatementDay(body.statementDay)) {
                    return res.status(400).json({ error: 'statementDay must be an integer from 1 to 31' });
                }
                fields.statementDay = body.statementDay;
            }
            if (body.rebateConfig != null) {
                if (!isValidRebateConfig(body.rebateConfig)) {
                    return res.status(400).json({ error: 'Invalid rebateConfig' });
                }
                fields.rebateConfig = normalizeRebateConfig(body.rebateConfig);
            }
        }

        const id = await createPaymentAccount(body.name, accountType, fields);
        await refreshPaymentAccountsCache();
        res.json({ ok: true, id });
    } catch (err) {
        console.error('POST /api/payment-accounts', err);
        const message = err instanceof Error ? err.message : 'Server error';
        if (message.includes('unique') || message.includes('duplicate')) {
            return res.status(400).json({ error: 'An account with this name already exists' });
        }
        res.status(500).json({ error: message });
    }
});

router.patch('/:id', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });

        const body = req.body ?? {};
        const fields: {
            name?: string;
            accountType?: 'account' | 'credit';
            initialBalance?: number;
            creditLimit?: number | null;
            statementDay?: number | null;
            rebateConfig?: import('../../agent/services/paymentAccountService').RebateConfig | null;
            active?: boolean;
        } = {};

        if (body.name != null) {
            if (!isNonEmptyString(body.name)) {
                return res.status(400).json({ error: 'Invalid account name' });
            }
            fields.name = normalizePaymentAccountName(body.name);
        }
        if (body.accountType != null) {
            if (!isValidPaymentAccountType(body.accountType)) {
                return res.status(400).json({ error: 'accountType must be "account" or "credit"' });
            }
            fields.accountType = body.accountType;
        }
        if (body.initialBalance != null) {
            if (!isNonNegativeNumber(body.initialBalance)) {
                return res.status(400).json({ error: 'initialBalance must be a non-negative number' });
            }
            fields.initialBalance = body.initialBalance;
        }
        if (body.creditLimit !== undefined) {
            if (body.creditLimit != null && !isNonNegativeNumber(body.creditLimit)) {
                return res.status(400).json({ error: 'creditLimit must be a non-negative number' });
            }
            fields.creditLimit = body.creditLimit;
        }
        if (body.statementDay !== undefined) {
            if (body.statementDay != null && !isValidStatementDay(body.statementDay)) {
                return res.status(400).json({ error: 'statementDay must be an integer from 1 to 31' });
            }
            fields.statementDay = body.statementDay;
        }
        if (body.rebateConfig !== undefined) {
            if (!isValidRebateConfig(body.rebateConfig)) {
                return res.status(400).json({ error: 'Invalid rebateConfig' });
            }
            fields.rebateConfig = normalizeRebateConfig(body.rebateConfig);
        }
        if (body.active != null) {
            if (typeof body.active !== 'boolean') {
                return res.status(400).json({ error: 'active must be a boolean' });
            }
            fields.active = body.active;
        }

        if (Object.keys(fields).length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const ok = await updatePaymentAccount(id, fields);
        if (!ok) return res.status(404).json({ error: 'Payment account not found' });
        await refreshPaymentAccountsCache();
        res.json({ ok: true });
    } catch (err) {
        console.error('PATCH /api/payment-accounts/:id', err);
        const message = err instanceof Error ? err.message : 'Server error';
        if (message.includes('unique') || message.includes('duplicate')) {
            return res.status(400).json({ error: 'An account with this name already exists' });
        }
        res.status(500).json({ error: message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });

        const ok = await deactivatePaymentAccount(id);
        if (!ok) return res.status(404).json({ error: 'Payment account not found' });
        await refreshPaymentAccountsCache();
        res.json({ ok: true });
    } catch (err) {
        console.error('DELETE /api/payment-accounts/:id', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

export default router;
