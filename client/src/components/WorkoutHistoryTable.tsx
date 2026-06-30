import { useCallback, useEffect, useMemo, useState } from 'react';

import type { WorkoutEntry, WorkoutSession } from '../api';
import { createWorkout, deleteWorkout, updateWorkout } from '../api';
import { usePagination } from '../hooks/usePagination';
import { formatCell, parseOptionalInt, parseOptionalNumber } from '../utils/tableFormat';
import {
    formatExerciseLine,
    formatSessionSummary,
    formatWorkoutEntrySummary,
    listSameDaySessions,
    toWorkoutDisplayItems,
    type WorkoutDisplayItem,
} from '../utils/workoutSessions';
import HealthEntryDetailModal from './HealthEntryDetailModal';
import RecordModal from './RecordModal';
import RowActions from './RowActions';
import TablePagination from './TablePagination';
import WorkoutSessionDetailModal from './WorkoutSessionDetailModal';

type ModalMode = 'closed' | 'create' | 'edit';
type SessionMode = 'standalone' | 'new' | 'join';

interface Props {
    entries: WorkoutEntry[];
    allEntries?: WorkoutEntry[];
    onChanged: () => void;
    compact?: boolean;
    defaultDate?: string;
}

function resolveSessionFields(
    sessionMode: SessionMode,
    sessionLabel: string,
    existingSessionId: string,
    sameDaySessions: { sessionId: string; sessionLabel: string | null }[]
): { sessionId: string | null; sessionLabel: string | null } | 'invalid' {
    if (sessionMode === 'standalone') {
        return { sessionId: null, sessionLabel: null };
    }
    if (sessionMode === 'new') {
        const label = sessionLabel.trim();
        if (!label) return 'invalid';
        return { sessionId: crypto.randomUUID(), sessionLabel: label };
    }
    if (!existingSessionId) return 'invalid';
    const match = sameDaySessions.find((s) => s.sessionId === existingSessionId);
    return {
        sessionId: existingSessionId,
        sessionLabel: match?.sessionLabel ?? null,
    };
}

