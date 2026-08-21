import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
    BodyWeightLogEntry,
    MealEntry,
    NutritionDailyPoint,
    PersonalRecord,
    WorkoutDailyPoint,
    WorkoutEntry,
} from '../api';
import {
    fetchBodyWeightLogs,
    fetchMeals,
    fetchNutritionDaily,
    fetchSyncStatus,
    fetchWorkoutDaily,
    fetchWorkoutExercises,
    fetchWorkoutHistory,
    fetchWorkoutPRs,
} from '../api';
import { useSmartRefresh } from '../hooks/useSmartRefresh';
import { monthToDateRange, pickDefaultSelectedDate } from '../utils/dateRange';
import ActivityCalendar from './ActivityCalendar';
import BodyAnalytics from './BodyAnalytics';
import DayDetailPanel from './DayDetailPanel';
import { computeMacroAdherence } from './MacroAdherenceStrip';
import NutritionAnalytics from './NutritionAnalytics';
import SummaryCard from './SummaryCard';
import WorkoutAnalytics from './WorkoutAnalytics';

interface Props {
    month: string;
}

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

export default function HealthSection({ month }: Props) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState<string>('');

    const [workoutSeries, setWorkoutSeries] = useState<WorkoutDailyPoint[]>([]);
    const [nutritionSeries, setNutritionSeries] = useState<NutritionDailyPoint[]>([]);

    const [volumeData, setVolumeData] = useState<{ date: string; sessions: number; sets: number }[]>([]);
    const [topExercises, setTopExercises] = useState<{ exercise: string; count: number }[]>([]);
    const [weightTrend, setWeightTrend] = useState<
        Record<string, { date: string; weightKg: number }[]>
    >({});
    const [prs, setPrs] = useState<PersonalRecord[]>([]);
    const [history, setHistory] = useState<WorkoutEntry[]>([]);

    const [meals, setMeals] = useState<MealEntry[]>([]);
    const [bodyWeightLogs, setBodyWeightLogs] = useState<BodyWeightLogEntry[]>([]);
    const [latestWeight, setLatestWeight] = useState<BodyWeightLogEntry | null>(null);
    const [previousWeight, setPreviousWeight] = useState<BodyWeightLogEntry | null>(null);
    const fingerprintRef = useRef<string | null>(null);

    const loadData = useCallback(async (options?: { silent?: boolean }) => {
        const range = monthToDateRange(month);
        const [dailyRes, exRes, prsRes, historyRes, nutritionRes, mealsRes, weightRes] =
            await Promise.all([
                fetchWorkoutDaily(range),
                fetchWorkoutExercises(range),
                fetchWorkoutPRs(),
                fetchWorkoutHistory(range),
                fetchNutritionDaily(range),
                fetchMeals(range),
                fetchBodyWeightLogs(range),
            ]);

        setWorkoutSeries(dailyRes.series);
        setNutritionSeries(nutritionRes.series);

        if (!options?.silent) {
            setSelectedDate((prev) => {
                if (prev.startsWith(`${month}-`)) return prev;
                return pickDefaultSelectedDate(month, dailyRes.series, nutritionRes.series);
            });
        }

        setVolumeData(
            dailyRes.series.map((d) => ({
                date: d.date,
                sessions: d.sessionCount,
                sets: d.totalSets,
            }))
        );
        setTopExercises(exRes.top.slice(0, 8));
        setWeightTrend(exRes.weightTrend);
        setPrs(prsRes.prs);
        setHistory(historyRes.entries);
        setMeals(mealsRes.entries);
        setBodyWeightLogs(weightRes.entries);
        setLatestWeight(weightRes.latest);
        setPreviousWeight(weightRes.previous);

        const status = await fetchSyncStatus(month, 'health');
        fingerprintRef.current = status.fingerprint;
    }, [month]);

    useEffect(() => {
        let cancelled = false;
        fingerprintRef.current = null;
        setLoading(true);
        setError(null);
        setSelectedDate('');

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

    const handleChanged = useCallback(() => {
        loadData().catch((err) => {
            setError(err instanceof Error ? err.message : 'Failed to refresh');
        });
    }, [loadData]);

    const handleStale = useCallback(() => loadData({ silent: true }), [loadData]);

    useSmartRefresh({
        month,
        scope: 'health',
        fingerprintRef,
        onStale: handleStale,
    });

    const burnTotals = useMemo(() => {
        let caloriesBurned = 0;
        let fatBurnG = 0;
        for (const entry of history) {
            if (entry.caloriesBurned != null) caloriesBurned += entry.caloriesBurned;
            if (entry.fatBurnG != null) fatBurnG += entry.fatBurnG;
        }
        return {
            caloriesBurned: Math.round(caloriesBurned),
            fatBurnG: Math.round(fatBurnG * 10) / 10,
        };
    }, [history]);

    const burnSeries = useMemo(() => {
        const byDate = new Map<string, number>();
        for (const entry of history) {
            if (entry.caloriesBurned == null) continue;
            byDate.set(entry.date, (byDate.get(entry.date) ?? 0) + entry.caloriesBurned);
        }
        return [...byDate.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, caloriesBurned]) => ({
                date,
                caloriesBurned: Math.round(caloriesBurned),
            }));
    }, [history]);

    const summaryMetrics = useMemo(() => {
        const trainingDays = workoutSeries.filter((d) => d.sessionCount > 0).length;
        const sessions = workoutSeries.reduce((sum, d) => sum + d.sessionCount, 0);
        const elapsed = monthElapsedDays(month);
        const adherence = computeMacroAdherence(nutritionSeries);
        const displayWeight = latestWeight?.weightKg ?? null;
        return {
            displayWeight,
            weightSub: formatWeightDelta(latestWeight, previousWeight),
            trainingDays,
            elapsed,
            sessions,
            proteinHitPct: adherence.proteinHitPct,
            calorieHitPct: adherence.calorieHitPct,
            loggedMealDays: adherence.loggedDays,
        };
    }, [workoutSeries, nutritionSeries, month, latestWeight, previousWeight]);

    const dayWeightLog = useMemo(
        () => bodyWeightLogs.find((l) => l.date === selectedDate) ?? null,
        [bodyWeightLogs, selectedDate]
    );

    if (loading) {
        return (
            <section className="panel">
                <p className="muted">Loading health data…</p>
            </section>
        );
    }
    if (error) {
        return (
            <section className="panel">
                <p className="error">{error}</p>
            </section>
        );
    }

    return (
        <section className="panel health-section">
            <div className="health-layout">
                <div className="health-summary-row summary-row">
                    <SummaryCard
                        label="Body weight"
                        value={
                            summaryMetrics.displayWeight != null
                                ? `${summaryMetrics.displayWeight} kg`
                                : '—'
                        }
                        sub={summaryMetrics.weightSub}
                    />
                    <SummaryCard
                        label="Training days"
                        value={`${summaryMetrics.trainingDays}/${summaryMetrics.elapsed || '—'}`}
                        sub="Days with a workout"
                    />
                    <SummaryCard
                        label="Sessions"
                        value={String(summaryMetrics.sessions)}
                        sub="This month"
                    />
                    <SummaryCard
                        label="Macro hit rate"
                        value={`${summaryMetrics.proteinHitPct}%`}
                        sub={
                            summaryMetrics.loggedMealDays > 0
                                ? `Protein · cal band ${summaryMetrics.calorieHitPct}%`
                                : 'No meal days yet'
                        }
                    />
                    <SummaryCard
                        label="Calories burned"
                        value={`${burnTotals.caloriesBurned} kcal`}
                        sub={
                            burnTotals.fatBurnG > 0
                                ? `Fat burned ${burnTotals.fatBurnG} g`
                                : undefined
                        }
                    />
                </div>

                <div className="health-calendar">
                    <ActivityCalendar
                        month={month}
                        workoutSeries={workoutSeries}
                        nutritionSeries={nutritionSeries}
                        selectedDate={selectedDate}
                        onSelectDate={setSelectedDate}
                    />
                </div>

                {selectedDate && (
                    <div className="health-day-panel">
                        <DayDetailPanel
                            selectedDate={selectedDate}
                            workouts={history}
                            meals={meals}
                            nutritionSeries={nutritionSeries}
                            bodyWeightLog={dayWeightLog}
                            onChanged={handleChanged}
                        />
                    </div>
                )}

                <WorkoutAnalytics
                    volumeData={volumeData}
                    topExercises={topExercises}
                    weightTrend={weightTrend}
                    prs={prs}
                />

                <NutritionAnalytics series={nutritionSeries} />

                <BodyAnalytics bodyWeightLogs={bodyWeightLogs} burnSeries={burnSeries} />
            </div>
        </section>
    );
}
