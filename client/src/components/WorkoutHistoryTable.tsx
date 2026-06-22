import { useEffect, useMemo, useState } from 'react';

import type { WorkoutEntry } from '../api';
import { deleteWorkout, updateWorkout } from '../api';
import { usePagination } from '../hooks/usePagination';
import { formatCell, parseOptionalInt, parseOptionalNumber } from '../utils/tableFormat';
import HealthEntryDetailModal from './HealthEntryDetailModal';
import RecordModal from './RecordModal';
import RowActions from './RowActions';
import TablePagination from './TablePagination';

interface Props {
    entries: WorkoutEntry[];
    onChanged: () => void;
    compact?: boolean;
}

function formatWorkoutSummary(entry: WorkoutEntry): string {
    const parts: string[] = [];
    if (entry.sets != null) parts.push(`${entry.sets} sets`);
    if (entry.reps != null) parts.push(`${entry.reps} reps`);
    if (entry.weightKg != null) parts.push(`${entry.weightKg} kg`);
    if (entry.caloriesBurned != null) parts.push(`${entry.caloriesBurned} kcal`);
    if (entry.fatBurnG != null) parts.push(`${entry.fatBurnG}g fat`);
    return parts.length > 0 ? parts.join(' · ') : '—';
}

export default function WorkoutHistoryTable({ entries, onChanged, compact = false }: Props) {
    const [exerciseFilter, setExerciseFilter] = useState('all');
    const [viewing, setViewing] = useState<WorkoutEntry | null>(null);
    const [editing, setEditing] = useState<WorkoutEntry | null>(null);
    const [form, setForm] = useState({
        date: '',
        exercise: '',
        sets: '',
        reps: '',
        weightKg: '',
        durationMin: '',
        notes: '',
        caloriesBurned: '',
        fatBurnG: '',
    });
    const [saving, setSaving] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const exerciseOptions = useMemo(
        () => [...new Set(entries.map((e) => e.exercise))].sort(),
        [entries]
    );

    const filteredEntries = useMemo(() => {
        if (exerciseFilter === 'all') return entries;
        return entries.filter((e) => e.exercise === exerciseFilter);
    }, [entries, exerciseFilter]);

    const { page, setPage, pageItems, totalPages, totalItems } = usePagination(filteredEntries, {
        pageSize: compact ? 5 : 10,
    });

    useEffect(() => {
        setExerciseFilter('all');
    }, [entries]);

    const openEdit = (entry: WorkoutEntry) => {
        setEditing(entry);
        setForm({
            date: entry.date,
            exercise: entry.exercise,
            sets: entry.sets != null ? String(entry.sets) : '',
            reps: entry.reps != null ? String(entry.reps) : '',
            weightKg: entry.weightKg != null ? String(entry.weightKg) : '',
            durationMin: entry.durationMin != null ? String(entry.durationMin) : '',
            notes: entry.notes ?? '',
            caloriesBurned: entry.caloriesBurned != null ? String(entry.caloriesBurned) : '',
            fatBurnG: entry.fatBurnG != null ? String(entry.fatBurnG) : '',
        });
        setModalError(null);
    };

    const closeEdit = () => {
        setEditing(null);
        setModalError(null);
    };

    const handleSave = async () => {
        if (!editing) return;
        if (!form.date || !form.exercise.trim()) {
            setModalError('Date and exercise are required.');
            return;
        }
        setSaving(true);
        setModalError(null);
        try {
            await updateWorkout(editing.id, {
                date: form.date,
                exercise: form.exercise.trim(),
                sets: parseOptionalInt(form.sets),
                reps: parseOptionalInt(form.reps),
                weightKg: parseOptionalNumber(form.weightKg),
                durationMin: parseOptionalNumber(form.durationMin),
                notes: form.notes.trim() || null,
                caloriesBurned: parseOptionalNumber(form.caloriesBurned),
                fatBurnG: parseOptionalNumber(form.fatBurnG),
            });
            closeEdit();
            onChanged();
        } catch (err) {
            setModalError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (entry: WorkoutEntry) => {
        setActionError(null);
        try {
            await deleteWorkout(entry.id);
            onChanged();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to delete');
        }
    };

    if (entries.length === 0) {
        return <p className="muted">{compact ? 'No workouts logged this day.' : 'No workouts logged in this range.'}</p>;
    }

    const displayEntries = pageItems;

    const editModal = (
        <RecordModal
            title="Edit workout"
            open={editing != null}
            saving={saving}
            error={modalError}
            onClose={closeEdit}
            onSave={handleSave}
        >
            <div className="form-field">
                <label htmlFor="wo-date">Date</label>
                <input
                    id="wo-date"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
            </div>
            <div className="form-field">
                <label htmlFor="wo-exercise">Exercise</label>
                <input
                    id="wo-exercise"
                    type="text"
                    value={form.exercise}
                    onChange={(e) => setForm((f) => ({ ...f, exercise: e.target.value }))}
                />
            </div>
            <div className="form-field">
                <label htmlFor="wo-sets">Sets</label>
                <input
                    id="wo-sets"
                    type="number"
                    min="0"
                    value={form.sets}
                    onChange={(e) => setForm((f) => ({ ...f, sets: e.target.value }))}
                />
            </div>
            <div className="form-field">
                <label htmlFor="wo-reps">Reps</label>
                <input
                    id="wo-reps"
                    type="number"
                    min="0"
                    value={form.reps}
                    onChange={(e) => setForm((f) => ({ ...f, reps: e.target.value }))}
                />
            </div>
            <div className="form-field">
                <label htmlFor="wo-weight">Weight (kg)</label>
                <input
                    id="wo-weight"
                    type="number"
                    min="0"
                    step="0.5"
                    value={form.weightKg}
                    onChange={(e) => setForm((f) => ({ ...f, weightKg: e.target.value }))}
                />
            </div>
            <div className="form-field">
                <label htmlFor="wo-duration">Duration (min)</label>
                <input
                    id="wo-duration"
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.durationMin}
                    onChange={(e) => setForm((f) => ({ ...f, durationMin: e.target.value }))}
                />
            </div>
            <div className="form-field">
                <label htmlFor="wo-calories">Calories burned</label>
                <input
                    id="wo-calories"
                    type="number"
                    min="0"
                    step="1"
                    value={form.caloriesBurned}
                    onChange={(e) => setForm((f) => ({ ...f, caloriesBurned: e.target.value }))}
                />
            </div>
            <div className="form-field">
                <label htmlFor="wo-fat">Fat burned (g)</label>
                <input
                    id="wo-fat"
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.fatBurnG}
                    onChange={(e) => setForm((f) => ({ ...f, fatBurnG: e.target.value }))}
                />
            </div>
            <div className="form-field">
                <label htmlFor="wo-notes">Notes</label>
                <textarea
                    id="wo-notes"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
            </div>
        </RecordModal>
    );

    if (compact) {
        if (filteredEntries.length === 0) {
            return <p className="muted">No workouts match this exercise.</p>;
        }

        return (
            <>
                {actionError && <p className="error">{actionError}</p>}
                <ul className="day-entry-list">
                    {displayEntries.map((entry) => (
                        <li key={entry.id} className="day-entry-card">
                            <button
                                type="button"
                                className="day-entry-main day-entry-main--clickable"
                                onClick={() => setViewing(entry)}
                            >
                                <span className="day-entry-title">{entry.exercise}</span>
                                <span className="day-entry-sub">{formatWorkoutSummary(entry)}</span>
                            </button>
                            <RowActions
                                onEdit={() => openEdit(entry)}
                                onDelete={() => handleDelete(entry)}
                                deleteLabel={`this ${entry.exercise} entry`}
                            />
                        </li>
                    ))}
                </ul>
                {totalPages > 1 && (
                    <TablePagination
                        page={page}
                        totalPages={totalPages}
                        totalItems={totalItems}
                        onPageChange={setPage}
                    />
                )}
                {viewing && (
                    <HealthEntryDetailModal
                        type="workout"
                        entry={viewing}
                        onClose={() => setViewing(null)}
                        onEdit={() => {
                            const entry = viewing;
                            setViewing(null);
                            openEdit(entry);
                        }}
                        onDelete={async () => {
                            await handleDelete(viewing);
                            setViewing(null);
                        }}
                    />
                )}
                {editModal}
            </>
        );
    }

    return (
        <>
            {actionError && <p className="error">{actionError}</p>}
            <div className="history-log-table">
                <div className="transactions-toolbar">
                    <select
                        className="chart-select"
                        value={exerciseFilter}
                        onChange={(e) => setExerciseFilter(e.target.value)}
                        aria-label="Filter by exercise"
                    >
                        <option value="all">All exercises</option>
                        {exerciseOptions.map((exercise) => (
                            <option key={exercise} value={exercise}>
                                {exercise}
                            </option>
                        ))}
                    </select>
                </div>
                {filteredEntries.length === 0 ? (
                    <p className="muted">No workouts match this exercise.</p>
                ) : (
                    <>
                        <div className="table-scroll">
                            <table className="data-table data-table--workouts">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Exercise</th>
                                        <th>Sets</th>
                                        <th>Reps</th>
                                        <th className="col-weight">Weight (kg)</th>
                                        <th className="col-duration">Duration (min)</th>
                                        <th className="col-calories">Calories</th>
                                        <th className="col-fat">Fat (g)</th>
                                        <th className="col-notes">Notes</th>
                                        <th className="actions-col">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pageItems.map((entry) => (
                                        <tr key={entry.id}>
                                            <td>{entry.date}</td>
                                            <td>{entry.exercise}</td>
                                            <td>{formatCell(entry.sets)}</td>
                                            <td>{formatCell(entry.reps)}</td>
                                            <td className="col-weight">{formatCell(entry.weightKg)}</td>
                                            <td className="col-duration">{formatCell(entry.durationMin)}</td>
                                            <td className="col-calories">{formatCell(entry.caloriesBurned)}</td>
                                            <td className="col-fat">{formatCell(entry.fatBurnG)}</td>
                                            <td className="notes-cell col-notes">{formatCell(entry.notes)}</td>
                                            <td>
                                                <RowActions
                                                    onEdit={() => openEdit(entry)}
                                                    onDelete={() => handleDelete(entry)}
                                                    deleteLabel={`this ${entry.exercise} entry`}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <TablePagination
                            page={page}
                            totalPages={totalPages}
                            totalItems={totalItems}
                            onPageChange={setPage}
                        />
                    </>
                )}
            </div>
            {editModal}
        </>
    );
}
