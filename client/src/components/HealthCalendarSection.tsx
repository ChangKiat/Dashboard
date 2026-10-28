import { useState } from 'react';
import { formatKcal, plural, useHealthData } from '../hooks/useHealthData';
import { useMonth } from '../hooks/useMonth';
import { pickDefaultSelectedDate } from '../utils/dateRange';
import ActivityCalendar from './ActivityCalendar';
import DayDetailPanel from './DayDetailPanel';
import { BoltIcon, FlameIcon, FootprintsIcon, UtensilsIcon } from './icons';
import SummaryCard from './SummaryCard';

/** Month calendar of workouts and meals, with the picked day's entries beside it. */
export default function HealthCalendarSection() {
    const { month, setMonth } = useMonth();
    const { data, stats, loading, error, reload } = useHealthData(month);
    const [pickedDate, setPickedDate] = useState('');

    if (loading) return <section className="panel"><p className="muted">Loading health calendar…</p></section>;
    if (error || !data || !stats) {
        return <section className="panel"><p className="error">{error ?? 'Failed to load'}</p></section>;
    }

    // A day picked in another month falls back to today, or the month's latest active day.
    const selectedDate = pickedDate.startsWith(`${month}-`)
        ? pickedDate
        : pickDefaultSelectedDate(month, data.workoutSeries, data.nutritionSeries);
    const mealDays = data.nutritionSeries.filter((d) => d.mealCount > 0).length;

    return (
        <section className="panel">
            <div className="summary-grid-4">
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
                    tone="income"
                    icon={<FootprintsIcon size={26} />}
                    label="Steps"
                    value={stats.steps.avg > 0 ? `${stats.steps.avg.toLocaleString('en-MY')}/day` : '—'}
                    sub={
                        stats.steps.loggedDays > 0
                            ? `${plural(stats.steps.loggedDays, 'day')} logged`
                            : 'No steps logged yet'
                    }
                />
                <SummaryCard
                    tone="spend"
                    icon={<BoltIcon size={26} />}
                    label="Calories burned"
                    value={formatKcal(stats.caloriesBurned)}
                    sub={
                        stats.bmr != null
                            ? `Incl. BMR (${Math.round(stats.bmr).toLocaleString('en-MY')}/day) + steps`
                            : stats.fatBurnG > 0
                              ? `Fat burned ${stats.fatBurnG} g`
                              : 'Add height/age/sex in Meal goals for BMR'
                    }
                />
                <SummaryCard
                    icon={<UtensilsIcon size={26} />}
                    label="Meal days"
                    value={`${mealDays}/${stats.elapsed || '—'}`}
                    sub="Days with a meal logged"
                />
            </div>

            <div className="health-calendar-row">
                <ActivityCalendar
                    month={month}
                    onMonthChange={setMonth}
                    workoutSeries={data.workoutSeries}
                    nutritionSeries={data.nutritionSeries}
                    selectedDate={selectedDate}
                    onSelectDate={setPickedDate}
                />

                <DayDetailPanel
                    selectedDate={selectedDate}
                    workouts={data.history}
                    meals={data.meals}
                    nutritionSeries={data.nutritionSeries}
                    bodyWeightLog={data.bodyWeightLogs.find((l) => l.date === selectedDate) ?? null}
                    dailyActivityLog={data.dailyActivity.find((a) => a.date === selectedDate) ?? null}
                    onChanged={reload}
                />
            </div>
        </section>
    );
}
