import { createHash, timingSafeEqual } from 'crypto';
import { Router, type Request } from 'express';
import { isSchedulerEnabled, runDueJobs } from '../dailyJobs';

const router = Router();

function schedulerSecret(): string | null {
    const secret = process.env.SCHEDULER_SECRET;
    return secret && secret.length >= 16 ? secret : null;
}

/** `Authorization: Bearer <SCHEDULER_SECRET>`. Hashing both sides gives timingSafeEqual equal lengths. */
function hasSchedulerSecret(req: Request, secret: string): boolean {
    const header = req.get('authorization') ?? '';
    if (!header.startsWith('Bearer ')) return false;
    const digest = (value: string) => createHash('sha256').update(value).digest();
    return timingSafeEqual(digest(header.slice('Bearer '.length)), digest(secret));
}

/**
 * The outside ping (.github/workflows/daily-jobs.yml) that wakes a sleeping server and runs the
 * due daily jobs. Safe to call any number of times: a day that already ran is skipped. The reply
 * lists only job names and dates, since CI logs may be public.
 */
router.post('/run', async (req, res) => {
    const secret = schedulerSecret();
    if (!isSchedulerEnabled() || !secret) {
        res.status(503).json({ error: 'Scheduler is off: set SCHEDULER_ENABLED=1 and SCHEDULER_SECRET (16+ chars)' });
        return;
    }
    if (!hasSchedulerSecret(req, secret)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const ran = await runDueJobs('http');
    res.json({ ok: true, ran });
});

export default router;
