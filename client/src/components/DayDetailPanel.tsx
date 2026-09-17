import { useEffect, useMemo, useState } from 'react';
import type {
    BodyWeightLogEntry,
    DailyActivityLogEntry,
    MealEntry,
    NutritionDailyPoint,
    WorkoutEntry,
} from '../api';
import { upsertBodyWeightLog, upsertDailyActivityLog } from '../api';
import MealHistoryTable from './MealHistoryTable';
import WorkoutHistoryTable from './WorkoutHistoryTable';

interface Props {
    selectedDate: string;
    workouts: WorkoutEntry[];
    meals: MealEntry[];
    nutritionSeries: NutritionDailyPoint[];
    bodyWeightLog: BodyWeightLogEntry | null;
    dailyActivityLog: DailyActivityLogEntry | null;
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
    dailyActivityLog,
    onChanged,
}: Props) {
    const [weightInput, setWeightInput] = useState('');
    const [stepsInput, setStepsInput] = useState('');
    const [savingLog, setSavingLog] = useState(false);
    const [logError, setLogError] = useState<string | null>(null);

    useEffect(() => {
        setWeightInput(bodyWeightLog != null ? String(bodyWeightLog.weightKg) : '');
        setStepsInput(dailyActivityLog != null ? String(dailyActivityLog.steps) : '');
        setLogError(null);
    }, [bodyWeightLog, dailyActivityLog, selectedDate]);

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

    const handleSaveLog = async () => {
        const trimmedWeight = weightInput.trim();
        const trimmedSteps = stepsInput.trim();
        if (trimmedWeight === '' && trimmedSteps === '') {
            setLogError('Enter a weight and/or step count.');
            return;
        }
        const weightKg = trimmedWeight === '' ? null : Number(trimmedWeight);
        if (weightKg !== null && !(weightKg > 0)) {
            setLogError('Weight must be a positive number.');
            return;
        }
        const steps = trimmedSteps === '' ? null : Number(trimmedSteps);
        if (steps !== null && (!(steps >= 0) || !Number.isFinite(steps))) {
            setLogError('Steps must be a non-negative number.');
            return;
        }

        setSavingLog(true);
        setLogError(null);
        try {
            await Promise.all([
                weightKg !== null ? upsertBodyWeightLog({ date: selectedDate, weightKg }) : null,
                steps !== null ? upsertDailyActivityLog({ date: selectedDate, steps }) : null,
            ]);
            onChanged();
        } catch (err) {
            setLogError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSavingLog(false);
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
                    <h4>Body weight & steps</h4>
                    <button
                        type="button"
                        className="btn-primary"
                        onClick={handleSaveLog}
                        disabled={savingLog}
                    >
                        {savingLog ? 'Saving…' : 'Log'}
                    </button>
                </div>
                <div className="day-detail-columns">
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
                            disabled={savingLog}
                        />
                    </div>
                    <div className="form-field">
                        <label htmlFor="day-steps">Steps</label>
                        <input
                            id="day-steps"
                            type="number"
                            min="0"
                            step="1"
                            value={stepsInput}
                            onChange={(e) => setStepsInput(e.target.value)}
                            placeholder="e.g. 8000"
                            disabled={savingLog}
                        />
                    </div>
                </div>
                {logError && <p className="error">{logError}</p>}
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
