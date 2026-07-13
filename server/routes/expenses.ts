import { Router } from 'express';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { requireDb } from '../../../AI Agent/src/db/client';
import { expenses } from '../../../AI Agent/src/db/schema';
import {
    addFixedExpense,
    appendExpense,
    deactivateFixedExpenseById,
    deleteExpense,
    getActiveFixedExpenses,
    getSpendingSummary,
    updateExpense,
    updateFixedExpenseById,
} from '../../../AI Agent/src/services/expenseService';
import {
    appendReimbursements,
    deleteInvestmentFundingTransfer,
    getIncomesByExpenseIds,
    getReimbursementsByExpenseIds,
    upsertInvestmentFundingTransfer,
} from '../../../AI Agent/src/services/incomeService';
import { enumerateDates, parseDateRange, parseMonth } from '../dateUtils';
import {
    enrichExpenseTransactions,
    groupExpensesByDateNet,
    groupFixedExpensesByCategory,
} from '../aggregators';
import { loadExpenseCategories } from '../../../AI Agent/src/config/expenseCategories';
import { getSalaryAfterTax } from '../../../AI Agent/src/services/financeSettings';
import { getTelegramUserId } from '../telegramUser';
import {
    isDayOfMonth,
    isNonEmptyString,
    isPositiveNumber,
    isValidDate,
    parseIdParam,
} from '../validation';

const router = Router();

function parseReimbursements(
    value: unknown
): { source: string; amount: number }[] | undefined | 'invalid' {
    if (value == null) return undefined;
    if (!Array.isArray(value)) return 'invalid';
    const items: { source: string; amount: number }[] = [];
    for (const item of value) {
        if (typeof item !== 'object' || item == null) return 'invalid';
        const source = (item as { source?: unknown }).source;
        const amount = (item as { amount?: unknown }).amount;
        if (!isNonEmptyString(source) || !isPositiveNumber(amount)) return 'invalid';
        items.push({ source: source.trim(), amount });
    }
    return items;
}

