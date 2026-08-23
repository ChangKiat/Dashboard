import { Router } from 'express';
import {
    CAR_SERVICE_CATEGORIES,
    createVisit,
    deleteItem,
    deleteVisit,
    getCarServiceOverview,
    updateVisit,
    upsertVisitItem,
} from '../../agent/services/carServiceService';
import {
    isNonEmptyString,
    isNonNegativeInteger,
    isNonNegativeNumber,
    isValidDate,
    parseIdParam,
} from '../validation';

const router = Router();

router.get('/', async (_req, res) => {
    try {
        const overview = await getCarServiceOverview();
        res.json(overview);
    } catch (err) {
        console.error('GET /api/car-service', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.post('/visits', async (req, res) => {
    try {
        const body = req.body ?? {};
        if (!isValidDate(body.date)) {
            return res.status(400).json({ error: 'Invalid date' });
        }
        if (!isNonNegativeInteger(body.odometerKm)) {
            return res.status(400).json({ error: 'Invalid odometer' });
        }

        const rawItems = Array.isArray(body.items) ? body.items : [];
        const items: { category: string; description: string; amount: number }[] = [];
        for (const item of rawItems) {
            if (!isNonEmptyString(item?.description)) continue;
            const amount = typeof item.amount === 'number' ? item.amount : parseFloat(item.amount);
            if (!isNonNegativeNumber(amount) || amount <= 0) continue;
            items.push({
                category: isNonEmptyString(item.category) ? item.category : 'Material',
                description: item.description.trim(),
                amount,
            });
        }

        const visit = await createVisit({
            date: body.date,
            odometerKm: body.odometerKm,
            notes: isNonEmptyString(body.notes) ? body.notes.trim() : null,
            items,
        });
        res.json({ ok: true, visit });
    } catch (err) {
        console.error('POST /api/car-service/visits', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.patch('/visits/:id', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });

        const body = req.body ?? {};
        const fields: { date?: string; odometerKm?: number; notes?: string | null } = {};

        if (body.date != null) {
            if (!isValidDate(body.date)) return res.status(400).json({ error: 'Invalid date' });
            fields.date = body.date;
        }
        if (body.odometerKm != null) {
            if (!isNonNegativeInteger(body.odometerKm)) {
                return res.status(400).json({ error: 'Invalid odometer' });
            }
            fields.odometerKm = body.odometerKm;
        }
        if (body.notes !== undefined) {
            fields.notes = isNonEmptyString(body.notes) ? body.notes.trim() : null;
        }

        const visit = await updateVisit(id, fields);
        if (!visit) return res.status(404).json({ error: 'Visit not found' });
        res.json({ ok: true, visit });
    } catch (err) {
        console.error('PATCH /api/car-service/visits/:id', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.delete('/visits/:id', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });
        const ok = await deleteVisit(id);
        if (!ok) return res.status(404).json({ error: 'Visit not found' });
        res.json({ ok: true });
    } catch (err) {
        console.error('DELETE /api/car-service/visits/:id', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.put('/visits/:id/items', async (req, res) => {
    try {
        const visitId = parseIdParam(req.params.id);
        if (!visitId) return res.status(400).json({ error: 'Invalid id' });

        const body = req.body ?? {};
        if (!isNonEmptyString(body.description)) {
            return res.status(400).json({ error: 'Invalid description' });
        }
        const amount =
            typeof body.amount === 'number' ? body.amount : parseFloat(String(body.amount ?? ''));
        if (!Number.isFinite(amount) || amount < 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        const category = isNonEmptyString(body.category) ? body.category : 'Material';
        if (!(CAR_SERVICE_CATEGORIES as readonly string[]).includes(category) && category !== 'Other') {
            // resolveCategory in service maps unknown → Other
        }

        const item = await upsertVisitItem({
            visitId,
            category,
            description: body.description.trim(),
            amount,
        });
        res.json({ ok: true, item });
    } catch (err) {
        console.error('PUT /api/car-service/visits/:id/items', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.delete('/items/:id', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });
        const ok = await deleteItem(id);
        if (!ok) return res.status(404).json({ error: 'Item not found' });
        res.json({ ok: true });
    } catch (err) {
        console.error('DELETE /api/car-service/items/:id', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

export default router;
