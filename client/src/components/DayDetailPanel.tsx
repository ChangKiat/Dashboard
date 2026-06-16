import { useMemo } from 'react';
import type { MealEntry, WorkoutEntry } from '../api';
import MealHistoryTable from './MealHistoryTable';
import WorkoutHistoryTable from './WorkoutHistoryTable';

interface Props {
    selectedDate: string;
    workouts: WorkoutEntry[];
    meals: MealEntry[];
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

export default function DayDetailPanel({ selectedDate, workouts, meals, onChanged }: Props) {
    const dayWorkouts = useMemo(
        () => workouts.filter((w) => w.date === selectedDate),
        [workouts, selectedDate]
    );
    const dayMeals = useMemo(
        () => meals.filter((m) => m.date === selectedDate),
        [meals, selectedDate]
    );

    return (
        <div className="day-detail-panel">
            <h3>{formatDateLabel(selectedDate)}</h3>
            <div className="day-detail-columns">
                <div className="day-detail-section">
                    <h4>Workouts</h4>
                    <WorkoutHistoryTable entries={dayWorkouts} onChanged={onChanged} compact />
                </div>
                <div className="day-detail-section">
                    <h4>Meals</h4>
                    <MealHistoryTable entries={dayMeals} onChanged={onChanged} compact />
                </div>
            </div>
        </div>
    );
}
