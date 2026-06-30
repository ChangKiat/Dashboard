import { useMemo } from 'react';
import type { MealEntry, NutritionDailyPoint, WorkoutEntry } from '../api';
import MealHistoryTable from './MealHistoryTable';
import WorkoutHistoryTable from './WorkoutHistoryTable';

interface Props {
    selectedDate: string;
    workouts: WorkoutEntry[];
    meals: MealEntry[];
    nutritionSeries: NutritionDailyPoint[];
    onChanged: () => void;
}

function formatDateLabel(date: string): string {
    const d = new Date(`${date}T12:00:00`);
    return d.toLocaleDateString('en-MY', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
}

export default function DayDetailPanel({
    selectedDate,
    workouts,
    meals,
    nutritionSeries,
    onChanged,
}: Props) {
    const dayWorkouts = useMemo(
        () => workouts.filter((w) => w.date === selectedDate),
        [workouts, selectedDate]
    );
    const dayMeals = useMemo(
        () => meals.filter((m) => m.date === selectedDate),
        [meals, selectedDate]
    );
    const dayNutrition = useMemo(
        () => nutritionSeries.find((d) => d.date === selectedDate),
        [nutritionSeries, selectedDate]
    );

    return (
        <div className="day-detail-panel">
            <h3>{formatDateLabel(selectedDate)}</h3>
            {dayNutrition && (
                <p className="day-detail-stat">
                    {dayNutrition.calories} kcal · {dayNutrition.protein}g protein
                </p>
            )}
            <div className="day-detail-columns">
                <div className="day-detail-section">
                    <WorkoutHistoryTable
                        entries={dayWorkouts}
                        allEntries={workouts}
                        onChanged={onChanged}
                        compact
                        defaultDate={selectedDate}
                    />
                </div>
                <div className="day-detail-section">
                    <MealHistoryTable
                        entries={dayMeals}
                        onChanged={onChanged}
                        compact
                        defaultDate={selectedDate}
                    />
                </div>
            </div>
        </div>
    );
}
