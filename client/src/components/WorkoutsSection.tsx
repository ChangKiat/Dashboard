import { plural, useHealthData } from '../hooks/useHealthData';
import { useMonth } from '../hooks/useMonth';
import { CalendarCheckIcon, DumbbellIcon, FlameIcon, TrophyIcon } from './icons';
import MonthPicker from './MonthPicker';
import SummaryCard from './SummaryCard';
import WorkoutAnalytics from './WorkoutAnalytics';

function formatShortDate(iso: string) {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
}

/** Training for the month: how often, how much, and which lifts went up. */
export default function WorkoutsSection() {
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
                <p className="muted">Loading workouts…</p>
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

    // Personal records are all-time; count the ones set in this month.
    const monthPrs = data.prs
        .filter((pr) => pr.date.startsWith(`${month}-`))
        .sort((a, b) => (a.date < b.date ? 1 : -1));
    const latestPr = monthPrs[0];

    return (
        <section className="panel">
            {toolbar}
            <div className="summary-grid-4">
                <SummaryCard
                    tone="spend"
                    icon={<DumbbellIcon size={26} />}
                    label="Sessions"
                    value={String(stats.sessions)}
                    sub={
                        stats.sessions > 0
                            ? `${plural(stats.sets, 'set')} · ${Math.round(stats.sets / stats.sessions)} per session`
                            : 'No workouts yet'
                    }
                />
                <SummaryCard
                    tone="income"
                    icon={<CalendarCheckIcon size={26} />}
                    label="Training days"
                    value={`${stats.trainingDays}/${stats.elapsed || '—'}`}
                    sub="Days with a workout"
                />
                <SummaryCard
                    tone="net"
                    icon={<FlameIcon size={26} />}
                    label="Training streak"
                    value={plural(stats.streak.current, 'day')}
                    sub={
                        stats.streak.best > 0
                            ? `Best this month: ${plural(stats.streak.best, 'day')}`
                            : 'No training days yet'
                    }
                />
                <SummaryCard
                    tone="net"
                    icon={<TrophyIcon size={26} />}
                    label="New records"
                    value={String(monthPrs.length)}
                    sub={
                        latestPr
                            ? `Latest: ${latestPr.exercise} ${latestPr.weightKg} kg, ${formatShortDate(latestPr.date)}`
                            : 'No personal records this month'
                    }
                />
            </div>

            <div className="health-grid">
                <WorkoutAnalytics
                    volumeData={data.workoutSeries.map((d) => ({
                        date: d.date,
                        sessions: d.sessionCount,
                        sets: d.totalSets,
                    }))}
                    topExercises={data.topExercises}
                    weightTrend={data.weightTrend}
                    prs={data.prs}
                />
            </div>
        </section>
    );
}