router.get('/overview', async (req, res) => {
    try {
        const { month, start, end } = parseMonth(req.query.month as string | undefined);
        const [categories, salaryAfterTax] = await Promise.all([
            loadExpenseCategories(),
            getSalaryAfterTax(getTelegramUserId()),
        ]);
        const summary = await getSpendingSummary(undefined, undefined, start, end);
        const fixedRows = await getActiveFixedExpenses();

        const variable = categories.map(({ category, monthlyBudget }) => {
            const spending = summary.breakdown[category] ?? 0;
            return {
                category,
                monthlyBudget,
                spending,
                overBudget: spending > monthlyBudget,
            };
        });

        const fixedRaw = fixedRows.map((row) => ({
            category: row.category,
            amount: row.amount,
        }));
        const fixed = groupFixedExpensesByCategory(fixedRaw);

        const fixExpensesTotal = fixed.reduce((sum, row) => sum + row.amount, 0);
        const budget = variable.reduce((sum, row) => sum + row.monthlyBudget, 0);
        const actualSpend = variable.reduce((sum, row) => sum + row.spending, 0);

        res.json({
            month,
            salaryAfterTax,
            variable,
            fixed,
            totals: {
                fixExpensesTotal,
                amountCanUse: salaryAfterTax - fixExpensesTotal,
                budget,
                actualSpend,
                totalIncome: summary.totalIncome,
                totalReimbursed: summary.totalReimbursed,
                netCashflow: summary.netCashflow,
            },
        });
    } catch (err) {
        console.error('GET /api/expenses/overview', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.get('/daily', async (req, res) => {
    try {
        const { start, end } = parseDateRange(
            req.query.start as string | undefined,
            req.query.end as string | undefined
        );

        const db = requireDb();
        const rows = await db
            .select()
            .from(expenses)
            .where(and(gte(expenses.date, start), lte(expenses.date, end)));

        const expenseIds = rows.map((r) => r.id);
        const reimbursedByExpenseId = await getReimbursementsByExpenseIds(expenseIds);
        const grouped = groupExpensesByDateNet(rows, reimbursedByExpenseId);
        const series = enumerateDates(start, end).map((date) => ({
            date,
            total: grouped[date]?.total ?? 0,
            byCategory: grouped[date]?.byCategory ?? {},
        }));

        res.json({ start, end, series });
    } catch (err) {
        console.error('GET /api/expenses/daily', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.get('/transactions', async (req, res) => {
    try {
        const { month, start, end } = parseMonth(req.query.month as string | undefined);

        const db = requireDb();
        const rows = await db
            .select()
            .from(expenses)
            .where(and(gte(expenses.date, start), lte(expenses.date, end)))
            .orderBy(desc(expenses.date), desc(expenses.id));

        const expenseIds = rows.map((r) => r.id);
        const [reimbursedByExpenseId, incomeRows] = await Promise.all([
            getReimbursementsByExpenseIds(expenseIds),
            getIncomesByExpenseIds(expenseIds),
        ]);
        const reimbursementsByExpenseId = new Map<number, typeof incomeRows>();
        const fundingToByExpenseId = new Map<number, string>();
        for (const income of incomeRows) {
            if (income.expenseId == null) continue;
            if (income.category === 'Account transfer') {
                if (income.paymentMethod) {
                    fundingToByExpenseId.set(income.expenseId, income.paymentMethod);
                }
                continue;
            }
            const list = reimbursementsByExpenseId.get(income.expenseId) || [];
            list.push(income);
            reimbursementsByExpenseId.set(income.expenseId, list);
        }

        res.json({
            month,
            start,
            end,
            entries: enrichExpenseTransactions(
                rows,
                reimbursedByExpenseId,
                reimbursementsByExpenseId,
                fundingToByExpenseId
            ),
        });
    } catch (err) {
        console.error('GET /api/expenses/transactions', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.get('/categories', async (req, res) => {
    try {
        const { start, end } = parseDateRange(
            req.query.start as string | undefined,
            req.query.end as string | undefined
        );

        const summary = await getSpendingSummary(undefined, undefined, start, end);
        res.json({ start, end, ...summary });
    } catch (err) {
        console.error('GET /api/expenses/categories', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.get('/fixed', async (_req, res) => {
    try {
        const entries = await getActiveFixedExpenses();
        res.json({ entries });
    } catch (err) {
        console.error('GET /api/expenses/fixed', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.post('/transactions', async (req, res) => {
    try {
        const body = req.body ?? {};
        if (!isValidDate(body.date)) return res.status(400).json({ error: 'Invalid date' });
        if (!isPositiveNumber(body.amount)) {
            return res.status(400).json({ error: 'Amount must be a positive number' });
        }
        if (!isNonEmptyString(body.category)) {
            return res.status(400).json({ error: 'Invalid category' });
        }
        if (!isNonEmptyString(body.description)) {
            return res.status(400).json({ error: 'Invalid description' });
        }
        const currency =
            body.currency != null && isNonEmptyString(body.currency)
                ? body.currency.trim()
                : 'MYR';

        const reimbursements = parseReimbursements(body.reimbursements);
        if (reimbursements === 'invalid') {
            return res.status(400).json({ error: 'Invalid reimbursements' });
        }

        const paymentMethod =
            body.paymentMethod != null && isNonEmptyString(body.paymentMethod)
                ? body.paymentMethod.trim()
                : null;

        const category = body.category.trim();
        const isInvestment = category.toLowerCase() === 'investment';
        const toInvestmentAccount =
            body.toInvestmentAccount != null && isNonEmptyString(body.toInvestmentAccount)
                ? body.toInvestmentAccount.trim()
                : null;

        if (isInvestment) {
            if (!paymentMethod) {
                return res.status(400).json({ error: 'Investment expenses require a payment method (from account)' });
            }
            if (!toInvestmentAccount) {
                return res.status(400).json({ error: 'Investment expenses require a destination investment account' });
            }
            if (paymentMethod === toInvestmentAccount) {
                return res.status(400).json({ error: 'From and to accounts must be different' });
            }
        }

        const expenseId = await appendExpense(
            body.date,
            body.amount,
            currency,
            category,
            body.description.trim(),
            paymentMethod
        );

        if (reimbursements?.length) {
            await appendReimbursements(expenseId, reimbursements, body.date);
        }

        if (isInvestment && paymentMethod && toInvestmentAccount) {
            await upsertInvestmentFundingTransfer({
                expenseId,
                date: body.date,
                amount: body.amount,
                description: body.description.trim(),
                fromPaymentMethod: paymentMethod,
                toInvestmentAccount,
            });
        }

        res.json({ ok: true, id: expenseId });
    } catch (err) {
        console.error('POST /api/expenses/transactions', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.post('/fixed', async (req, res) => {
    try {
        const body = req.body ?? {};
        if (!isNonEmptyString(body.description)) {
            return res.status(400).json({ error: 'Invalid description' });
        }
        if (!isNonEmptyString(body.category)) {
            return res.status(400).json({ error: 'Invalid category' });
        }
        if (!isPositiveNumber(body.amount)) {
            return res.status(400).json({ error: 'Amount must be a positive number' });
        }
        if (!isDayOfMonth(body.dayOfMonth)) {
            return res.status(400).json({ error: 'Day of month must be 1–31' });
        }
        if (
            !isPositiveNumber(body.frequencyMonths) ||
            !Number.isInteger(body.frequencyMonths)
        ) {
            return res.status(400).json({ error: 'Frequency must be a positive integer' });
        }
        const startMonth =
            body.startMonth != null && Number.isInteger(body.startMonth) && body.startMonth >= 1 && body.startMonth <= 12
                ? body.startMonth
                : new Date().getMonth() + 1;
        const currency =
            body.currency != null && isNonEmptyString(body.currency)
                ? body.currency.trim()
                : 'MYR';
        const paymentMethod =
            body.paymentMethod != null && isNonEmptyString(body.paymentMethod)
                ? body.paymentMethod.trim()
                : null;
        const category = body.category.trim();
        const isInvestment = category.toLowerCase() === 'investment';
        const toInvestmentAccount =
            body.toInvestmentAccount != null && isNonEmptyString(body.toInvestmentAccount)
                ? body.toInvestmentAccount.trim()
                : null;

        if (isInvestment) {
            if (!paymentMethod) {
                return res.status(400).json({
                    error: 'Investment fixed expenses require a payment method (from account)',
                });
            }
            if (!toInvestmentAccount) {
                return res.status(400).json({
                    error: 'Investment fixed expenses require a destination investment account',
                });
            }
            if (paymentMethod === toInvestmentAccount) {
                return res.status(400).json({ error: 'From and to accounts must be different' });
            }
        }

        await addFixedExpense(
            body.dayOfMonth,
            body.amount,
            currency,
            category,
            body.description.trim(),
            body.frequencyMonths,
            startMonth,
            paymentMethod,
            isInvestment ? toInvestmentAccount : null
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('POST /api/expenses/fixed', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.patch('/transactions/:id', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });

        const body = req.body ?? {};
        const fields: {
            date?: string;
            amount?: number;
            currency?: string;
            category?: string;
            description?: string;
            paymentMethod?: string | null;
        } = {};

        if (body.date != null) {
            if (!isValidDate(body.date)) return res.status(400).json({ error: 'Invalid date' });
            fields.date = body.date;
        }
        if (body.amount != null) {
            if (!isPositiveNumber(body.amount)) {
                return res.status(400).json({ error: 'Amount must be a positive number' });
            }
            fields.amount = body.amount;
        }
        if (body.currency != null) {
            if (!isNonEmptyString(body.currency)) {
                return res.status(400).json({ error: 'Invalid currency' });
            }
            fields.currency = body.currency.trim();
        }
        if (body.category != null) {
            if (!isNonEmptyString(body.category)) {
                return res.status(400).json({ error: 'Invalid category' });
            }
            fields.category = body.category.trim();
        }
        if (body.description != null) {
            if (!isNonEmptyString(body.description)) {
                return res.status(400).json({ error: 'Invalid description' });
            }
            fields.description = body.description.trim();
        }
        if (body.paymentMethod !== undefined) {
            if (body.paymentMethod === null || body.paymentMethod === '') {
                fields.paymentMethod = null;
            } else if (isNonEmptyString(body.paymentMethod)) {
                fields.paymentMethod = body.paymentMethod.trim();
            } else {
                return res.status(400).json({ error: 'Invalid payment method' });
            }
        }

        if (Object.keys(fields).length === 0 && body.toInvestmentAccount === undefined) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        if (Object.keys(fields).length > 0) {
            const ok = await updateExpense(id, fields);
            if (!ok) return res.status(404).json({ error: 'Expense not found' });
        }

        const db = requireDb();
        const [updated] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
        if (!updated) return res.status(404).json({ error: 'Expense not found' });

        const category = updated.category;
        const isInvestment = category.toLowerCase() === 'investment';
        const paymentMethod = updated.paymentMethod;
        const amount = parseFloat(updated.amount);

        if (isInvestment) {
            const toInvestmentAccount =
                body.toInvestmentAccount != null && isNonEmptyString(body.toInvestmentAccount)
                    ? body.toInvestmentAccount.trim()
                    : null;
            if (!paymentMethod) {
                return res.status(400).json({ error: 'Investment expenses require a payment method (from account)' });
            }
            if (!toInvestmentAccount) {
                return res.status(400).json({ error: 'Investment expenses require a destination investment account' });
            }
            if (paymentMethod === toInvestmentAccount) {
                return res.status(400).json({ error: 'From and to accounts must be different' });
            }
            await upsertInvestmentFundingTransfer({
                expenseId: id,
                date: updated.date,
                amount,
                description: updated.description,
                fromPaymentMethod: paymentMethod,
                toInvestmentAccount,
            });
        } else if (body.category != null || body.toInvestmentAccount === null) {
            await deleteInvestmentFundingTransfer(id);
        }

        res.json({ ok: true });
    } catch (err) {
        console.error('PATCH /api/expenses/transactions/:id', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.delete('/transactions/:id', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });

        const ok = await deleteExpense(id);
        if (!ok) return res.status(404).json({ error: 'Expense not found' });
        res.json({ ok: true });
    } catch (err) {
        console.error('DELETE /api/expenses/transactions/:id', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.patch('/fixed/:id', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });

        const body = req.body ?? {};
        const fields: {
            description?: string;
            category?: string;
            amount?: number;
            dayOfMonth?: number;
            frequencyMonths?: number;
            paymentMethod?: string | null;
            toInvestmentAccount?: string | null;
        } = {};

        if (body.description != null) {
            if (!isNonEmptyString(body.description)) {
                return res.status(400).json({ error: 'Invalid description' });
            }
            fields.description = body.description.trim();
        }
        if (body.category != null) {
            if (!isNonEmptyString(body.category)) {
                return res.status(400).json({ error: 'Invalid category' });
            }
            fields.category = body.category.trim();
        }
        if (body.amount != null) {
            if (!isPositiveNumber(body.amount)) {
                return res.status(400).json({ error: 'Amount must be a positive number' });
            }
            fields.amount = body.amount;
        }
        if (body.dayOfMonth != null) {
            if (!isDayOfMonth(body.dayOfMonth)) {
                return res.status(400).json({ error: 'Day of month must be 1–31' });
            }
            fields.dayOfMonth = body.dayOfMonth;
        }
        if (body.frequencyMonths != null) {
            if (!isPositiveNumber(body.frequencyMonths) || !Number.isInteger(body.frequencyMonths)) {
                return res.status(400).json({ error: 'Frequency must be a positive integer' });
            }
            fields.frequencyMonths = body.frequencyMonths;
        }
        if (body.paymentMethod !== undefined) {
            if (body.paymentMethod === null || body.paymentMethod === '') {
                fields.paymentMethod = null;
            } else if (isNonEmptyString(body.paymentMethod)) {
                fields.paymentMethod = body.paymentMethod.trim();
            } else {
                return res.status(400).json({ error: 'Invalid payment method' });
            }
        }
        if (body.toInvestmentAccount !== undefined) {
            if (body.toInvestmentAccount === null || body.toInvestmentAccount === '') {
                fields.toInvestmentAccount = null;
            } else if (isNonEmptyString(body.toInvestmentAccount)) {
                fields.toInvestmentAccount = body.toInvestmentAccount.trim();
            } else {
                return res.status(400).json({ error: 'Invalid investment account' });
            }
        }

        const existing = (await getActiveFixedExpenses()).find((row) => row.id === id);
        if (!existing && Object.keys(fields).length === 0) {
            return res.status(404).json({ error: 'Fixed expense not found' });
        }

        const nextCategory = fields.category ?? existing?.category ?? '';
        const isInvestment = nextCategory.toLowerCase() === 'investment';

        if (isInvestment) {
            const paymentMethod =
                fields.paymentMethod !== undefined
                    ? fields.paymentMethod
                    : (existing?.paymentMethod ?? null);
            const toInvestmentAccount =
                fields.toInvestmentAccount !== undefined
                    ? fields.toInvestmentAccount
                    : (existing?.toInvestmentAccount ?? null);
            if (!paymentMethod) {
                return res.status(400).json({
                    error: 'Investment fixed expenses require a payment method (from account)',
                });
            }
            if (!toInvestmentAccount) {
                return res.status(400).json({
                    error: 'Investment fixed expenses require a destination investment account',
                });
            }
            if (paymentMethod === toInvestmentAccount) {
                return res.status(400).json({ error: 'From and to accounts must be different' });
            }
            fields.toInvestmentAccount = toInvestmentAccount;
        } else if (fields.category != null) {
            fields.toInvestmentAccount = null;
        }

        if (Object.keys(fields).length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const ok = await updateFixedExpenseById(id, fields);
        if (!ok) return res.status(404).json({ error: 'Fixed expense not found' });
        res.json({ ok: true });
    } catch (err) {
        console.error('PATCH /api/expenses/fixed/:id', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.delete('/fixed/:id', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });

        const ok = await deactivateFixedExpenseById(id);
        if (!ok) return res.status(404).json({ error: 'Fixed expense not found' });
        res.json({ ok: true });
    } catch (err) {
        console.error('DELETE /api/expenses/fixed/:id', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

export default router;
