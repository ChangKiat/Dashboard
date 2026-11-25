import { Router } from 'express';
import {
    type VisitChanges,
    type VisitItemInput,
    StaleVisitItemError,
    MissingOdometerError,
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

function validVisitType(value: unknown) {
    return value === 'Normal service' || value === 'Accessory repair';
}

function parseItems(rawItems: unknown): VisitItemInput[] | string {
    if (!Array.isArray(rawItems)) return 'Invalid service items';
    const items: VisitItemInput[] = [];
    for (const item of rawItems) {
        if (!isNonEmptyString(item?.description)) return 'Enter an item name';
        const amount = typeof item.amount === 'number' ? item.amount : typeof item.amount === 'string' ? Number(item.amount) : NaN;
        if (!isNonNegativeNumber(amount) || amount <= 0) {
            return 'Item amount must be greater than zero';
        }
        if (item.id !== undefined && (!Number.isSafeInteger(item.id) || item.id < 1)) return 'Invalid item id';
        items.push({
            id: item.id,
            category: isNonEmptyString(item.category) ? item.category : 'Material',
            description: item.description.trim(),
            amount,
        });
    }
    return items;
}

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
        const needsReading = body.visitType !== 'Accessory repair' || body.odometerKm != null;
        if (needsReading && !isNonNegativeInteger(body.odometerKm)) {
            return res.status(400).json({ error: 'Invalid odometer' });
        }

        if (body.visitType !== undefined && !validVisitType(body.visitType)) {
            return res.status(400).json({ error: 'Invalid visit type' });
        }
        const items = parseItems(body.items === undefined ? [] : body.items);
        if (typeof items === 'string') return res.status(400).json({ error: items });

        const visit = await createVisit({
            visitType: body.visitType,
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
        const fields: VisitChanges = {};
        if (body.visitType !== undefined && !validVisitType(body.visitType)) {
            return res.status(400).json({ error: 'Invalid visit type' });
        }
        if (body.visitType !== undefined) fields.visitType = body.visitType;
        if (body.items !== undefined) {
            const items = parseItems(body.items);
            if (typeof items === 'string') return res.status(400).json({ error: items });
            fields.items = items;
        }

        if (body.date != null) {
            if (!isValidDate(body.date)) return res.status(400).json({ error: 'Invalid date' });
            fields.date = body.date;
        }
        if (body.odometerKm !== undefined) {
            if (body.odometerKm !== null && !isNonNegativeInteger(body.odometerKm)) {
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
        if (err instanceof MissingOdometerError) return res.status(400).json({ error: err.message });
        if (err instanceof StaleVisitItemError) return res.status(409).json({ error: err.message });
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
