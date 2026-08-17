import { Router } from 'express';
import { desc } from 'drizzle-orm';
import { requireDb } from '../../agent/db/client';
import { expenses, incomes } from '../../agent/db/schema';
import {
    accrueFdInterest,
    createInstrument,
    deactivateInstrument,
    getInstrumentById,
    getPortfolioSummary,
    isValidInstrumentKind,
    recordBuy,
    recordDividend,
    recordInterest,
    recordPriceMark,
    recordSell,
    updateInstrument,
} from '../../agent/services/investmentPortfolioService';
import { getPaymentAccountById } from '../../agent/services/paymentAccountService';
import { computeAccountBalances } from '../accountBalances';
import { isNonEmptyString, isPositiveNumber, isValidDate, parseIdParam } from '../validation';

const router = Router();

function isNonNegativeNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function parseOptionalFee(value: unknown): number | undefined | 'invalid' {
    if (value == null || value === '') return undefined;
    if (!isNonNegativeNumber(value)) return 'invalid';
    return value;
}

async function loadCashBalance(accountId: number): Promise<number> {
    const account = await getPaymentAccountById(accountId);
    if (!account) throw new Error('Account not found');
    const db = requireDb();
    const [expenseRows, incomeRows] = await Promise.all([
        db.select().from(expenses).orderBy(desc(expenses.date), desc(expenses.id)),
        db.select().from(incomes).orderBy(desc(incomes.date), desc(incomes.id)),
    ]);
    const [withBalance] = computeAccountBalances([account], expenseRows, incomeRows);
    return withBalance.balance ?? 0;
}

router.get('/accounts/:accountId/portfolio', async (req, res) => {
    try {
        const accountId = parseIdParam(req.params.accountId);
        if (!accountId) return res.status(400).json({ error: 'Invalid account id' });

        const [summary, cashBalance] = await Promise.all([
            getPortfolioSummary(accountId),
            loadCashBalance(accountId),
        ]);
        const account = await getPaymentAccountById(accountId);
        const fdLocked =
            Math.round(
                summary.holdings
                    .filter((h) => h.instrument.kind === 'fd')
                    .reduce((sum, h) => sum + (h.instrument.principal ?? 0), 0) * 100
            ) / 100;
        const available = Math.round((cashBalance - fdLocked) * 100) / 100;
        const nav =
            account?.accountType === 'account'
                ? cashBalance
                : Math.round((cashBalance + summary.totalMarketValue) * 100) / 100;

        res.json({
            ...summary,
            cashBalance,
            nav,
            fdLocked,
            available,
        });
    } catch (err) {
        console.error('GET /api/investments/accounts/:accountId/portfolio', err);
        const message = err instanceof Error ? err.message : 'Server error';
        const status =
            message.includes('not found') || message.includes('only available') ? 404 : 500;
        res.status(status).json({ error: message });
    }
});

router.post('/instruments', async (req, res) => {
    try {
        const body = req.body ?? {};
        const paymentAccountId =
            typeof body.paymentAccountId === 'number'
                ? body.paymentAccountId
                : parseIdParam(String(body.paymentAccountId ?? ''));
        if (!paymentAccountId) {
            return res.status(400).json({ error: 'paymentAccountId is required' });
        }
        if (!isValidInstrumentKind(body.kind)) {
            return res.status(400).json({ error: 'Invalid instrument kind' });
        }
        if (!isNonEmptyString(body.name)) {
            return res.status(400).json({ error: 'name is required' });
        }

        let tenureMonths: number | null = null;
        if (body.tenureMonths != null) {
            if (!Number.isInteger(body.tenureMonths) || body.tenureMonths <= 0) {
                return res.status(400).json({ error: 'tenureMonths must be a positive integer' });
            }
            tenureMonths = body.tenureMonths;
        }

        const cashBalance = body.kind === 'fd' ? await loadCashBalance(paymentAccountId) : undefined;

        const id = await createInstrument({
            paymentAccountId,
            kind: body.kind,
            name: body.name,
            symbol: body.symbol ?? null,
            currency: typeof body.currency === 'string' ? body.currency : 'MYR',
            lastPrice: body.lastPrice != null ? body.lastPrice : null,
            principal: body.principal != null ? body.principal : null,
            annualRatePct: body.annualRatePct != null ? body.annualRatePct : null,
            startDate: body.startDate ?? null,
            maturityDate: body.maturityDate ?? null,
            tenureMonths,
            cashBalance,
        });
        res.status(201).json({ ok: true, id });
    } catch (err) {
        console.error('POST /api/investments/instruments', err);
        const message = err instanceof Error ? err.message : 'Server error';
        const status =
            message.includes('required') ||
            message.includes('Invalid') ||
            message.includes('exceeds') ||
            message.includes('only available') ||
            message.includes('not found')
                ? message.includes('not found')
                    ? 404
                    : 400
                : 500;
        res.status(status).json({ error: message });
    }
});

