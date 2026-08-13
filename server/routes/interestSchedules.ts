import { Router } from 'express';
import {
    addInterestSchedule,
    deactivateInterestScheduleById,
    getActiveInterestSchedules,
    updateInterestScheduleById,
    type InterestFrequency,
} from '../../agent/services/interestScheduleService';
import {
    isDayOfMonth,
    isNonEmptyString,
    parseIdParam,
} from '../validation';

const router = Router();

function parseFrequency(value: unknown): InterestFrequency | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'daily' || normalized === 'monthly') return normalized;
    return null;
}

function parseOptionalRate(value: unknown): number | null | undefined {
    if (value === null) return null;
    if (value === undefined) return undefined;
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    return undefined;
}

function parseOptionalFixed(value: unknown): number | null | undefined {
    if (value === null) return null;
    if (value === undefined) return undefined;
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    return undefined;
}

router.get('/', async (_req, res) => {
    try {
        const entries = await getActiveInterestSchedules();
        res.json({ entries });
    } catch (err) {
        console.error('GET /api/interest-schedules', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.post('/', async (req, res) => {
    try {
        const body = req.body ?? {};
        if (!isNonEmptyString(body.paymentMethod)) {
            return res.status(400).json({ error: 'Invalid payment account' });
        }
        if (!isNonEmptyString(body.description)) {
            return res.status(400).json({ error: 'Invalid description' });
        }
        const frequency = parseFrequency(body.frequency);
        if (!frequency) {
            return res.status(400).json({ error: 'Frequency must be daily or monthly' });
        }
        if (frequency === 'monthly' && !isDayOfMonth(body.dayOfMonth)) {
            return res.status(400).json({ error: 'Day of month must be 1–31 for monthly schedules' });
        }

        const annualRatePct = parseOptionalRate(body.annualRatePct);
        const fixedAmount = parseOptionalFixed(body.fixedAmount);
        const hasRate = annualRatePct != null && annualRatePct > 0;
        const hasFixed = fixedAmount != null && fixedAmount > 0;
        if (!hasRate && !hasFixed) {
            return res.status(400).json({ error: 'Set an annual rate and/or fixed amount' });
        }

        const currency =
            body.currency != null && isNonEmptyString(body.currency)
                ? body.currency.trim()
                : 'MYR';

        await addInterestSchedule({
            paymentMethod: body.paymentMethod.trim(),
            frequency,
            dayOfMonth: frequency === 'monthly' ? body.dayOfMonth : null,
            annualRatePct: hasRate ? annualRatePct : null,
            fixedAmount: hasFixed ? fixedAmount : null,
            currency,
            description: body.description.trim(),
        });
        res.json({ ok: true });
    } catch (err) {
        console.error('POST /api/interest-schedules', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.patch('/:id', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });

        const body = req.body ?? {};
        const fields: {
            paymentMethod?: string;
            frequency?: InterestFrequency;
            dayOfMonth?: number | null;
            annualRatePct?: number | null;
            fixedAmount?: number | null;
            currency?: string;
            description?: string;
        } = {};

        if (body.paymentMethod != null) {
            if (!isNonEmptyString(body.paymentMethod)) {
                return res.status(400).json({ error: 'Invalid payment account' });
            }
            fields.paymentMethod = body.paymentMethod.trim();
        }
        if (body.description != null) {
            if (!isNonEmptyString(body.description)) {
                return res.status(400).json({ error: 'Invalid description' });
            }
            fields.description = body.description.trim();
        }
        if (body.frequency != null) {
            const frequency = parseFrequency(body.frequency);
            if (!frequency) {
                return res.status(400).json({ error: 'Frequency must be daily or monthly' });
            }
            fields.frequency = frequency;
        }
        if (body.dayOfMonth !== undefined) {
            if (body.dayOfMonth === null) {
                fields.dayOfMonth = null;
            } else if (isDayOfMonth(body.dayOfMonth)) {
                fields.dayOfMonth = body.dayOfMonth;
            } else {
                return res.status(400).json({ error: 'Day of month must be 1–31' });
            }
        }
        if (body.annualRatePct !== undefined) {
            const rate = parseOptionalRate(body.annualRatePct);
            if (body.annualRatePct !== null && rate === undefined) {
                return res.status(400).json({ error: 'Annual rate must be a positive number' });
            }
            fields.annualRatePct = rate ?? null;
        }
        if (body.fixedAmount !== undefined) {
            const fixed = parseOptionalFixed(body.fixedAmount);
            if (body.fixedAmount !== null && fixed === undefined) {
                return res.status(400).json({ error: 'Fixed amount must be a positive number' });
            }
            fields.fixedAmount = fixed ?? null;
        }
        if (body.currency != null) {
            if (!isNonEmptyString(body.currency)) {
                return res.status(400).json({ error: 'Invalid currency' });
            }
            fields.currency = body.currency.trim();
        }

        const ok = await updateInterestScheduleById(id, fields);
        if (!ok) return res.status(404).json({ error: 'Interest schedule not found' });
        res.json({ ok: true });
    } catch (err) {
        console.error('PATCH /api/interest-schedules/:id', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });

        const ok = await deactivateInterestScheduleById(id);
        if (!ok) return res.status(404).json({ error: 'Interest schedule not found' });
        res.json({ ok: true });
    } catch (err) {
        console.error('DELETE /api/interest-schedules/:id', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

export default router;
