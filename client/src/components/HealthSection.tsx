import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
    MealEntry,
    NutritionDailyPoint,
    PersonalRecord,
    WorkoutDailyPoint,
    WorkoutEntry,
} from '../api';
import {
    fetchMeals,
    fetchNutritionDaily,
    fetchWorkoutDaily,
    fetchWorkoutExercises,
    fetchWorkoutHistory,
    fetchWorkoutPRs,
} from '../api';
import { monthToDateRange, pickDefaultSelectedDate } from '../utils/dateRange';
import ActivityCalendar from './ActivityCalendar';
import DayDetailPanel from './DayDetailPanel';
import NutritionAnalytics from './NutritionAnalytics';
import SummaryCard from './SummaryCard';
import WorkoutAnalytics from './WorkoutAnalytics';
interface Props {
    month: string;
}

export default function HealthSection({ month }: Props) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState<string>('');

    const [workoutSeries, setWorkoutSeries] = useState<WorkoutDailyPoint[]>([]);
    const [nutritionSeries, setNutritionSeries] = useState<NutritionDailyPoint[]>([]);

    const [volumeData, setVolumeData] = useState<{ date: string; sessions: number; sets: number }[]>([]);
    const [weightTrend, setWeightTrend] = useState<
        Record<string, { date: string; weightKg: number }[]>
    >({});
    const [prs, setPrs] = useState<PersonalRecord[]>([]);
    const [history, setHistory] = useState<WorkoutEntry[]>([]);

    const [meals, setMeals] = useState<MealEntry[]>([]);
    const [avgCalories, setAvgCalories] = useState(0);
    const [avgProtein, setAvgProtein] = useState(0);
    const [calorieTarget, setCalorieTarget] = useState(0);
    const [proteinTarget, setProteinTarget] = useState(0);
    const [bodyWeightKg, setBodyWeightKg] = useState<number | null>(null);

    const loadData = useCallback(async () => {        const range = monthToDateRange(month);
        const [dailyRes, exRes, prsRes, historyRes, nutritionRes, mealsRes] = await Promise.all([
            fetchWorkoutDaily(range),
            fetchWorkoutExercises(range),
            fetchWorkoutPRs(),
            fetchWorkoutHistory(range),
            fetchNutritionDaily(range),
            fetchMeals(range),
        ]);

        setWorkoutSeries(dailyRes.series);
        setNutritionSeries(nutritionRes.series);

        setSelectedDate((prev) => {
            if (prev.startsWith(`${month}-`)) return prev;
            return pickDefaultSelectedDate(month, dailyRes.series, nutritionRes.series);
        });

        setVolumeData(
            dailyRes.series.map((d) => ({
                date: d.date,
                sessions: d.sessionCount,
                sets: d.totalSets,
            }))
        );
        setWeightTrend(exRes.weightTrend);
        setPrs(prsRes.prs);
        setHistory(historyRes.entries);

        setMeals(mealsRes.entries);
        setAvgCalories(nutritionRes.averages.calories);
        setAvgProtein(nutritionRes.averages.protein);
        setCalorieTarget(nutritionRes.targets.calories);
        setProteinTarget(nutritionRes.targets.protein);
        setBodyWeightKg(nutritionRes.targets.bodyWeightKg);
    }, [month]);

    useEffect(() => {
        let cancelled = false;
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
            <h2>Health</h2>
            <div className="health-layout">
                <div className="health-summary-row summary-row">
                    <SummaryCard
                        label="Body weight"
                        value={bodyWeightKg != null ? `${bodyWeightKg} kg` : '—'}
                    />
                    <SummaryCard
                        label="Calories burned"
                        value={`${burnTotals.caloriesBurned} kcal`}
                    />
                    <SummaryCard label="Fat burned" value={`${burnTotals.fatBurnG} g`} />
                    <SummaryCard
                        label="Avg daily calories"
                        value={`${avgCalories} kcal`}
                        sub={`Target: ${calorieTarget} kcal`}
                    />
                    <SummaryCard
                        label="Avg daily protein"
                        value={`${avgProtein} g`}
                        sub={`Target: ${proteinTarget} g`}
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
                            onChanged={handleChanged}
                        />
                    </div>
                )}
                <WorkoutAnalytics
                    volumeData={volumeData}
                    weightTrend={weightTrend}
                    prs={prs}
                />

                <NutritionAnalytics series={nutritionSeries} />
            </div>
        </section>
    );
}

