import express, { Router } from 'express';
import { asc, eq, sql } from 'drizzle-orm';
import { requireDb } from '../../agent/db/client';
import { assets } from '../../agent/db/schema';
import { isNonEmptyString, isNonNegativeNumber, isValidDate, parseIdParam } from '../validation';

const router = Router();
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_VALUE = 9_999_999_999.99;

/** Everything but the picture bytes, which are served one at a time. */
const columns = {
    id: assets.id,
    name: assets.name,
    category: assets.category,
    purchaseDate: assets.purchaseDate,
    purchaseValue: assets.purchaseValue,
    currentValue: assets.currentValue,
    notes: assets.notes,
    imageVersion: assets.imageVersion,
};

const isValue = (value: unknown): value is number => isNonNegativeNumber(value) && value <= MAX_VALUE;

/** The columns to write, or an error message. */
function parseFields(body: Record<string, unknown>) {
    const { name, category, purchaseDate, purchaseValue, currentValue, notes } = body;
    if (!isNonEmptyString(name)) return 'Enter a name';
    if (!isNonEmptyString(category)) return 'Choose a category';
    if (!isValidDate(purchaseDate)) return 'Invalid purchase date';
    if (!isValue(purchaseValue)) return 'Invalid purchase value';
    if (currentValue != null && !isValue(currentValue)) return 'Invalid current value';
    return {
        name: name.trim().slice(0, 200),
        category: category.trim().slice(0, 60),
        purchaseDate,
        purchaseValue: purchaseValue.toFixed(2),
        currentValue: isValue(currentValue) ? currentValue.toFixed(2) : null,
        notes: isNonEmptyString(notes) ? notes.trim().slice(0, 2000) : null,
    };
}

/** The type is read from the file's first bytes, not from what the browser claims. */
function imageType(data: Buffer): 'image/png' | 'image/webp' | null {
    if (data.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return 'image/png';
    if (data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
    return null;
}

router.get('/', async (_req, res) => {
    try {
        const rows = await requireDb().select(columns).from(assets)
            .orderBy(asc(assets.purchaseDate), asc(assets.id));
        res.json(rows.map((row) => ({
            ...row,
            purchaseValue: Number(row.purchaseValue),
            currentValue: row.currentValue == null ? null : Number(row.currentValue),
        })));
    } catch (err) {
        console.error('GET /api/assets', err);
        res.status(500).json({ error: 'Could not load assets' });
    }
});

router.post('/', async (req, res) => {
    try {
        const fields = parseFields(req.body ?? {});
        if (typeof fields === 'string') return res.status(400).json({ error: fields });
        const [row] = await requireDb().insert(assets).values(fields).returning({ id: assets.id });
        res.status(201).json(row);
    } catch (err) {
        console.error('POST /api/assets', err);
        res.status(500).json({ error: 'Could not save the asset' });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });
        const fields = parseFields(req.body ?? {});
        if (typeof fields === 'string') return res.status(400).json({ error: fields });
        const [row] = await requireDb().update(assets).set(fields).where(eq(assets.id, id))
            .returning({ id: assets.id });
        if (!row) return res.status(404).json({ error: 'Asset not found' });
        res.json(row);
    } catch (err) {
        console.error('PUT /api/assets/:id', err);
        res.status(500).json({ error: 'Could not save the asset' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });
        const [row] = await requireDb().delete(assets).where(eq(assets.id, id)).returning({ id: assets.id });
        if (!row) return res.status(404).json({ error: 'Asset not found' });
        res.json({ ok: true });
    } catch (err) {
        console.error('DELETE /api/assets/:id', err);
        res.status(500).json({ error: 'Could not delete the asset' });
    }
});

router.put('/:id/image', express.raw({ type: () => true, limit: MAX_IMAGE_BYTES }), async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });
        const body: unknown = req.body;
        const mime = Buffer.isBuffer(body) ? imageType(body) : null;
        if (!mime) return res.status(400).json({ error: 'Picture must be a PNG or WebP image' });
        const [row] = await requireDb().update(assets)
            .set({ image: body as Buffer, imageMime: mime, imageVersion: sql`${assets.imageVersion} + 1` })
            .where(eq(assets.id, id))
            .returning({ id: assets.id });
        if (!row) return res.status(404).json({ error: 'Asset not found' });
        res.json({ ok: true });
    } catch (err) {
        console.error('PUT /api/assets/:id/image', err);
        res.status(500).json({ error: 'Could not save the picture' });
    }
});

router.get('/:id/image', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });
        const [file] = await requireDb().select({ data: assets.image, mime: assets.imageMime })
            .from(assets).where(eq(assets.id, id));
        if (!file?.data || !file.mime) return res.status(404).json({ error: 'Picture not found' });
        res.setHeader('Content-Type', file.mime);
        // Not stored by the browser, so pictures are gone from it after signing out.
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.send(file.data);
    } catch (err) {
        console.error('GET /api/assets/:id/image', err);
        res.status(500).json({ error: 'Could not load the picture' });
    }
});

export default router;