router.patch('/instruments/:id', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });
        const body = req.body ?? {};
        await updateInstrument(id, {
            name: body.name,
            symbol: body.symbol,
            lastPrice: body.lastPrice,
            principal: body.principal,
            annualRatePct: body.annualRatePct,
            startDate: body.startDate,
            maturityDate: body.maturityDate,
            active: body.active,
        });
        res.json({ ok: true });
    } catch (err) {
        console.error('PATCH /api/investments/instruments/:id', err);
        const message = err instanceof Error ? err.message : 'Server error';
        const status = message.includes('not found')
            ? 404
            : message.includes('required') || message.includes('Invalid')
              ? 400
              : 500;
        res.status(status).json({ error: message });
    }
});

router.delete('/instruments/:id', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });
        await deactivateInstrument(id);
        res.json({ ok: true });
    } catch (err) {
        console.error('DELETE /api/investments/instruments/:id', err);
        const message = err instanceof Error ? err.message : 'Server error';
        res.status(message.includes('not found') ? 404 : 500).json({ error: message });
    }
});

router.post('/events/buy', async (req, res) => {
    try {
        const body = req.body ?? {};
        const instrumentId =
            typeof body.instrumentId === 'number'
                ? body.instrumentId
                : parseIdParam(String(body.instrumentId ?? ''));
        if (!instrumentId) return res.status(400).json({ error: 'instrumentId is required' });
        if (!isValidDate(body.date)) return res.status(400).json({ error: 'Invalid date' });
        if (!isPositiveNumber(body.quantity)) {
            return res.status(400).json({ error: 'quantity must be positive' });
        }
        if (!isNonNegativeNumber(body.unitPrice)) {
            return res.status(400).json({ error: 'unitPrice must be a non-negative number' });
        }
        const fee = parseOptionalFee(body.fee);
        if (fee === 'invalid') {
            return res.status(400).json({ error: 'fee must be a non-negative number' });
        }

        const result = await recordBuy({
            instrumentId,
            date: body.date,
            quantity: body.quantity,
            unitPrice: body.unitPrice,
            notes: body.notes ?? null,
            fee,
            fromPaymentMethod: body.fromPaymentMethod ?? null,
        });
        res.status(201).json({ ok: true, ...result });
    } catch (err) {
        console.error('POST /api/investments/events/buy', err);
        const message = err instanceof Error ? err.message : 'Server error';
        const status =
            message.includes('not found') || message.includes('FD') || message.includes('must')
                ? 400
                : 500;
        res.status(status).json({ error: message });
    }
});

router.post('/events/sell', async (req, res) => {
    try {
        const body = req.body ?? {};
        const instrumentId =
            typeof body.instrumentId === 'number'
                ? body.instrumentId
                : parseIdParam(String(body.instrumentId ?? ''));
        if (!instrumentId) return res.status(400).json({ error: 'instrumentId is required' });
        if (!isValidDate(body.date)) return res.status(400).json({ error: 'Invalid date' });
        if (!isPositiveNumber(body.quantity)) {
            return res.status(400).json({ error: 'quantity must be positive' });
        }
        if (!isNonNegativeNumber(body.unitPrice)) {
            return res.status(400).json({ error: 'unitPrice must be a non-negative number' });
        }
        const fee = parseOptionalFee(body.fee);
        if (fee === 'invalid') {
            return res.status(400).json({ error: 'fee must be a non-negative number' });
        }

        const result = await recordSell({
            instrumentId,
            date: body.date,
            quantity: body.quantity,
            unitPrice: body.unitPrice,
            notes: body.notes ?? null,
            fee,
            toPaymentMethod: body.toPaymentMethod ?? null,
        });
        res.status(201).json({ ok: true, ...result });
    } catch (err) {
        console.error('POST /api/investments/events/sell', err);
        const message = err instanceof Error ? err.message : 'Server error';
        const status =
            message.includes('Insufficient') ||
            message.includes('not found') ||
            message.includes('FD') ||
            message.includes('must') ||
            message.includes('cannot exceed')
                ? 400
                : 500;
        res.status(status).json({ error: message });
    }
});

