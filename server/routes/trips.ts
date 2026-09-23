import { Router } from 'express';
import {
    createTrip,
    deleteTrip,
    getTripById,
    getTripSummary,
    linkExpensesToTrip,
    listLinkCandidates,
    listTrips,
    unlinkExpenseFromTrip,
    updateTrip,
} from '../../agent/services/tripService';
import { isNonEmptyString, isValidDate, parseIdParam } from '../validation';

const router = Router();

function optionalDate(value: unknown): string | null | 'invalid' {
    if (value == null || value === '') return null;
    if (!isValidDate(value)) return 'invalid';
    return value;
}

router.get('/', async (_req, res) => {
    try {
        const entries = await listTrips();
        res.json({ entries });
    } catch (err) {
        console.error('GET /api/trips', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.post('/', async (req, res) => {
    try {
        const body = req.body ?? {};
        if (!isNonEmptyString(body.name)) {
            return res.status(400).json({ error: 'Invalid name' });
        }
        if (!isNonEmptyString(body.tripCurrency)) {
            return res.status(400).json({ error: 'Invalid trip currency' });
        }
        const startDate = optionalDate(body.startDate);
        if (startDate === 'invalid') return res.status(400).json({ error: 'Invalid start date' });
        const endDate = optionalDate(body.endDate);
        if (endDate === 'invalid') return res.status(400).json({ error: 'Invalid end date' });

        const trip = await createTrip({
            name: body.name.trim(),
            startDate,
            endDate,
            tripCurrency: body.tripCurrency.trim(),
            notes: isNonEmptyString(body.notes) ? body.notes.trim() : null,
        });
        res.json({ ok: true, trip });
    } catch (err) {
        console.error('POST /api/trips', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });
        const trip = await getTripById(id);
        if (!trip) return res.status(404).json({ error: 'Trip not found' });
        res.json({ trip });
    } catch (err) {
        console.error('GET /api/trips/:id', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.get('/:id/summary', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });
        const summary = await getTripSummary(id);
        if (!summary) return res.status(404).json({ error: 'Trip not found' });
        res.json(summary);
    } catch (err) {
        console.error('GET /api/trips/:id/summary', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

/** Ungrouped regular transactions in a date range (defaults to the trip dates, else last 30 days). */
router.get('/:id/candidates', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });
        const trip = await getTripById(id);
        if (!trip) return res.status(404).json({ error: 'Trip not found' });

        const today = new Date().toISOString().slice(0, 10);
        const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
        const start = isValidDate(req.query.start) ? req.query.start : trip.startDate ?? monthAgo;
        const end = isValidDate(req.query.end) ? req.query.end : trip.endDate ?? today;
        if (start > end) return res.status(400).json({ error: 'Start must be before end' });

        const entries = await listLinkCandidates(start, end);
        res.json({ start, end, entries });
    } catch (err) {
        console.error('GET /api/trips/:id/candidates', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.post('/:id/link', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });
        const ids: unknown = req.body?.expenseIds;
        if (
            !Array.isArray(ids) ||
            ids.length === 0 ||
            !ids.every((v) => typeof v === 'number' && Number.isInteger(v) && v > 0)
        ) {
            return res.status(400).json({ error: 'expenseIds must be a non-empty array of ids' });
        }
        const trip = await getTripById(id);
        if (!trip) return res.status(404).json({ error: 'Trip not found' });

        const linked = await linkExpensesToTrip(id, ids as number[]);
        res.json({ ok: true, linked });
    } catch (err) {
        console.error('POST /api/trips/:id/link', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.delete('/:id/link/:expenseId', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        const expenseId = parseIdParam(req.params.expenseId);
        if (!id || !expenseId) return res.status(400).json({ error: 'Invalid id' });
        const ok = await unlinkExpenseFromTrip(id, expenseId);
        if (!ok) return res.status(404).json({ error: 'Linked transaction not found on this trip' });
        res.json({ ok: true });
    } catch (err) {
        console.error('DELETE /api/trips/:id/link/:expenseId', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.patch('/:id', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });

        const body = req.body ?? {};
        const fields: {
            name?: string;
            startDate?: string | null;
            endDate?: string | null;
            tripCurrency?: string;
            notes?: string | null;
        } = {};

        if (body.name != null) {
            if (!isNonEmptyString(body.name)) return res.status(400).json({ error: 'Invalid name' });
            fields.name = body.name.trim();
        }
        if (body.tripCurrency != null) {
            if (!isNonEmptyString(body.tripCurrency)) {
                return res.status(400).json({ error: 'Invalid trip currency' });
            }
            fields.tripCurrency = body.tripCurrency.trim();
        }
        if (body.startDate !== undefined) {
            const startDate = optionalDate(body.startDate);
            if (startDate === 'invalid') return res.status(400).json({ error: 'Invalid start date' });
            fields.startDate = startDate;
        }
        if (body.endDate !== undefined) {
            const endDate = optionalDate(body.endDate);
            if (endDate === 'invalid') return res.status(400).json({ error: 'Invalid end date' });
            fields.endDate = endDate;
        }
        if (body.notes !== undefined) {
            fields.notes = isNonEmptyString(body.notes) ? body.notes.trim() : null;
        }

        if (Object.keys(fields).length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const trip = await updateTrip(id, fields);
        if (!trip) return res.status(404).json({ error: 'Trip not found' });
        res.json({ ok: true, trip });
    } catch (err) {
        console.error('PATCH /api/trips/:id', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });
        const ok = await deleteTrip(id);
        if (!ok) return res.status(404).json({ error: 'Trip not found' });
        res.json({ ok: true });
    } catch (err) {
        console.error('DELETE /api/trips/:id', err);
        const message = err instanceof Error ? err.message : 'Server error';
        if (message.includes('Cannot delete')) {
            return res.status(400).json({ error: message });
        }
        res.status(500).json({ error: message });
    }
});

export default router;