export default function WorkoutHistoryTable({
    entries,
    allEntries = [],
    onChanged,
    compact = false,
    defaultDate,
}: Props) {
    const [exerciseFilter, setExerciseFilter] = useState('all');
    const [viewing, setViewing] = useState<WorkoutEntry | null>(null);
    const [viewingSession, setViewingSession] = useState<WorkoutSession | null>(null);
    const [modalMode, setModalMode] = useState<ModalMode>('closed');
    const [editingEntry, setEditingEntry] = useState<WorkoutEntry | null>(null);
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
    const [sessionMode, setSessionMode] = useState<SessionMode>('standalone');
    const [sessionLabel, setSessionLabel] = useState('');
    const [existingSessionId, setExistingSessionId] = useState('');
    const [saving, setSaving] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const showSessionFields = defaultDate != null;

    const sameDaySessions = useMemo(
        () => listSameDaySessions(allEntries.length > 0 ? allEntries : entries, form.date || defaultDate || ''),
        [allEntries, entries, form.date, defaultDate]
    );

    const exerciseOptions = useMemo(
        () => [...new Set(entries.map((e) => e.exercise))].sort(),
        [entries]
    );

    const filteredEntries = useMemo(() => {
        if (exerciseFilter === 'all') return entries;
        return entries.filter((e) => e.exercise === exerciseFilter);
    }, [entries, exerciseFilter]);

    const displayItems = useMemo(
        () => (compact ? toWorkoutDisplayItems(filteredEntries) : []),
        [compact, filteredEntries]
    );

    const paginationSource = compact ? displayItems : filteredEntries;

    const { page, setPage, pageItems, totalPages, totalItems } = usePagination(paginationSource, {
        pageSize: compact ? 5 : 10,
    });

    useEffect(() => {
        setExerciseFilter('all');
    }, [entries]);

    const resetSessionForm = useCallback(
        (entry?: WorkoutEntry) => {
            if (entry?.sessionId) {
                setSessionMode('join');
                setExistingSessionId(entry.sessionId);
                setSessionLabel(entry.sessionLabel ?? '');
            } else {
                setSessionMode('standalone');
                setExistingSessionId('');
                setSessionLabel('');
            }
        },
        []
    );

    const openCreate = useCallback(() => {
        setModalMode('create');
        setEditingEntry(null);
        setForm({
            date: defaultDate ?? '',
            exercise: '',
            sets: '',
            reps: '',
            weightKg: '',
            durationMin: '',
            notes: '',
            caloriesBurned: '',
            fatBurnG: '',
        });
        resetSessionForm();
        setModalError(null);
    }, [defaultDate, resetSessionForm]);

    const openEdit = (entry: WorkoutEntry) => {
        setModalMode('edit');
        setEditingEntry(entry);
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
        resetSessionForm(entry);
        setModalError(null);
    };

    const closeModal = () => {
        setModalMode('closed');
        setEditingEntry(null);
        setModalError(null);
    };

    const handleSave = async () => {
        if (!form.date || !form.exercise.trim()) {
            setModalError('Date and exercise are required.');
            return;
        }

        let sessionFields: { sessionId: string | null; sessionLabel: string | null } | undefined;
        if (showSessionFields) {
            const resolved = resolveSessionFields(
                sessionMode,
                sessionLabel,
                existingSessionId,
                sameDaySessions
            );
            if (resolved === 'invalid') {
                setModalError(
                    sessionMode === 'new'
                        ? 'Session label is required for a new session.'
                        : 'Select an existing session to join.'
                );
                return;
            }
            sessionFields = resolved;
        }

        setSaving(true);
        setModalError(null);
        try {
            const payload = {
                date: form.date,
                exercise: form.exercise.trim(),
                sets: parseOptionalInt(form.sets),
                reps: parseOptionalInt(form.reps),
                weightKg: parseOptionalNumber(form.weightKg),
                durationMin: parseOptionalNumber(form.durationMin),
                notes: form.notes.trim() || null,
                caloriesBurned: parseOptionalNumber(form.caloriesBurned),
                fatBurnG: parseOptionalNumber(form.fatBurnG),
                ...(sessionFields ?? {}),
            };
            if (modalMode === 'create') {
                await createWorkout(payload);
            } else if (editingEntry) {
                await updateWorkout(editingEntry.id, payload);
            }
            closeModal();
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

    const renderExerciseRow = (entry: WorkoutEntry) => (
        <li key={entry.id} className="day-entry-card">
            <button
                type="button"
                className="day-entry-main day-entry-main--clickable"
                onClick={() => setViewing(entry)}
            >
                <span className="day-entry-title">{formatExerciseLine(entry)}</span>
                <span className="day-entry-sub">{formatWorkoutEntrySummary(entry)}</span>
            </button>
            <RowActions
                onEdit={() => openEdit(entry)}
                onDelete={() => handleDelete(entry)}
                deleteLabel={entry.exercise}
                confirmTitle="Remove exercise?"
                confirmMessage={`"${entry.exercise}" will be permanently removed.`}
            />
        </li>
    );

    const renderDisplayItem = (item: WorkoutDisplayItem) => {
        if (item.type === 'standalone') {
            return renderExerciseRow(item.entry);
        }

        return (
            <li key={item.session.sessionId} className="day-entry-card workout-session-summary-card">
                <button
                    type="button"
                    className="day-entry-main day-entry-main--clickable"
                    onClick={() => setViewingSession(item.session)}
                >
                    <span className="day-entry-title">
                        {item.session.sessionLabel || 'Workout'}
                    </span>
                    <span className="day-entry-sub">{formatSessionSummary(item.session)}</span>
                </button>
            </li>
        );
    };

    if (entries.length === 0 && defaultDate == null) {
        return <p className="muted">{compact ? 'No workouts logged this day.' : 'No workouts logged in this range.'}</p>;
    }

    const recordModal = (
        <RecordModal
            title={modalMode === 'create' ? 'Add workout' : 'Edit workout'}
            open={modalMode !== 'closed'}
            saving={saving}
            error={modalError}
            onClose={closeModal}
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
            {showSessionFields && (
                <>
                    <div className="form-field">
                        <label htmlFor="wo-session-mode">Session</label>
                        <select
                            id="wo-session-mode"
                            value={sessionMode}
                            onChange={(e) => setSessionMode(e.target.value as SessionMode)}
                        >
                            <option value="standalone">Standalone exercise</option>
                            <option value="new">New session</option>
                            {sameDaySessions.length > 0 && (
                                <option value="join">Join existing session</option>
                            )}
                        </select>
                    </div>
                    {sessionMode === 'new' && (
                        <div className="form-field">
                            <label htmlFor="wo-session-label">Session label</label>
                            <input
                                id="wo-session-label"
                                type="text"
                                placeholder="e.g. Shoulder + Abs day"
                                value={sessionLabel}
                                onChange={(e) => setSessionLabel(e.target.value)}
                            />
                        </div>
                    )}
                    {sessionMode === 'join' && (
                        <div className="form-field">
                            <label htmlFor="wo-session-existing">Existing session</label>
                            <select
                                id="wo-session-existing"
                                value={existingSessionId}
                                onChange={(e) => setExistingSessionId(e.target.value)}
                            >
                                <option value="">Select session</option>
                                {sameDaySessions.map((session) => (
                                    <option key={session.sessionId} value={session.sessionId}>
                                        {session.sessionLabel || 'Workout'}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </>
            )}
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
        if (filteredEntries.length === 0 && entries.length > 0) {
            return <p className="muted">No workouts match this exercise.</p>;
        }

        const compactItems = pageItems as WorkoutDisplayItem[];

        return (
            <>
                {defaultDate != null && (
                    <div className="section-header-row">
                        <h4>Workouts</h4>
                        <button type="button" className="btn-add" onClick={openCreate}>
                            + Add
                        </button>
                    </div>
                )}
                {actionError && <p className="error">{actionError}</p>}
                {filteredEntries.length === 0 ? (
                    <p className="muted">No workouts logged this day.</p>
                ) : (
                    <>
                        <ul className="day-entry-list">
                            {compactItems.map((item) => renderDisplayItem(item))}
                        </ul>
                        {totalPages > 1 && (
                            <TablePagination
                                page={page}
                                totalPages={totalPages}
                                totalItems={totalItems}
                                onPageChange={setPage}
                            />
                        )}
                    </>
                )}
                {viewingSession && (
                    <WorkoutSessionDetailModal
                        session={viewingSession}
                        onClose={() => setViewingSession(null)}
                        onEdit={(entry) => {
                            setViewingSession(null);
                            openEdit(entry);
                        }}
                        onDelete={async (entry) => {
                            await handleDelete(entry);
                            setViewingSession((prev) => {
                                if (!prev) return null;
                                const remaining = prev.exercises.filter((e) => e.id !== entry.id);
                                return remaining.length > 0
                                    ? { ...prev, exercises: remaining }
                                    : null;
                            });
                        }}
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
                {recordModal}
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
                                        <th>Session</th>
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
                                    {(pageItems as WorkoutEntry[]).map((entry) => (
                                        <tr key={entry.id}>
                                            <td>{entry.date}</td>
                                            <td>{formatCell(entry.sessionLabel)}</td>
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
            {recordModal}
        </>
    );
}
