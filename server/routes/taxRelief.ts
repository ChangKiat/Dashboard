import express, { Router } from 'express';
import { and, asc, eq } from 'drizzle-orm';
import { requireDb } from '../../agent/db/client';
import { taxReliefDocuments } from '../../agent/db/schema';
import type { Request } from 'express';
import { getSessionEmail, SESSION_COOKIE } from '../auth';
import {
    addReceipt,
    createClaim,
    deleteClaim,
    deleteReceipt,
    getReceiptFile,
    getTaxReliefOverview,
    MAX_RECEIPT_BYTES,
    RECEIPT_MIME_TYPES,
    updateClaim,
    type ClaimFields,
} from '../../agent/services/taxReliefService';
import { isNonEmptyString, isPositiveNumber, isValidDate, parseIdParam } from '../validation';

const router = Router();
const documents = taxReliefDocuments;
const documentMeta = { id: documents.id, kind: documents.kind, fileName: documents.fileName };

/** The signed-in Google email that owns these documents. requireAuth runs first, so a session is always there. */
function sessionEmail(req: Request): string {
    const email = getSessionEmail(req.cookies?.[SESSION_COOKIE]);
    if (!email) throw new Error('Tax relief documents need a signed-in session');
    return email;
}

router.get('/documents/:year', async (req, res) => {
    const year = Number(req.params.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        return res.status(400).json({ error: 'Invalid assessment year' });
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.json(await requireDb().select(documentMeta).from(documents)
        .where(and(eq(documents.ownerEmail, sessionEmail(req)), eq(documents.year, year)))
        .orderBy(asc(documents.id)));
});

router.post('/documents/:year/:kind', express.raw({ type: 'application/pdf', limit: MAX_RECEIPT_BYTES }), async (req, res) => {
    const year = Number(req.params.year);
    const { kind } = req.params;
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || (kind !== 'ea' && kind !== 'lhdn')) {
        return res.status(400).json({ error: 'Invalid assessment year or document type' });
    }
    if (!Buffer.isBuffer(req.body) || req.body.subarray(0, 5).toString() !== '%PDF-') {
        return res.status(400).json({ error: 'Choose a valid PDF' });
    }
    let fileName: string;
    try {
        fileName = decodeURIComponent(req.get('X-File-Name') ?? '').trim().slice(0, 200) || 'document.pdf';
    } catch {
        return res.status(400).json({ error: 'Invalid file name' });
    }
    const [document] = await requireDb().insert(documents)
        .values({ ownerEmail: sessionEmail(req), year, kind, fileName, data: req.body })
        .returning(documentMeta);
    res.status(201).json(document);
});

router.get('/documents/:year/:id', async (req, res) => {
    const id = parseIdParam(req.params.id);
    const year = Number(req.params.year);
    if (!id || !Number.isInteger(year) || year < 2000 || year > 2100) {
        return res.status(400).json({ error: 'Invalid document or assessment year' });
    }
    const [file] = await requireDb().select({ fileName: documents.fileName, data: documents.data })
        .from(documents)
        .where(and(eq(documents.ownerEmail, sessionEmail(req)), eq(documents.id, id), eq(documents.year, year)));
    if (!file) return res.status(404).json({ error: 'Document not found' });
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.attachment(file.fileName).type('application/pdf').send(file.data);
});

router.delete('/documents/:year/:id', async (req, res) => {
    const id = parseIdParam(req.params.id);
    const year = Number(req.params.year);
    if (!id || !Number.isInteger(year) || year < 2000 || year > 2100) {
        return res.status(400).json({ error: 'Invalid document or assessment year' });
    }
    const [deleted] = await requireDb().delete(documents)
        .where(and(eq(documents.ownerEmail, sessionEmail(req)), eq(documents.id, id), eq(documents.year, year)))
        .returning({ id: documents.id });
    if (!deleted) return res.status(404).json({ error: 'Document not found' });
    res.json({ ok: true });
});

function parseAmount(value: unknown): number {
    return typeof value === 'number' ? value : parseFloat(String(value ?? ''));
}

