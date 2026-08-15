import { Router } from 'express';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { requireDb } from '../../agent/db/client';
import { expenses } from '../../agent/db/schema';
import {
    addFixedExpense,
    appendExpense,
    deactivateFixedExpenseById,
    deleteExpense,
    getActiveFixedExpenses,
    getSpendingSummary,
    updateExpense,
    updateFixedExpenseById,
    type TripLeg,
} from '../../agent/services/expenseService';
import {
    getLatestExchangeRate,
    getTripById,
} from '../../agent/services/tripService';
import {
    appendReimbursements,
    deleteInvestmentFundingTransfer,
    getIncomesByExpenseIds,
    getReimbursementsByExpenseIds,
    upsertInvestmentFundingTransfer,
} from '../../agent/services/incomeService';
import { enumerateDates, parseDateRange, parseMonth } from '../dateUtils';
import {
    enrichExpenseTransactions,
    groupExpensesByDateNet,
    groupFixedExpensesByCategory,
} from '../aggregators';
import { loadExpenseCategories } from '../../agent/config/expenseCategories';
import { getSalaryAfterTax } from '../../agent/services/financeSettings';
import { getTelegramUserId } from '../telegramUser';
import {
    isDayOfMonth,
    isNonEmptyString,
    isNonNegativeNumber,
    isPositiveNumber,
    isValidDate,
    parseIdParam,
} from '../validation';
import {
    parseLoanMethod,
    type FixedExpenseLoanFields,
} from '../../agent/services/loanService';

const router = Router();

/** Investment always requires from→to; Other may optionally create a linked transfer. */
function isInvestmentCategory(category: string): boolean {
    return category.trim().toLowerCase() === 'investment';
}

function isLoanCategory(category: string): boolean {
    return category.trim().toLowerCase() === 'loan';
}

function parseLoanFields(
    body: Record<string, unknown>
): { loan?: FixedExpenseLoanFields | null; error?: string } {
    const hasLoanKeys =
        body.loanMethod !== undefined ||
        body.originalPrincipal !== undefined ||
        body.remainingPrincipal !== undefined ||
        body.annualRatePct !== undefined ||
        body.tenureMonths !== undefined ||
        body.loanStartDate !== undefined;
    if (!hasLoanKeys) return {};

    if (body.loanMethod === null || body.loanMethod === '') {
        return { loan: null };
    }

    const method = parseLoanMethod(typeof body.loanMethod === 'string' ? body.loanMethod : null);
    if (!method) {
        return { error: 'Loan method must be reducing, flat, or included' };
    }

    let loanStartDate: string | null = null;
    if (body.loanStartDate != null && body.loanStartDate !== '') {
        if (!isValidDate(body.loanStartDate)) {
            return { error: 'Invalid loan start date' };
        }
        loanStartDate = body.loanStartDate;
    }

    if (method === 'included') {
        if (!isNonNegativeNumber(body.remainingPrincipal)) {
            return { error: 'Remaining principal must be 0 or more' };
        }
        const remaining = body.remainingPrincipal;
        const original = isPositiveNumber(body.originalPrincipal)
            ? body.originalPrincipal
            : remaining;
        return {
            loan: {
                loanMethod: method,
                originalPrincipal: original,
                remainingPrincipal: remaining,
                annualRatePct: null,
                tenureMonths: null,
                loanStartDate: null,
            },
        };
    }

    if (!isPositiveNumber(body.originalPrincipal)) {
        return { error: 'Original principal must be a positive number' };
    }
    if (!isNonNegativeNumber(body.remainingPrincipal)) {
        return { error: 'Remaining principal must be 0 or more' };
    }
    if (!isNonNegativeNumber(body.annualRatePct)) {
        return { error: 'Annual rate must be 0 or more' };
    }
    if (!isPositiveNumber(body.tenureMonths) || !Number.isInteger(body.tenureMonths)) {
        return { error: 'Tenure must be a positive integer' };
    }

    return {
        loan: {
            loanMethod: method,
            originalPrincipal: body.originalPrincipal,
            remainingPrincipal: body.remainingPrincipal,
            annualRatePct: body.annualRatePct,
            tenureMonths: body.tenureMonths,
            loanStartDate,
        },
    };
}

