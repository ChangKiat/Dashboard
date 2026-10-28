import {
    formatKcal,
    netCaloriesOffTarget,
    netCaloriesSub,
    plural,
    useHealthData,
} from '../hooks/useHealthData';
import { useMonth } from '../hooks/useMonth';
import { BoltIcon, FlameIcon, TargetIcon, UtensilsIcon } from './icons';
import MonthPicker from './MonthPicker';
import NutritionAnalytics from './NutritionAnalytics';
import SummaryCard from './SummaryCard';

/** Eating for the month: calories and protein against the Meal goals targets. */
export default function MealsSection() {
    const { month, setMonth } = useMonth();
    const { data, stats, loading, error } = useHealthData(month);

    const toolbar = (
        <div className="page-toolbar">
            <div className="page-toolbar-group">
                <MonthPicker month={month} onChange={setMonth} />
            </div>
        </div>
    );

    if (loading) {
        return (
            <section className="panel">
                {toolbar}
                <p className="muted">Loading meals…</p>
            </section>
        );
    }
    if (error || !data || !stats) {
        return (
            <section className="panel">
                {toolbar}
                <p className="error">{error ?? 'Failed to load'}</p>
            </section>
        );
    }

    const { adherence, netCalories } = stats;
    // Daily averages over the days with something logged.
    const logged = data.nutritionSeries.filter((d) => d.mealCount > 0 || d.calories > 0 || d.protein > 0);
    const average = (pick: (d: (typeof logged)[number]) => number) =>
        logged.length > 0 ? Math.round(logged.reduce((sum, d) => sum + pick(d), 0) / logged.length) : 0;
    const avgCalories = average((d) => d.calories);
    const avgCalorieTarget = average((d) => d.targets.calories);
    const avgProtein = average((d) => d.protein);
    const avgProteinTarget = average((d) => d.targets.protein);

    return (
        <section className="panel">
            {toolbar}
            <div className="summary-grid-4">
                <SummaryCard
                    tone="spend"
                    icon={<UtensilsIcon size={26} />}
                    label="Calories eaten"
                    value={logged.length > 0 ? `${formatKcal(avgCalories)}/day` : '—'}
                    sub={
                        logged.length > 0
                            ? `Target ${formatKcal(avgCalorieTarget)} · ${plural(logged.length, 'day')} logged`
                            : 'No meal days yet'
                    }
                />
                <SummaryCard
                    tone="income"
                    icon={<BoltIcon size={26} />}
                    label="Protein"
                    value={logged.length > 0 ? `${avgProtein} g/day` : '—'}
                    sub={logged.length > 0 ? `Target ${avgProteinTarget} g` : 'No meal days yet'}
                    variant={logged.length > 0 && avgProtein < avgProteinTarget ? 'warning' : 'default'}
                />
                <SummaryCard
                    tone="income"
                    icon={<TargetIcon size={26} />}
                    label="Protein hit rate"
                    value={adherence.loggedDays > 0 ? `${adherence.proteinHitPct}%` : '—'}
                    sub={
                        adherence.loggedDays > 0
                            ? `Calories in band ${adherence.calorieHitPct}% of days`
                            : 'No meal days yet'
                    }
                />
                <SummaryCard
                    tone="net"
                    icon={<FlameIcon size={26} />}
                    label="Net calories"
                    value={netCalories.loggedDays > 0 ? `${formatKcal(netCalories.avgNet)}/day` : '—'}
                    sub={netCaloriesSub(netCalories)}
                    variant={netCaloriesOffTarget(netCalories) ? 'warning' : 'default'}
                />
            </div>

            <div className="health-grid">
                <NutritionAnalytics series={data.nutritionSeries} netCalorieSeries={stats.netCalorieSeries} />
            </div>
        </section>
    );
}
