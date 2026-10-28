import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
    BodyWeightLogEntry,
    DailyActivityLogEntry,
    MealEntry,
    NutritionDailyPoint,
    NutritionSettings,
    PersonalRecord,
    WorkoutDailyPoint,
    WorkoutEntry,
} from '../api';
import {
    fetchBodyWeightLogs,
    fetchDailyActivityLogs,
    fetchMeals,
    fetchNutritionDaily,
    fetchNutritionSettings,
    fetchSyncStatus,
    fetchWorkoutDaily,
    fetchWorkoutExercises,
    fetchWorkoutHistory,
    fetchWorkoutPRs,
} from '../api';
import { computeMacroAdherence } from '../components/MacroAdherenceStrip';
import { caloriesFromSteps, computeBMR } from '../utils/calorieEstimate';
import { monthToDateRange } from '../utils/dateRange';
import { useRefreshSignal } from './useRefreshSignal';
import { useSmartRefresh } from './useSmartRefresh';

export interface HealthData {
    /** The month these entries belong to. */
    month: string;
    workoutSeries: WorkoutDailyPoint[];
    nutritionSeries: NutritionDailyPoint[];
    topExercises: { exercise: string; count: number }[];
    weightTrend: Record<string, { date: string; weightKg: number }[]>;
    prs: PersonalRecord[];
    history: WorkoutEntry[];
    meals: MealEntry[];
    bodyWeightLogs: BodyWeightLogEntry[];
    latestWeight: BodyWeightLogEntry | null;
    previousWeight: BodyWeightLogEntry | null;
    dailyActivity: DailyActivityLogEntry[];
    nutritionSettings: NutritionSettings | null;
}

/** Days of the month that have started: all of a past month, none of a future one. */
function monthElapsedDays(month: string): number {
    const [yearStr, monthStr] = month.split('-');
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1;
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const now = new Date();
    if (now.getFullYear() === year && now.getMonth() === monthIndex) {
        return Math.min(now.getDate(), daysInMonth);
    }
    if (new Date(year, monthIndex, 1) > now) return 0;
    return daysInMonth;
}

function formatWeightDelta(latest: BodyWeightLogEntry | null, previous: BodyWeightLogEntry | null) {
    if (!latest || !previous) return undefined;
    const delta = Math.round((latest.weightKg - previous.weightKg) * 10) / 10;
    if (delta === 0) return 'No change vs prior log';
    const sign = delta > 0 ? '+' : '';
    return `${sign}${delta} kg vs prior log`;
}

function computeTrainingStreak(series: WorkoutDailyPoint[], month: string, elapsed: number) {
    if (elapsed === 0) return { current: 0, best: 0 };
    const trainedDates = new Set(series.filter((d) => d.sessionCount > 0).map((d) => d.date));

    let current = 0;
    for (let day = elapsed; day >= 1; day--) {
        const dateStr = `${month}-${String(day).padStart(2, '0')}`;
        if (!trainedDates.has(dateStr)) break;
        current++;
    }

    let best = 0;
    let run = 0;
    for (let day = 1; day <= elapsed; day++) {
        const dateStr = `${month}-${String(day).padStart(2, '0')}`;
        if (trainedDates.has(dateStr)) {
            run++;
            best = Math.max(best, run);
        } else {
            run = 0;
        }
    }

    return { current, best };
}