router.post('/events/dividend', async (req, res) => {
    try {
        const body = req.body ?? {};
        const instrumentId =
            typeof body.instrumentId === 'number'
                ? body.instrumentId
                : parseIdParam(String(body.instrumentId ?? ''));
        if (!instrumentId) return res.status(400).json({ error: 'instrumentId is required' });
        if (!isValidDate(body.date)) return res.status(400).json({ error: 'Invalid date' });
        if (!isPositiveNumber(body.amount)) {
            return res.status(400).json({ error: 'amount must be positive' });
        }

        const eventId = await recordDividend({
            instrumentId,
            date: body.date,
            amount: body.amount,
            notes: body.notes ?? null,
            toPaymentMethod: body.toPaymentMethod ?? null,
        });
        res.status(201).json({ ok: true, eventId });
    } catch (err) {
        console.error('POST /api/investments/events/dividend', err);
        const message = err instanceof Error ? err.message : 'Server error';
        res.status(message.includes('must') || message.includes('not found') ? 400 : 500).json({
            error: message,
        });
    }
});

router.post('/events/interest', async (req, res) => {
    try {
        const body = req.body ?? {};
        const instrumentId =
            typeof body.instrumentId === 'number'
                ? body.instrumentId
                : parseIdParam(String(body.instrumentId ?? ''));
        if (!instrumentId) return res.status(400).json({ error: 'instrumentId is required' });
        if (!isValidDate(body.date)) return res.status(400).json({ error: 'Invalid date' });
        if (!isPositiveNumber(body.amount)) {
            return res.status(400).json({ error: 'amount must be positive' });
        }

        const eventId = await recordInterest({
            instrumentId,
            date: body.date,
            amount: body.amount,
            notes: body.notes ?? null,
            toPaymentMethod: body.toPaymentMethod ?? null,
            syncCash: body.syncCash !== false,
        });
        res.status(201).json({ ok: true, eventId });
    } catch (err) {
        console.error('POST /api/investments/events/interest', err);
        const message = err instanceof Error ? err.message : 'Server error';
        res.status(message.includes('must') || message.includes('not found') ? 400 : 500).json({
            error: message,
        });
    }
});

router.post('/events/price-mark', async (req, res) => {
    try {
        const body = req.body ?? {};
        const instrumentId =
            typeof body.instrumentId === 'number'
                ? body.instrumentId
                : parseIdParam(String(body.instrumentId ?? ''));
        if (!instrumentId) return res.status(400).json({ error: 'instrumentId is required' });
        if (!isValidDate(body.date)) return res.status(400).json({ error: 'Invalid date' });
        if (!isNonNegativeNumber(body.unitPrice)) {
            return res.status(400).json({ error: 'unitPrice must be a non-negative number' });
        }

        const eventId = await recordPriceMark({
            instrumentId,
            date: body.date,
            unitPrice: body.unitPrice,
            notes: body.notes ?? null,
        });
        res.status(201).json({ ok: true, eventId });
    } catch (err) {
        console.error('POST /api/investments/events/price-mark', err);
        const message = err instanceof Error ? err.message : 'Server error';
        res.status(message.includes('FD') || message.includes('Invalid') || message.includes('not found') ? 400 : 500).json({
            error: message,
        });
    }
});

router.post('/instruments/:id/accrue-fd', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });
        const body = req.body ?? {};
        const toDate = isValidDate(body.toDate) ? body.toDate : null;
        if (!toDate) return res.status(400).json({ error: 'toDate is required (YYYY-MM-DD)' });

        const instrument = await getInstrumentById(id);
        if (!instrument) return res.status(404).json({ error: 'Instrument not found' });

        const result = await accrueFdInterest(id, toDate, {
            amountOverride: body.amountOverride != null ? body.amountOverride : undefined,
            toPaymentMethod: body.toPaymentMethod ?? null,
            syncCash: body.syncCash !== false,
        });
        res.status(201).json({ ok: true, ...result });
    } catch (err) {
        console.error('POST /api/investments/instruments/:id/accrue-fd', err);
        const message = err instanceof Error ? err.message : 'Server error';
        res.status(
            message.includes('FD') ||
                message.includes('missing') ||
                message.includes('Accrue') ||
                message.includes('days') ||
                message.includes('zero') ||
                message.includes('not found')
                ? 400
                : 500
        ).json({ error: message });
    }
});

export default router;