function isOtherCategory(category: string): boolean {
    return category.trim().toLowerCase() === 'other';
}

/** To-only Other → treat destination as payment method (no transfer). */
function normalizeOtherAccounts(
    paymentMethod: string | null,
    toInvestmentAccount: string | null
): { paymentMethod: string | null; toInvestmentAccount: string | null } {
    if (paymentMethod && toInvestmentAccount) {
        return { paymentMethod, toInvestmentAccount };
    }
    if (paymentMethod) {
        return { paymentMethod, toInvestmentAccount: null };
    }
    if (toInvestmentAccount) {
        return { paymentMethod: toInvestmentAccount, toInvestmentAccount: null };
    }
    return { paymentMethod: null, toInvestmentAccount: null };
}

/** Validate from/to for Investment (required) or Other (optional pair). Returns error message or null. */
function validateFundingAccounts(
    category: string,
    paymentMethod: string | null,
    toInvestmentAccount: string | null,
    kind: 'expense' | 'fixed' = 'expense'
): string | null {
    const label = kind === 'fixed' ? 'fixed expense' : 'expense';
    if (isInvestmentCategory(category)) {
        if (!paymentMethod) {
            return `This ${label} requires a payment method (from account)`;
        }
        if (!toInvestmentAccount) {
            return `This ${label} requires a destination investment account`;
        }
        if (paymentMethod === toInvestmentAccount) {
            return 'From and to accounts must be different';
        }
        return null;
    }
    if (isOtherCategory(category)) {
        if (paymentMethod && toInvestmentAccount && paymentMethod === toInvestmentAccount) {
            return 'From and to accounts must be different';
        }
    }
    return null;
}

function fundingDestination(
    category: string,
    paymentMethod: string | null,
    toInvestmentAccount: string | null
): string | null {
    if (isInvestmentCategory(category)) return toInvestmentAccount;
    if (isOtherCategory(category) && paymentMethod && toInvestmentAccount) {
        return toInvestmentAccount;
    }
    return null;
}

const TRIP_LEGS = new Set(['exchange', 'fund', 'card']);

function parseTripLeg(value: unknown): TripLeg | null | 'invalid' {
    if (value == null || value === '') return null;
    if (typeof value !== 'string' || !TRIP_LEGS.has(value)) return 'invalid';
    return value as TripLeg;
}

function roundMoney(n: number): number {
    return Math.round(n * 100) / 100;
}

/** Resolve MYR amount + FX fields for trip legs. Returns error string or payload. */
async function resolveTripExpenseFields(body: Record<string, unknown>): Promise<
    | { error: string }
    | {
          amount: number;
          paymentMethod: string | null;
          tripId: number;
          tripLeg: TripLeg;
          fxAmount: number;
          fxCurrency: string;
          fxRate: number;
      }