function deriveStats(data: HealthData) {
    const { month, workoutSeries, nutritionSeries, history, dailyActivity, nutritionSettings } = data;
    const elapsed = monthElapsedDays(month);

    const bmr = computeBMR(
        nutritionSettings?.bodyWeightKg ?? null,
        nutritionSettings?.heightCm ?? null,
        nutritionSettings?.age ?? null,
        nutritionSettings?.sex ?? null
    );

    // Each day's burn: workouts + steps + BMR.
    const workoutByDate = new Map<string, number>();
    let fatBurnG = 0;
    for (const entry of history) {
        if (entry.fatBurnG != null) fatBurnG += entry.fatBurnG;
        if (entry.caloriesBurned == null) continue;
        workoutByDate.set(entry.date, (workoutByDate.get(entry.date) ?? 0) + entry.caloriesBurned);
    }
    const stepsByDate = new Map(dailyActivity.map((a) => [a.date, a.steps]));
    const dates = new Set<string>();
    for (let day = 1; day <= elapsed; day++) {
        dates.add(`${month}-${String(day).padStart(2, '0')}`);
    }
    for (const date of workoutByDate.keys()) dates.add(date);
    for (const date of stepsByDate.keys()) dates.add(date);
    const burnSeries = [...dates]
        .sort()
        .map((date) => {
            const workout = workoutByDate.get(date) ?? 0;
            const steps = stepsByDate.get(date) ?? 0;
            const stepCalories = caloriesFromSteps(steps, nutritionSettings?.bodyWeightKg ?? null);
            return { date, caloriesBurned: Math.round(workout + stepCalories + (bmr ?? 0)) };
        })
        .filter((d) => d.caloriesBurned > 0);

    const burnByDate = new Map(burnSeries.map((b) => [b.date, b.caloriesBurned]));
    const netCalorieSeries = nutritionSeries.map((d) => {
        const burned = burnByDate.get(d.date) ?? 0;
        return {
            date: d.date,
            calories: d.calories,
            caloriesBurned: burned,
            net: Math.round(d.calories - burned),
            target: d.targets.calories,
        };
    });
    const netLogged = netCalorieSeries.filter((d) => d.calories > 0);
    const netCalories =
        netLogged.length === 0
            ? { avgNet: 0, avgTarget: 0, loggedDays: 0 }
            : {
                  avgNet: Math.round(netLogged.reduce((sum, d) => sum + d.net, 0) / netLogged.length),
                  avgTarget: Math.round(netLogged.reduce((sum, d) => sum + d.target, 0) / netLogged.length),
                  loggedDays: netLogged.length,
              };

    const stepsTotal = dailyActivity.reduce((sum, d) => sum + d.steps, 0);

    return {
        elapsed,
        bmr,
        weightSub: formatWeightDelta(data.latestWeight, data.previousWeight),
        trainingDays: workoutSeries.filter((d) => d.sessionCount > 0).length,
        sessions: workoutSeries.reduce((sum, d) => sum + d.sessionCount, 0),
        sets: workoutSeries.reduce((sum, d) => sum + d.totalSets, 0),
        streak: computeTrainingStreak(workoutSeries, month, elapsed),
        adherence: computeMacroAdherence(nutritionSeries),
        burnSeries,
        caloriesBurned: burnSeries.reduce((sum, d) => sum + d.caloriesBurned, 0),
        fatBurnG: Math.round(fatBurnG * 10) / 10,
        netCalorieSeries,
        netCalories,
        steps: {
            avg: dailyActivity.length > 0 ? Math.round(stepsTotal / dailyActivity.length) : 0,
            loggedDays: dailyActivity.length,
        },
    };
}

export type HealthStats = ReturnType<typeof deriveStats>;

/** Whether the average net calories sit more than 10% off the average target. */
export function netCaloriesOffTarget({ avgNet, avgTarget, loggedDays }: HealthStats['netCalories']) {
    return loggedDays > 0 && Math.abs(avgNet - avgTarget) > avgTarget * 0.1;
}

export function netCaloriesSub(netCalories: HealthStats['netCalories']) {
    if (netCalories.loggedDays === 0) return 'No meal days yet';
    if (!netCaloriesOffTarget(netCalories)) return 'On target after burn';
    const delta = netCalories.avgNet - netCalories.avgTarget;
    return `${delta > 0 ? '+' : ''}${delta.toLocaleString('en-MY')} kcal vs target after burn`;
}

export function formatKcal(value: number) {
    return `${value.toLocaleString('en-MY')} kcal`;
}

export function plural(count: number, word: string) {
    return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** A month of workouts, meals, weigh-ins and steps, shared by the Health tabs. */
export function useHealthData(month: string) {
    const [data, setData] = useState<HealthData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const fingerprintRef = useRef<string | null>(null);

    const loadData = useCallback(async () => {
        const range = monthToDateRange(month);
        const [
            dailyRes,
            exRes,
            prsRes,
            historyRes,
            nutritionRes,
            mealsRes,
            weightRes,
            activityRes,
            settingsRes,
        ] = await Promise.all([
            fetchWorkoutDaily(range),
            fetchWorkoutExercises(range),
            fetchWorkoutPRs(),
            fetchWorkoutHistory(range),
            fetchNutritionDaily(range),
            fetchMeals(range),
            fetchBodyWeightLogs(range),
            fetchDailyActivityLogs(range),
            fetchNutritionSettings(),
        ]);

        setData({
            month,
            workoutSeries: dailyRes.series,
            nutritionSeries: nutritionRes.series,
            topExercises: exRes.top.slice(0, 8),
            weightTrend: exRes.weightTrend,
            prs: prsRes.prs,
            history: historyRes.entries,
            meals: mealsRes.entries,
            bodyWeightLogs: weightRes.entries,
            latestWeight: weightRes.latest,
            previousWeight: weightRes.previous,
            dailyActivity: activityRes.entries,
            nutritionSettings: settingsRes,
        });

        const status = await fetchSyncStatus(month, 'health');
        fingerprintRef.current = status.fingerprint;
    }, [month]);

    useEffect(() => {
        let cancelled = false;
        fingerprintRef.current = null;
        setLoading(true);
        setError(null);

        loadData()
            .catch((err) => {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [loadData]);

    const reload = useCallback(() => {
        loadData().catch((err) => {
            setError(err instanceof Error ? err.message : 'Failed to refresh');
        });
    }, [loadData]);

    const handleStale = useCallback(() => loadData(), [loadData]);

    useSmartRefresh({ month, scope: 'health', fingerprintRef, onStale: handleStale });
    useRefreshSignal(handleStale);

    const stats = useMemo(() => (data ? deriveStats(data) : null), [data]);

    return { data, stats, loading, error, reload };
}
