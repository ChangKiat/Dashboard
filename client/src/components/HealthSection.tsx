import { formatKcal, netCaloriesOffTarget, netCaloriesSub, plural, useHealthData } from '../hooks/useHealthData';
import { useMonth } from '../hooks/useMonth';
import BodyAnalytics from './BodyAnalytics';
import { DumbbellIcon, FlameIcon, ScaleIcon, UtensilsIcon } from './icons';
import MonthPicker from './MonthPicker';
import SummaryCard from './SummaryCard';

/** The month at a glance: weight, training, eating and burn. */
export default function HealthSection() {
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
                <p className="muted">Loading health data…</p>
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

    return (
        <section className="panel">
            {toolbar}
            <div className="summary-grid-4">
                <SummaryCard
                    tone="net"
                    icon={<ScaleIcon size={26} />}
                    label="Body weight"
                    value={data.latestWeight ? `${data.latestWeight.weightKg} kg` : '—'}
                    sub={stats.weightSub ?? (data.latestWeight ? 'Latest weigh-in' : 'No weigh-ins this month')}
                />
                <SummaryCard
                    tone="spend"
                    icon={<DumbbellIcon size={26} />}
                    label="Training days"
                    value={`${stats.trainingDays}/${stats.elapsed || '—'}`}
                    sub={`Days with a workout · ${plural(stats.sessions, 'session')}`}
                />
                <SummaryCard
                    tone="income"
                    icon={<UtensilsIcon size={26} />}
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
                <BodyAnalytics bodyWeightLogs={data.bodyWeightLogs} burnSeries={stats.burnSeries} />
            </div>
        </section>
    );
}