> {
    const tripLeg = parseTripLeg(body.tripLeg);
    if (tripLeg === 'invalid') return { error: 'Invalid trip leg' };
    if (!tripLeg) return { error: 'tripLeg is required for trip expenses' };

    const tripId =
        typeof body.tripId === 'number' && Number.isInteger(body.tripId) && body.tripId > 0
            ? body.tripId
            : null;
    if (!tripId) return { error: 'Invalid tripId' };

    const trip = await getTripById(tripId);
    if (!trip) return { error: 'Trip not found' };

    if (!isPositiveNumber(body.fxAmount)) {
        return { error: 'Foreign amount must be a positive number' };
    }
    const fxAmount = body.fxAmount;
    const fxCurrency = isNonEmptyString(body.fxCurrency)
        ? body.fxCurrency.trim().toUpperCase()
        : trip.tripCurrency;

    if (tripLeg === 'exchange') {
        if (!isPositiveNumber(body.amount)) {
            return { error: 'MYR amount must be a positive number' };
        }
        if (!isNonEmptyString(body.paymentMethod)) {
            return { error: 'Exchange requires a payment method (bank/cash)' };
        }
        const amount = body.amount;
        const fxRate =
            isPositiveNumber(body.fxRate) ? body.fxRate : roundMoney(amount / fxAmount);
        return {
            amount,
            paymentMethod: body.paymentMethod.trim(),
            tripId,
            tripLeg,
            fxAmount,
            fxCurrency,
            fxRate,
        };
    }

    if (tripLeg === 'fund') {
        const rate =
            isPositiveNumber(body.fxRate)
                ? body.fxRate
                : await getLatestExchangeRate(tripId);
        if (rate == null || !(rate > 0)) {
            return { error: 'No exchange rate on this trip yet — add an exchange first' };
        }
        return {
            amount: roundMoney(fxAmount * rate),
            paymentMethod: null,
            tripId,
            tripLeg,
            fxAmount,
            fxCurrency,
            fxRate: rate,
        };
    }

    // card
    if (!isNonEmptyString(body.paymentMethod)) {
        return { error: 'Card spend requires a credit payment method' };
    }
    let amount: number;
    let fxRate: number;
    if (isPositiveNumber(body.amount)) {
        amount = body.amount;
        fxRate = isPositiveNumber(body.fxRate) ? body.fxRate : roundMoney(amount / fxAmount);
    } else if (isPositiveNumber(body.fxRate)) {
        fxRate = body.fxRate;
        amount = roundMoney(fxAmount * fxRate);
    } else {
        return { error: 'Card spend requires MYR amount or FX rate' };
    }
    return {
        amount,
        paymentMethod: body.paymentMethod.trim(),
        tripId,
        tripLeg,
        fxAmount,
        fxCurrency,
        fxRate,
    };
}