router.get('/', async (req, res) => {
    try {
        const raw = typeof req.query.year === 'string' ? parseInt(req.query.year, 10) : NaN;
        const year = Number.isInteger(raw) && raw >= 2000 && raw <= 2100 ? raw : new Date().getFullYear();
        res.json(await getTaxReliefOverview(year));
    } catch (err) {
        console.error('GET /api/tax-relief', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.post('/claims', async (req, res) => {
    try {
        const body = req.body ?? {};
        if (!isValidDate(body.date)) return res.status(400).json({ error: 'Invalid date' });
        if (!isNonEmptyString(body.category)) return res.status(400).json({ error: 'Invalid category' });
        if (!isNonEmptyString(body.description)) {
            return res.status(400).json({ error: 'Invalid description' });
        }
        const amount = parseAmount(body.amount);
        if (!isPositiveNumber(amount)) return res.status(400).json({ error: 'Invalid amount' });

        const id = await createClaim({
            date: body.date,
            category: body.category,
            description: body.description,
            amount,
            notes: isNonEmptyString(body.notes) ? body.notes : null,
        });
        res.json({ ok: true, id });
    } catch (err) {
        console.error('POST /api/tax-relief/claims', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.patch('/claims/:id', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });

        const body = req.body ?? {};
        const fields: Partial<ClaimFields> = {};
        if (body.date != null) {
            if (!isValidDate(body.date)) return res.status(400).json({ error: 'Invalid date' });
            fields.date = body.date;
        }
        if (body.category != null) {
            if (!isNonEmptyString(body.category)) return res.status(400).json({ error: 'Invalid category' });
            fields.category = body.category;
        }
        if (body.description != null) {
            if (!isNonEmptyString(body.description)) {
                return res.status(400).json({ error: 'Invalid description' });
            }
            fields.description = body.description;
        }
        if (body.amount != null) {
            const amount = parseAmount(body.amount);
            if (!isPositiveNumber(amount)) return res.status(400).json({ error: 'Invalid amount' });
            fields.amount = amount;
        }
        if (body.notes !== undefined) {
            fields.notes = isNonEmptyString(body.notes) ? body.notes : null;
        }

        const ok = await updateClaim(id, fields);
        if (!ok) return res.status(404).json({ error: 'Claim not found' });
        res.json({ ok: true });
    } catch (err) {
        console.error('PATCH /api/tax-relief/claims/:id', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.delete('/claims/:id', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });
        const ok = await deleteClaim(id);
        if (!ok) return res.status(404).json({ error: 'Claim not found' });
        res.json({ ok: true });
    } catch (err) {
        console.error('DELETE /api/tax-relief/claims/:id', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

/** Body is the raw file; name comes from the X-File-Name header (URI-encoded). */
router.post(
    '/claims/:id/receipts',
    express.raw({ type: () => true, limit: MAX_RECEIPT_BYTES }),
    async (req, res) => {
        try {
            const claimId = parseIdParam(req.params.id);
            if (!claimId) return res.status(400).json({ error: 'Invalid id' });

            const mimeType = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
            if (!RECEIPT_MIME_TYPES.includes(mimeType)) {
                return res.status(400).json({ error: 'Receipt must be a PDF or image' });
            }
            if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
                return res.status(400).json({ error: 'Empty file' });
            }

            let fileName = 'receipt';
            const header = req.headers['x-file-name'];
            if (typeof header === 'string' && header.trim()) {
                try {
                    fileName = decodeURIComponent(header).trim().slice(0, 200);
                } catch {
                    fileName = header.trim().slice(0, 200);
                }
            }

            const receipt = await addReceipt({ claimId, fileName, mimeType, data: req.body });
            if (!receipt) return res.status(404).json({ error: 'Claim not found' });
            res.json({ ok: true, receipt });
        } catch (err) {
            console.error('POST /api/tax-relief/claims/:id/receipts', err);
            res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
        }
    }
);

router.get('/receipts/:id', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });
        const file = await getReceiptFile(id);
        if (!file) return res.status(404).json({ error: 'Receipt not found' });

        const disposition = req.query.download === '1' ? 'attachment' : 'inline';
        res.setHeader('Content-Type', file.mimeType);
        res.setHeader(
            'Content-Disposition',
            `${disposition}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`
        );
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.send(file.data);
    } catch (err) {
        console.error('GET /api/tax-relief/receipts/:id', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.delete('/receipts/:id', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });
        const ok = await deleteReceipt(id);
        if (!ok) return res.status(404).json({ error: 'Receipt not found' });
        res.json({ ok: true });
    } catch (err) {
        console.error('DELETE /api/tax-relief/receipts/:id', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

export default router;
