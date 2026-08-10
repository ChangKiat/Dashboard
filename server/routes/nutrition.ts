import { Router } from 'express';
import {
    deleteMeal,
    getMealHistory,
    getNutritionSummary,
    getOrCreateUserSettings,
    logMeal,
    updateMeal,
    updateNutritionTargets,
} from '../../agent/services/nutritionService';
import { enumerateDates, parseDateRange } from '../dateUtils';
import {
    isNonEmptyString,
    isPositiveNumber,
    isValidDate,
    parseIdParam,
} from '../validation';
import { getTelegramUserId } from '../telegramUser';

const router = Router();

router.get('/settings', async (_req, res) => {
    try {
        const userId = getTelegramUserId();
        const settings = await getOrCreateUserSettings(userId);
        res.json({
            dailyCalorieTarget: settings.dailyCalorieTarget,
            dailyProteinTargetG: settings.dailyProteinTargetG,
            dailyCarbsTargetG: settings.dailyCarbsTargetG,
            dailyFatTargetG: settings.dailyFatTargetG,
            bodyWeightKg: settings.bodyWeightKg,
        });
    } catch (err) {
        console.error('GET /api/nutrition/settings', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.patch('/settings', async (req, res) => {
    try {
        const userId = getTelegramUserId();
        const body = req.body as {
            dailyCalorieTarget?: number;
            dailyProteinTargetG?: number;
            dailyCarbsTargetG?: number;
            dailyFatTargetG?: number;
            bodyWeightKg?: number | null;
        };

        const targets: Parameters<typeof updateNutritionTargets>[1] = {};

        if (body.dailyCalorieTarget !== undefined) {
            if (!isPositiveNumber(body.dailyCalorieTarget)) {
                res.status(400).json({ error: 'dailyCalorieTarget must be a positive number' });
                return;
            }
            targets.dailyCalorieTarget = body.dailyCalorieTarget;
        }
        if (body.dailyProteinTargetG !== undefined) {
            if (!isPositiveNumber(body.dailyProteinTargetG)) {
                res.status(400).json({ error: 'dailyProteinTargetG must be a positive number' });
                return;
            }
            targets.dailyProteinTargetG = body.dailyProteinTargetG;
        }
        if (body.dailyCarbsTargetG !== undefined) {
            if (!isPositiveNumber(body.dailyCarbsTargetG)) {
                res.status(400).json({ error: 'dailyCarbsTargetG must be a positive number' });
                return;
            }
            targets.dailyCarbsTargetG = body.dailyCarbsTargetG;
        }
        if (body.dailyFatTargetG !== undefined) {
            if (!isPositiveNumber(body.dailyFatTargetG)) {
                res.status(400).json({ error: 'dailyFatTargetG must be a positive number' });
                return;
            }
            targets.dailyFatTargetG = body.dailyFatTargetG;
        }
        if (body.bodyWeightKg !== undefined) {
            if (body.bodyWeightKg !== null && !isPositiveNumber(body.bodyWeightKg)) {
                res.status(400).json({ error: 'bodyWeightKg must be a positive number or null' });
                return;
            }
            targets.bodyWeightKg = body.bodyWeightKg;
        }

        if (Object.keys(targets).length === 0) {
            res.status(400).json({ error: 'No settings fields provided' });
            return;
        }

        await updateNutritionTargets(userId, targets);
        const settings = await getOrCreateUserSettings(userId);
        res.json({
            ok: true,
            dailyCalorieTarget: settings.dailyCalorieTarget,
            dailyProteinTargetG: settings.dailyProteinTargetG,
            dailyCarbsTargetG: settings.dailyCarbsTargetG,
            dailyFatTargetG: settings.dailyFatTargetG,
            bodyWeightKg: settings.bodyWeightKg,
        });
    } catch (err) {
        console.error('PATCH /api/nutrition/settings', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.get('/daily', async (req, res) => {
    try {
        const { start, end } = parseDateRange(
            req.query.start as string | undefined,
            req.query.end as string | undefined
        );
        const userId = getTelegramUserId();
        const summary = await getNutritionSummary(userId, start, end);

        const series = enumerateDates(start, end).map((date) => {
            const day = summary.byDate[date];
            return {
                date,
                protein: day ? Math.round(day.protein) : 0,
                carbs: day ? Math.round(day.carbs) : 0,
                fat: day ? Math.round(day.fat) : 0,
                calories: day ? Math.round(day.calories) : 0,
                mealCount: day ? day.meals.length : 0,
                targets: {
                    protein: summary.targets.dailyProteinTargetG,
                    carbs: summary.targets.dailyCarbsTargetG,
                    fat: summary.targets.dailyFatTargetG,
                    calories: summary.targets.dailyCalorieTarget,
                },
            };
        });

        const daysWithData = series.filter((d) => d.calories > 0 || d.protein > 0).length;
        const avgCalories =
            daysWithData > 0
                ? Math.round(
                      series.reduce((s, d) => s + d.calories, 0) / daysWithData
                  )
                : 0;
        const avgProtein =
            daysWithData > 0
                ? Math.round(series.reduce((s, d) => s + d.protein, 0) / daysWithData)
                : 0;

        res.json({
            start,
            end,
            series,
            targets: {
                protein: summary.targets.dailyProteinTargetG,
                carbs: summary.targets.dailyCarbsTargetG,
                fat: summary.targets.dailyFatTargetG,
                calories: summary.targets.dailyCalorieTarget,
                bodyWeightKg: summary.targets.bodyWeightKg,
            },
            totals: {
                protein: summary.totalProtein,
                carbs: summary.totalCarbs,
                fat: summary.totalFat,
                calories: summary.totalCalories,
                mealCount: summary.mealCount,
            },
            averages: { calories: avgCalories, protein: avgProtein, daysWithData },
        });
    } catch (err) {
        console.error('GET /api/nutrition/daily', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.get('/meals', async (req, res) => {
    try {
        const { start, end } = parseDateRange(
            req.query.start as string | undefined,
            req.query.end as string | undefined
        );
        const userId = getTelegramUserId();
        const entries = await getMealHistory(userId, start, end);
        res.json({ start, end, entries });
    } catch (err) {
        console.error('GET /api/nutrition/meals', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.post('/meals', async (req, res) => {
    try {
        const body = req.body ?? {};
        if (!isValidDate(body.date)) return res.status(400).json({ error: 'Invalid date' });
        if (!isNonEmptyString(body.description)) {
            return res.status(400).json({ error: 'Invalid description' });
        }
        if (typeof body.proteinG !== 'number' || body.proteinG < 0) {
            return res.status(400).json({ error: 'Invalid protein' });
        }
        if (body.carbsG != null && (typeof body.carbsG !== 'number' || body.carbsG < 0)) {
            return res.status(400).json({ error: 'Invalid carbs' });
        }
        if (body.fatG != null && (typeof body.fatG !== 'number' || body.fatG < 0)) {
            return res.status(400).json({ error: 'Invalid fat' });
        }
        if (body.calories != null && (typeof body.calories !== 'number' || body.calories < 0)) {
            return res.status(400).json({ error: 'Invalid calories' });
        }

        const userId = getTelegramUserId();
        const mealType =
            body.mealType != null && body.mealType !== '' ? String(body.mealType) : undefined;
        await logMeal(
            userId,
            body.date,
            body.description.trim(),
            body.proteinG,
            mealType,
            body.carbsG ?? undefined,
            body.fatG ?? undefined,
            body.calories ?? undefined
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('POST /api/nutrition/meals', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.patch('/meals/:id', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });

        const body = req.body ?? {};
        const fields: {
            date?: string;
            description?: string;
            mealType?: string | null;
            proteinG?: number;
            carbsG?: number | null;
            fatG?: number | null;
            calories?: number | null;
        } = {};

        if (body.date != null) {
            if (!isValidDate(body.date)) return res.status(400).json({ error: 'Invalid date' });
            fields.date = body.date;
        }
        if (body.description != null) {
            if (!isNonEmptyString(body.description)) {
                return res.status(400).json({ error: 'Invalid description' });
            }
            fields.description = body.description.trim();
        }
        if (body.mealType !== undefined) {
            fields.mealType =
                body.mealType === null || body.mealType === '' ? null : String(body.mealType);
        }
        if (body.proteinG != null) {
            if (typeof body.proteinG !== 'number' || body.proteinG < 0) {
                return res.status(400).json({ error: 'Invalid protein' });
            }
            fields.proteinG = body.proteinG;
        }
        if (body.carbsG !== undefined) {
            if (body.carbsG !== null && (typeof body.carbsG !== 'number' || body.carbsG < 0)) {
                return res.status(400).json({ error: 'Invalid carbs' });
            }
            fields.carbsG = body.carbsG;
        }
        if (body.fatG !== undefined) {
            if (body.fatG !== null && (typeof body.fatG !== 'number' || body.fatG < 0)) {
                return res.status(400).json({ error: 'Invalid fat' });
            }
            fields.fatG = body.fatG;
        }
        if (body.calories !== undefined) {
            if (body.calories !== null && (typeof body.calories !== 'number' || body.calories < 0)) {
                return res.status(400).json({ error: 'Invalid calories' });
            }
            fields.calories = body.calories;
        }

        if (Object.keys(fields).length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const userId = getTelegramUserId();
        const ok = await updateMeal(id, userId, fields);
        if (!ok) return res.status(404).json({ error: 'Meal not found' });
        res.json({ ok: true });
    } catch (err) {
        console.error('PATCH /api/nutrition/meals/:id', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

router.delete('/meals/:id', async (req, res) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });

        const userId = getTelegramUserId();
        const ok = await deleteMeal(id, userId);
        if (!ok) return res.status(404).json({ error: 'Meal not found' });
        res.json({ ok: true });
    } catch (err) {
        console.error('DELETE /api/nutrition/meals/:id', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
    }
});

export default router;