function parseReimbursements(
    value: unknown
): { source: string; amount: number; paymentMethod?: string | null }[] | undefined | 'invalid' {
    if (value == null) return undefined;
    if (!Array.isArray(value)) return 'invalid';
    const items: { source: string; amount: number; paymentMethod?: string | null }[] = [];
    for (const item of value) {
        if (typeof item !== 'object' || item == null) return 'invalid';
        const source = (item as { source?: unknown }).source;
        const amount = (item as { amount?: unknown }).amount;
        const paymentMethod = (item as { paymentMethod?: unknown }).paymentMethod;
        if (!isNonEmptyString(source) || !isPositiveNumber(amount)) return 'invalid';
        if (paymentMethod != null && paymentMethod !== '' && !isNonEmptyString(paymentMethod)) {
            return 'invalid';
        }
        items.push({
            source: source.trim(),
            amount,
            paymentMethod:
                paymentMethod != null && isNonEmptyString(paymentMethod)
                    ? paymentMethod.trim()
                    : null,
        });
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
        if (!isNonEmptyString(body.category)) {
            return res.status(400).json({ error: 'Invalid category' });
        }
        if (!isNonEmptyString(body.description)) {
            return res.status(400).json({ error: 'Invalid description' });
        }

        const tripLegHint = parseTripLeg(body.tripLeg);
        if (tripLegHint === 'invalid') {
            return res.status(400).json({ error: 'Invalid trip leg' });
        }

        let amount: number;
        let paymentMethod: string | null;
        let currency = 'MYR';
        let tripFields:
            | {
                  tripId: number;
                  tripLeg: TripLeg;
                  fxAmount: number;
                  fxCurrency: string;
                  fxRate: number;
              }
            | undefined;

        if (tripLegHint) {
            const resolved = await resolveTripExpenseFields(body);
            if ('error' in resolved) {
                return res.status(400).json({ error: resolved.error });
            }
            amount = resolved.amount;
            paymentMethod = resolved.paymentMethod;
            tripFields = {
                tripId: resolved.tripId,
                tripLeg: resolved.tripLeg,
                fxAmount: resolved.fxAmount,
                fxCurrency: resolved.fxCurrency,
                fxRate: resolved.fxRate,
            };
        } else {
            if (!isPositiveNumber(body.amount)) {
                return res.status(400).json({ error: 'Amount must be a positive number' });
            }
            amount = body.amount;
            currency =
                body.currency != null && isNonEmptyString(body.currency)
                    ? body.currency.trim()
                    : 'MYR';
            paymentMethod =
                body.paymentMethod != null && isNonEmptyString(body.paymentMethod)
                    ? body.paymentMethod.trim()
                    : null;
        }

        const reimbursements = parseReimbursements(body.reimbursements);
        if (reimbursements === 'invalid') {
            return res.status(400).json({ error: 'Invalid reimbursements' });
        }

        const category = body.category.trim();
        let toInvestmentAccount =
            body.toInvestmentAccount != null && isNonEmptyString(body.toInvestmentAccount)
                ? body.toInvestmentAccount.trim()
                : null;

        if (!tripLegHint && isOtherCategory(category)) {
            ({ paymentMethod, toInvestmentAccount } = normalizeOtherAccounts(
                paymentMethod,
                toInvestmentAccount
            ));
        }

        if (!tripLegHint) {
            const fundingError = validateFundingAccounts(
                category,
                paymentMethod,
                toInvestmentAccount
            );
            if (fundingError) {
                return res.status(400).json({ error: fundingError });
            }
        }

        const expenseId = await appendExpense(
            body.date,
            amount,
            currency,
            category,
            body.description.trim(),
            paymentMethod,
            tripFields
        );

        if (reimbursements?.length) {
            await appendReimbursements(expenseId, reimbursements, body.date);
        }

        if (!tripLegHint) {
            const destination = fundingDestination(category, paymentMethod, toInvestmentAccount);
            if (paymentMethod && destination) {
                await upsertInvestmentFundingTransfer({
                    expenseId,
                    date: body.date,
                    amount,
                    description: body.description.trim(),
                    fromPaymentMethod: paymentMethod,
                    toInvestmentAccount: destination,
                });
            }
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
        let paymentMethod =
            body.paymentMethod != null && isNonEmptyString(body.paymentMethod)
                ? body.paymentMethod.trim()
                : null;
        const category = body.category.trim();
        let toInvestmentAccount =
            body.toInvestmentAccount != null && isNonEmptyString(body.toInvestmentAccount)
                ? body.toInvestmentAccount.trim()
                : null;

        if (isOtherCategory(category)) {
            ({ paymentMethod, toInvestmentAccount } = normalizeOtherAccounts(
                paymentMethod,
                toInvestmentAccount
            ));
        }

        const fundingError = validateFundingAccounts(
            category,
            paymentMethod,
            toInvestmentAccount,
            'fixed'
        );
        if (fundingError) {
            return res.status(400).json({ error: fundingError });
        }

        const loanParsed = parseLoanFields(body);
        if (loanParsed.error) {
            return res.status(400).json({ error: loanParsed.error });
        }
        if (loanParsed.loan && !isLoanCategory(category)) {
            return res.status(400).json({ error: 'Loan fields are only valid for the Loan category' });
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
            fundingDestination(category, paymentMethod, toInvestmentAccount),
            isLoanCategory(category) ? loanParsed.loan ?? null : null
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

        const db = requireDb();
        const [beforeUpdate] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
        if (!beforeUpdate) return res.status(404).json({ error: 'Expense not found' });

        if (Object.keys(fields).length > 0) {
            const ok = await updateExpense(id, fields);
            if (!ok) return res.status(404).json({ error: 'Expense not found' });
        }

        const [updated] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
        if (!updated) return res.status(404).json({ error: 'Expense not found' });

        const category = updated.category;
        const paymentMethod = updated.paymentMethod;
        const amount = parseFloat(updated.amount);
        const toInvestmentAccount =
            body.toInvestmentAccount != null && isNonEmptyString(body.toInvestmentAccount)
                ? body.toInvestmentAccount.trim()
                : null;

        if (isInvestmentCategory(category)) {
            const fundingError = validateFundingAccounts(
                category,
                paymentMethod,
                toInvestmentAccount
            );
            if (fundingError) {
                return res.status(400).json({ error: fundingError });
            }
            await upsertInvestmentFundingTransfer({
                expenseId: id,
                date: updated.date,
                amount,
                description: updated.description,
                fromPaymentMethod: paymentMethod!,
                toInvestmentAccount: toInvestmentAccount!,
            });
        } else if (isOtherCategory(category)) {
            const rawTo =
                body.toInvestmentAccount != null && isNonEmptyString(body.toInvestmentAccount)
                    ? body.toInvestmentAccount.trim()
                    : null;
            const rawFrom =
                body.paymentMethod !== undefined
                    ? body.paymentMethod === null || body.paymentMethod === ''
                        ? null
                        : isNonEmptyString(body.paymentMethod)
                          ? body.paymentMethod.trim()
                          : paymentMethod
                    : paymentMethod;
            const normalized = normalizeOtherAccounts(rawFrom, rawTo);
            const fundingError = validateFundingAccounts(
                category,
                normalized.paymentMethod,
                normalized.toInvestmentAccount
            );
            if (fundingError) {
                return res.status(400).json({ error: fundingError });
            }
            if (normalized.paymentMethod !== paymentMethod) {
                await updateExpense(id, { paymentMethod: normalized.paymentMethod });
            }
            if (normalized.paymentMethod && normalized.toInvestmentAccount) {
                await upsertInvestmentFundingTransfer({
                    expenseId: id,
                    date: updated.date,
                    amount,
                    description: updated.description,
                    fromPaymentMethod: normalized.paymentMethod,
                    toInvestmentAccount: normalized.toInvestmentAccount,
                });
            } else {
                await deleteInvestmentFundingTransfer(id);
            }
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
            loan?: FixedExpenseLoanFields | null;
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
        const paymentMethod =
            fields.paymentMethod !== undefined
                ? fields.paymentMethod
                : (existing?.paymentMethod ?? null);
        const toInvestmentAccount =
            fields.toInvestmentAccount !== undefined
                ? fields.toInvestmentAccount
                : (existing?.toInvestmentAccount ?? null);

        if (isInvestmentCategory(nextCategory)) {
            const fundingError = validateFundingAccounts(
                nextCategory,
                paymentMethod,
                toInvestmentAccount,
                'fixed'
            );
            if (fundingError) {
                return res.status(400).json({ error: fundingError });
            }
            fields.toInvestmentAccount = toInvestmentAccount;
        } else if (isOtherCategory(nextCategory)) {
            const normalized = normalizeOtherAccounts(paymentMethod, toInvestmentAccount);
            const fundingError = validateFundingAccounts(
                nextCategory,
                normalized.paymentMethod,
                normalized.toInvestmentAccount,
                'fixed'
            );
            if (fundingError) {
                return res.status(400).json({ error: fundingError });
            }
            fields.paymentMethod = normalized.paymentMethod;
            fields.toInvestmentAccount = fundingDestination(
                nextCategory,
                normalized.paymentMethod,
                normalized.toInvestmentAccount
            );
        } else if (fields.category != null) {
            fields.toInvestmentAccount = null;
        }

        const loanParsed = parseLoanFields(body);
        if (loanParsed.error) {
            return res.status(400).json({ error: loanParsed.error });
        }
        if (loanParsed.loan && !isLoanCategory(nextCategory)) {
            return res.status(400).json({ error: 'Loan fields are only valid for the Loan category' });
        }
        if (loanParsed.loan !== undefined) {
            fields.loan = isLoanCategory(nextCategory) ? loanParsed.loan : null;
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
