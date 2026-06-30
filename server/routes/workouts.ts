import { randomUUID } from 'crypto';
import { Router } from 'express';
import {
    countWorkoutSessions,
    deleteWorkout,
    getWorkoutHistory,
    logWorkout,
    updateWorkout,
} from '../../../AI Agent/src/services/gymService';
import { enumerateDates, parseDateRange } from '../dateUtils';
import {
    computePersonalRecords,
    countExercises,
    formatWorkoutEntries,
    groupWorkoutsByDate,
} from '../aggregators';
import {
    isNonEmptyString,
    isNonNegativeInteger,
    isValidDate,
    parseIdParam,
} from '../validation';
import { getTelegramUserId } from '../telegramUser';

const router = Router();

router.get('/daily', async (req, res) => {
    try {
        const { start, end } = parseDateRange(
            req.query.start as string | undefined,
            req.query.end as string | undefined
        );
        const userId = getTelegramUserId();
        const history = await getWorkoutHistory(userId, start, end);
        const grouped = groupWorkoutsByDate(history);

        const series = enumerateDates(start, end).map((date) => ({
            date,
            sessionCount: grouped[date]?.sessionCount ?? 0,
            totalSets: grouped[date]?.totalSets ?? 0,
            exercises: grouped[date]?.exercises ?? [],
        }));

        const totalSets = history.reduce((sum, row) => sum + (row.sets ?? 0), 0);

        res.json({
            start,
            end,
            series,
            totalSessions: countWorkoutSessions(history),
            totalSets,
        });
    } catch (err) {
        console.error('GET /api/workouts/daily', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.get('/exercises', async (req, res) => {
    try {
        const { start, end } = parseDateRange(
            req.query.start as string | undefined,
            req.query.end as string | undefined
        );
        const userId = getTelegramUserId();
        const history = await getWorkoutHistory(userId, start, end);
        const { top, weightTrend } = countExercises(history);

        const uniqueExercises = new Set(history.map((w) => w.exercise)).size;
        const mostTrained = top[0]?.exercise ?? null;

        res.json({
            start,
            end,
            top,
            weightTrend,
            uniqueExercises,
            mostTrained,
            totalSessions: countWorkoutSessions(history),
        });
    } catch (err) {
        console.error('GET /api/workouts/exercises', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.get('/prs', async (_req, res) => {
    try {
        const userId = getTelegramUserId();
        const history = await getWorkoutHistory(userId);
        const { prs, heaviest } = computePersonalRecords(history);

        res.json({ prs, heaviest });
    } catch (err) {
        console.error('GET /api/workouts/prs', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.get('/history', async (req, res) => {
    try {
        const { start, end } = parseDateRange(
            req.query.start as string | undefined,
            req.query.end as string | undefined
        );
        const userId = getTelegramUserId();
        const history = await getWorkoutHistory(userId, start, end);

        res.json({ start, end, entries: formatWorkoutEntries(history) });
    } catch (err) {
        console.error('GET /api/workouts/history', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.post('/', async (req, res) => {
    try {
        const body = req.body ?? {};
        if (!isValidDate(body.date)) return res.status(400).json({ error: 'Invalid date' });
        if (!isNonEmptyString(body.exercise)) {
            return res.status(400).json({ error: 'Invalid exercise' });
        }
        if (body.sets != null && !isNonNegativeInteger(body.sets)) {
            return res.status(400).json({ error: 'Invalid sets' });
        }
        if (body.reps != null && !isNonNegativeInteger(body.reps)) {
            return res.status(400).json({ error: 'Invalid reps' });
        }
        if (body.weightKg != null && (typeof body.weightKg !== 'number' || body.weightKg < 0)) {
            return res.status(400).json({ error: 'Invalid weight' });
        }
        if (
            body.durationMin != null &&
            (typeof body.durationMin !== 'number' || body.durationMin < 0)
        ) {
            return res.status(400).json({ error: 'Invalid duration' });
        }
        if (
            body.caloriesBurned != null &&
            (typeof body.caloriesBurned !== 'number' || body.caloriesBurned < 0)
        ) {
            return res.status(400).json({ error: 'Invalid calories burned' });
        }
        if (body.fatBurnG != null && (typeof body.fatBurnG !== 'number' || body.fatBurnG < 0)) {
            return res.status(400).json({ error: 'Invalid fat burned' });
        }

        const userId = getTelegramUserId();

        let sessionId: string | null | undefined;
        let sessionLabel: string | null | undefined;
        if (body.sessionId !== undefined) {
            sessionId =
                body.sessionId != null && isNonEmptyString(body.sessionId)
                    ? body.sessionId.trim()
                    : null;
        }
        if (body.sessionLabel !== undefined) {
            sessionLabel =
                body.sessionLabel != null && isNonEmptyString(body.sessionLabel)
                    ? body.sessionLabel.trim()
                    : null;
        }
        if (sessionLabel && !sessionId) {
            sessionId = randomUUID();
        }

        await logWorkout(
            userId,
            body.date,
            body.exercise.trim(),
            body.sets ?? undefined,
            body.reps ?? undefined,
            body.weightKg ?? undefined,
            body.durationMin ?? undefined,
            body.notes != null && body.notes !== '' ? String(body.notes) : undefined,
            body.caloriesBurned ?? undefined,
            body.fatBurnG ?? undefined,
            sessionId ?? null,
            sessionLabel ?? null
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('POST /api/workouts', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.patch('/:id', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });

        const body = req.body ?? {};
        const fields: {
            date?: string;
            exercise?: string;
            sets?: number | null;
            reps?: number | null;
            weightKg?: number | null;
            durationMin?: number | null;
            notes?: string | null;
            caloriesBurned?: number | null;
            fatBurnG?: number | null;
            sessionId?: string | null;
            sessionLabel?: string | null;
        } = {};

        if (body.date != null) {
            if (!isValidDate(body.date)) return res.status(400).json({ error: 'Invalid date' });
            fields.date = body.date;
        }
        if (body.exercise != null) {
            if (!isNonEmptyString(body.exercise)) {
                return res.status(400).json({ error: 'Invalid exercise' });
            }
            fields.exercise = body.exercise.trim();
        }
        if (body.sets !== undefined) {
            if (body.sets !== null && !isNonNegativeInteger(body.sets)) {
                return res.status(400).json({ error: 'Invalid sets' });
            }
            fields.sets = body.sets;
        }
        if (body.reps !== undefined) {
            if (body.reps !== null && !isNonNegativeInteger(body.reps)) {
                return res.status(400).json({ error: 'Invalid reps' });
            }
            fields.reps = body.reps;
        }
        if (body.weightKg !== undefined) {
            if (body.weightKg !== null && (typeof body.weightKg !== 'number' || body.weightKg < 0)) {
                return res.status(400).json({ error: 'Invalid weight' });
            }
            fields.weightKg = body.weightKg;
        }
        if (body.durationMin !== undefined) {
            if (body.durationMin !== null && (typeof body.durationMin !== 'number' || body.durationMin < 0)) {
                return res.status(400).json({ error: 'Invalid duration' });
            }
            fields.durationMin = body.durationMin;
        }
        if (body.notes !== undefined) {
            fields.notes = body.notes === null || body.notes === '' ? null : String(body.notes);
        }
        if (body.caloriesBurned !== undefined) {
            if (
                body.caloriesBurned !== null &&
                (typeof body.caloriesBurned !== 'number' || body.caloriesBurned < 0)
            ) {
                return res.status(400).json({ error: 'Invalid calories burned' });
            }
            fields.caloriesBurned = body.caloriesBurned;
        }
        if (body.fatBurnG !== undefined) {
            if (body.fatBurnG !== null && (typeof body.fatBurnG !== 'number' || body.fatBurnG < 0)) {
                return res.status(400).json({ error: 'Invalid fat burned' });
            }
            fields.fatBurnG = body.fatBurnG;
        }
        if (body.sessionId !== undefined) {
            fields.sessionId =
                body.sessionId != null && isNonEmptyString(body.sessionId)
                    ? body.sessionId.trim()
                    : null;
        }
        if (body.sessionLabel !== undefined) {
            fields.sessionLabel =
                body.sessionLabel != null && isNonEmptyString(body.sessionLabel)
                    ? body.sessionLabel.trim()
                    : null;
        }
        if (fields.sessionLabel && fields.sessionId === undefined) {
            fields.sessionId = randomUUID();
        }

        if (Object.keys(fields).length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const userId = getTelegramUserId();
        const ok = await updateWorkout(id, userId, fields);
        if (!ok) return res.status(404).json({ error: 'Workout not found' });
        res.json({ ok: true });
    } catch (err) {
        console.error('PATCH /api/workouts/:id', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });

        const userId = getTelegramUserId();
        const ok = await deleteWorkout(id, userId);
        if (!ok) return res.status(404).json({ error: 'Workout not found' });
        res.json({ ok: true });
    } catch (err) {
        console.error('DELETE /api/workouts/:id', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

export default router;
