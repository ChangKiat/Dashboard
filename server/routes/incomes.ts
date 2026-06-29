import { Router } from 'express';
import {
    appendIncome,
    deleteIncome,
    expenseExists,
    listIncomes,
    updateIncome,
} from '../../../AI Agent/src/services/incomeService';
import { enumerateDates, parseDateRange, parseMonth } from '../dateUtils';
import { formatIncomeTransactions, groupIncomesByDate } from '../aggregators';
import {
    isNonEmptyString,
    isPositiveNumber,
    isValidDate,
    parseIdParam,
} from '../validation';

const router = Router();

router.get('/transactions', async (req, res) => {
    try {
        const { month, start, end } = parseMonth(req.query.month as string | undefined);
        const rows = await listIncomes(start, end);

        res.json({
            month,
            start,
            end,
            entries: formatIncomeTransactions(rows),
        });
    } catch (err) {
        console.error('GET /api/incomes/transactions', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.get('/daily', async (req, res) => {
    try {
        const { start, end } = parseDateRange(
            req.query.start as string | undefined,
            req.query.end as string | undefined
        );

        const rows = await listIncomes(start, end);
        const grouped = groupIncomesByDate(rows);
        const series = enumerateDates(start, end).map((date) => ({
            date,
            total: grouped[date]?.total ?? 0,
            byCategory: grouped[date]?.byCategory ?? {},
        }));

        res.json({ start, end, series });
    } catch (err) {
        console.error('GET /api/incomes/daily', err);
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

        let expenseId: number | undefined;
        if (body.expenseId != null) {
            const id = parseIdParam(String(body.expenseId));
            if (!id) return res.status(400).json({ error: 'Invalid expense id' });
            if (!(await expenseExists(id))) {
                return res.status(400).json({ error: 'Expense not found' });
            }
            expenseId = id;
        }

        const currency =
            body.currency != null && isNonEmptyString(body.currency)
                ? body.currency.trim()
                : 'MYR';
        const source =
            body.source != null && isNonEmptyString(body.source) ? body.source.trim() : undefined;

        const id = await appendIncome(
            body.date,
            body.amount,
            currency,
            body.category.trim(),
            body.description.trim(),
            source,
            expenseId
        );
        res.json({ ok: true, id });
    } catch (err) {
        console.error('POST /api/incomes/transactions', err);
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
            source?: string | null;
            expenseId?: number | null;
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
        if (body.source !== undefined) {
            fields.source =
                body.source != null && isNonEmptyString(body.source) ? body.source.trim() : null;
        }
        if (body.expenseId !== undefined) {
            if (body.expenseId === null) {
                fields.expenseId = null;
            } else {
                const expenseId = parseIdParam(String(body.expenseId));
                if (!expenseId) return res.status(400).json({ error: 'Invalid expense id' });
                if (!(await expenseExists(expenseId))) {
                    return res.status(400).json({ error: 'Expense not found' });
                }
                fields.expenseId = expenseId;
            }
        }

        if (Object.keys(fields).length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const ok = await updateIncome(id, fields);
        if (!ok) return res.status(404).json({ error: 'Income not found' });
        res.json({ ok: true });
    } catch (err) {
        console.error('PATCH /api/incomes/transactions/:id', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.delete('/transactions/:id', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });

        const ok = await deleteIncome(id);
        if (!ok) return res.status(404).json({ error: 'Income not found' });
        res.json({ ok: true });
    } catch (err) {
        console.error('DELETE /api/incomes/transactions/:id', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

export default router;
