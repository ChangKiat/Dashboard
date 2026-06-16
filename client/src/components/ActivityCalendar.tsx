import { useMemo } from 'react';
import type { NutritionDailyPoint, WorkoutDailyPoint } from '../api';
import { getCalendarCells, todayInKL } from '../utils/dateRange';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Props {
    month: string;
    workoutSeries: WorkoutDailyPoint[];
    nutritionSeries: NutritionDailyPoint[];
    selectedDate: string;
    onSelectDate: (date: string) => void;
}

export default function ActivityCalendar({
    month,
    workoutSeries,
    nutritionSeries,
    selectedDate,
    onSelectDate,
}: Props) {
    const cells = useMemo(() => getCalendarCells(month), [month]);
    const today = todayInKL();

    const sessionByDate = useMemo(() => {
        const map = new Map<string, number>();
        for (const d of workoutSeries) {
            map.set(d.date, d.sessionCount);
        }
        return map;
    }, [workoutSeries]);

    const mealsByDate = useMemo(() => {
        const map = new Map<string, number>();
        for (const d of nutritionSeries) {
            map.set(d.date, d.mealCount);
        }
        return map;
    }, [nutritionSeries]);

    return (
        <div className="activity-calendar">
            <div className="activity-calendar-header">
                <h3>Activity calendar</h3>
                <div className="activity-calendar-legend">
                    <span className="legend-item">
                        <span className="legend-dot workout" aria-hidden="true" />
                        Workout
                    </span>
                    <span className="legend-item">
                        <span className="legend-dot meal" aria-hidden="true" />
                        Meal
                    </span>
                </div>
            </div>
            <div className="activity-calendar-weekdays">
                {WEEKDAYS.map((day) => (
                    <span key={day} className="activity-calendar-weekday">
                        {day}
                    </span>
                ))}
            </div>
            <div className="activity-calendar-grid" role="grid" aria-label="Monthly activity calendar">
                {cells.map((date, i) => {
                    if (date == null) {
                        return <div key={`pad-${i}`} className="activity-calendar-cell empty" />;
                    }

                    const dayNum = parseInt(date.slice(8), 10);
                    const sessions = sessionByDate.get(date) ?? 0;
                    const meals = mealsByDate.get(date) ?? 0;
                    const isToday = date === today;
                    const isSelected = date === selectedDate;

                    return (
                        <button
                            key={date}
                            type="button"
                            role="gridcell"
                            className={[
                                'activity-calendar-cell',
                                isToday ? 'today' : '',
                                isSelected ? 'selected' : '',
                            ]
                                .filter(Boolean)
                                .join(' ')}
                            aria-label={`${date}${sessions ? `, ${sessions} workout${sessions !== 1 ? 's' : ''}` : ''}${meals ? `, ${meals} meal${meals !== 1 ? 's' : ''}` : ''}`}
                            aria-selected={isSelected}
                            onClick={() => onSelectDate(date)}
                        >
                            <span className="activity-calendar-day">{dayNum}</span>
                            <span className="activity-calendar-badges">
                                {sessions > 0 && (
                                    <span className="activity-badge workout" title={`${sessions} session${sessions !== 1 ? 's' : ''}`}>
                                        {sessions}
                                    </span>
                                )}
                                {meals > 0 && (
                                    <span className="activity-badge meal" title={`${meals} meal${meals !== 1 ? 's' : ''}`}>
                                        {meals}
                                    </span>
                                )}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
