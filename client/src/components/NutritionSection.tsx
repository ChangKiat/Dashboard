import { useCallback, useEffect, useState } from 'react';
import type { DateRange, MealEntry, NutritionDailyPoint } from '../api';
import { fetchMeals, fetchNutritionDaily } from '../api';
import NutritionLineChart from '../charts/NutritionLineChart';
import MealHistoryTable from './MealHistoryTable';
import SummaryCard from './SummaryCard';

interface Props {
    range: DateRange;
}

export default function NutritionSection({ range }: Props) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [series, setSeries] = useState<NutritionDailyPoint[]>([]);
    const [meals, setMeals] = useState<MealEntry[]>([]);
    const [avgCalories, setAvgCalories] = useState(0);
    const [avgProtein, setAvgProtein] = useState(0);
    const [calorieTarget, setCalorieTarget] = useState(0);
    const [proteinTarget, setProteinTarget] = useState(0);
    const [mealCount, setMealCount] = useState(0);

    const loadData = useCallback(async () => {
        const [dailyRes, mealsRes] = await Promise.all([
            fetchNutritionDaily(range),
            fetchMeals(range),
        ]);
        setSeries(dailyRes.series);
        setMeals(mealsRes.entries);
        setAvgCalories(dailyRes.averages.calories);
        setAvgProtein(dailyRes.averages.protein);
        setCalorieTarget(dailyRes.targets.calories);
        setProteinTarget(dailyRes.targets.protein);
        setMealCount(dailyRes.totals.mealCount);
    }, [range]);

    useEffect(() => {
        let cancelled = false;
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

    const handleChanged = useCallback(() => {
        loadData().catch((err) => {
            setError(err instanceof Error ? err.message : 'Failed to refresh');
        });
    }, [loadData]);

    if (loading) return <section className="panel"><p className="muted">Loading nutrition…</p></section>;
    if (error) return <section className="panel"><p className="error">{error}</p></section>;

    return (
        <section className="panel">
            <h2>Meals & Nutrition</h2>
            <div className="summary-row">
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
                <SummaryCard label="Meals logged" value={String(mealCount)} />
            </div>
            <div className="chart-card full-width">
                <h3>Daily macros</h3>
                <NutritionLineChart series={series} />
            </div>
            <div className="chart-card full-width">
                <h3>Meal log</h3>
                <MealHistoryTable entries={meals} onChanged={handleChanged} />
            </div>
        </section>
    );
}
