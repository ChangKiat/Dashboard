import { Router } from 'express';
import { getSyncFingerprint, type SyncScope } from '../syncStatus';
import { parseMonth } from '../dateUtils';

const router = Router();

const VALID_SCOPES = new Set<SyncScope>(['expenses', 'health']);

router.get('/', async (req, res) => {
    try {
        const scope = req.query.scope as string | undefined;
        if (!scope || !VALID_SCOPES.has(scope as SyncScope)) {
            res.status(400).json({ error: 'scope must be "expenses" or "health"' });
            return;
        }

        const { month } = parseMonth(req.query.month as string | undefined);
        const fingerprint = await getSyncFingerprint(month, scope as SyncScope);
        res.json({ fingerprint });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to get sync status';
        res.status(500).json({ error: message });
    }
});

export default router;
