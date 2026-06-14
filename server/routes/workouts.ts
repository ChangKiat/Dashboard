import { Router } from 'express';
import { getWorkoutHistory, updateWorkout, deleteWorkout } from '../../../AI Agent/src/services/gymService';
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

        res.json({ start, end, series, totalSessions: history.length, totalSets });
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
            totalSessions: history.length,
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
