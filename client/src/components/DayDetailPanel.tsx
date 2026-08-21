import { useEffect, useMemo, useState } from 'react';
import type { BodyWeightLogEntry, MealEntry, NutritionDailyPoint, WorkoutEntry } from '../api';
import { deleteBodyWeightLog, upsertBodyWeightLog } from '../api';
import MealHistoryTable from './MealHistoryTable';
import WorkoutHistoryTable from './WorkoutHistoryTable';

interface Props {
    selectedDate: string;
    workouts: WorkoutEntry[];
    meals: MealEntry[];
    nutritionSeries: NutritionDailyPoint[];
    bodyWeightLog: BodyWeightLogEntry | null;
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
    bodyWeightLog,
    onChanged,
}: Props) {
    const [weightInput, setWeightInput] = useState('');
    const [savingWeight, setSavingWeight] = useState(false);
    const [weightError, setWeightError] = useState<string | null>(null);

    useEffect(() => {
        setWeightInput(bodyWeightLog != null ? String(bodyWeightLog.weightKg) : '');
        setWeightError(null);
    }, [bodyWeightLog, selectedDate]);

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

    const handleSaveWeight = async () => {
        const weightKg = Number(weightInput.trim());
        if (!(weightKg > 0)) {
            setWeightError('Enter a positive weight in kg.');
            return;
        }
        setSavingWeight(true);
        setWeightError(null);
        try {
            await upsertBodyWeightLog({ date: selectedDate, weightKg });
            onChanged();
        } catch (err) {
            setWeightError(err instanceof Error ? err.message : 'Failed to save weight');
        } finally {
            setSavingWeight(false);
        }
    };

    const handleClearWeight = async () => {
        if (!bodyWeightLog) {
            setWeightInput('');
            return;
        }
        setSavingWeight(true);
        setWeightError(null);
        try {
            await deleteBodyWeightLog(bodyWeightLog.id);
            onChanged();
        } catch (err) {
            setWeightError(err instanceof Error ? err.message : 'Failed to clear weight');
        } finally {
            setSavingWeight(false);
        }
    };

    return (
        <div className="day-detail-panel">
            <h3>{formatDateLabel(selectedDate)}</h3>
            {dayNutrition && (
                <p className="day-detail-stat">
                    {dayNutrition.calories} kcal · {dayNutrition.protein}g protein
                </p>
            )}

            <div className="day-detail-section day-body-weight-log">
                <div className="section-header-row">
                    <h4>Body weight</h4>
                    <div className="day-body-weight-actions">
                        <button
                            type="button"
                            className="btn-primary"
                            onClick={handleSaveWeight}
                            disabled={savingWeight}
                        >
                            {savingWeight ? 'Saving…' : 'Log'}
                        </button>
                        {(bodyWeightLog || weightInput) && (
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={handleClearWeight}
                                disabled={savingWeight}
                            >
                                Clear
                            </button>
                        )}
                    </div>
                </div>
                <div className="form-field">
                    <label htmlFor="day-body-weight">Weight (kg)</label>
                    <input
                        id="day-body-weight"
                        type="number"
                        min="1"
                        step="0.1"
                        value={weightInput}
                        onChange={(e) => setWeightInput(e.target.value)}
                        placeholder="e.g. 70.5"
                        disabled={savingWeight}
                    />
                </div>
                {weightError && <p className="error">{weightError}</p>}
            </div>

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
