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
type WeightMode = 'same' | 'progressive';

const NEW_SESSION = '__new__';

interface Props {
    entries: WorkoutEntry[];
    allEntries?: WorkoutEntry[];
    onChanged: () => void;
    compact?: boolean;
    defaultDate?: string;
}

function resolveSessionFields(
    inSession: boolean,
    sessionChoice: string,
    sessionLabel: string,
    sameDaySessions: { sessionId: string; sessionLabel: string | null }[]
): { sessionId: string | null; sessionLabel: string | null } | 'invalid' {
    if (!inSession) {
        return { sessionId: null, sessionLabel: null };
    }
    if (sessionChoice === NEW_SESSION) {
        const label = sessionLabel.trim();
        if (!label) return 'invalid';
        return { sessionId: crypto.randomUUID(), sessionLabel: label };
    }
    if (!sessionChoice) return 'invalid';
    const match = sameDaySessions.find((s) => s.sessionId === sessionChoice);
    return {
        sessionId: sessionChoice,
        sessionLabel: match?.sessionLabel ?? null,
    };
}

function pickDefaultSession(
    sessions: { sessionId: string; sessionLabel: string | null }[]
): string {
    if (sessions.length === 0) return NEW_SESSION;
    return [...sessions].sort((a, b) => b.sessionId.localeCompare(a.sessionId))[0].sessionId;
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
        weightsKg: '',
        durationMin: '',
        notes: '',
        caloriesBurned: '',
        fatBurnG: '',
        supersetGroup: '',
    });
    const [inSession, setInSession] = useState(false);
    const [sessionChoice, setSessionChoice] = useState(NEW_SESSION);
    const [sessionLabel, setSessionLabel] = useState('');
    const [weightMode, setWeightMode] = useState<WeightMode>('same');
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

    const { page, setPage, pageItems, totalPages, totalItems } = usePagination<
        WorkoutEntry | WorkoutDisplayItem
    >(paginationSource, {
        pageSize: compact ? 5 : 10,
    });

    useEffect(() => {
        setExerciseFilter('all');
    }, [entries]);

    const resetSessionForm = useCallback(
        (entry?: WorkoutEntry, sessions: { sessionId: string; sessionLabel: string | null }[] = []) => {
            if (entry?.sessionId) {
                setInSession(true);
                setSessionChoice(entry.sessionId);
                setSessionLabel(entry.sessionLabel ?? '');
            } else if (sessions.length > 0) {
                setInSession(true);
                setSessionChoice(pickDefaultSession(sessions));
                setSessionLabel('');
            } else {
                setInSession(false);
                setSessionChoice(NEW_SESSION);
                setSessionLabel('');
            }
        },
        []
    );

    const openCreate = useCallback(() => {
        const daySessions = listSameDaySessions(
            allEntries.length > 0 ? allEntries : entries,
            defaultDate ?? ''
        );
        setModalMode('create');
        setEditingEntry(null);
        setForm({
            date: defaultDate ?? '',
            exercise: '',
            sets: '',
            reps: '',
            weightKg: '',
            weightsKg: '',
            durationMin: '',
            notes: '',
            caloriesBurned: '',
            fatBurnG: '',
            supersetGroup: '',
        });
        setWeightMode('same');
        resetSessionForm(undefined, daySessions);
        setModalError(null);
    }, [allEntries, defaultDate, entries, resetSessionForm]);

    const openEdit = (entry: WorkoutEntry) => {
        setModalMode('edit');
        setEditingEntry(entry);
        setForm({
            date: entry.date,
            exercise: entry.exercise,
            sets: entry.sets != null ? String(entry.sets) : '',
            reps: entry.reps != null ? String(entry.reps) : '',
            weightKg: entry.weightKg != null ? String(entry.weightKg) : '',
            weightsKg: entry.weightsKg ?? '',
            durationMin: entry.durationMin != null ? String(entry.durationMin) : '',
            notes: entry.notes ?? '',
            caloriesBurned: entry.caloriesBurned != null ? String(entry.caloriesBurned) : '',
            fatBurnG: entry.fatBurnG != null ? String(entry.fatBurnG) : '',
            supersetGroup: entry.supersetGroup != null ? String(entry.supersetGroup) : '',
        });
        setWeightMode(entry.weightsKg ? 'progressive' : 'same');
        resetSessionForm(entry, sameDaySessions);
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
                inSession,
                sessionChoice,
                sessionLabel,
                sameDaySessions
            );
            if (resolved === 'invalid') {
                setModalError(
                    sessionChoice === NEW_SESSION
                        ? 'Session label is required for a new session.'
                        : 'Select a session.'
                );
                return;
            }
            sessionFields = resolved;
        }

        setSaving(true);
        setModalError(null);
        try {
            const weightsKg =
                weightMode === 'progressive' ? form.weightsKg.trim() || null : null;
            const weightKg =
                weightMode === 'same' ? parseOptionalNumber(form.weightKg) : null;
            const supersetRaw = form.supersetGroup.trim();
            const supersetGroup =
                supersetRaw === ''
                    ? null
                    : (() => {
                          const n = parseInt(supersetRaw, 10);
                          return Number.isInteger(n) && n >= 1 ? n : ('invalid' as const);
                      })();
            if (supersetGroup === 'invalid') {
                setModalError('Superset group must be a positive integer (e.g. 1).');
                return;
            }

            const payload = {
                date: form.date,
                exercise: form.exercise.trim(),
                sets: parseOptionalInt(form.sets),
                reps: parseOptionalInt(form.reps),
                weightKg,
                weightsKg,
                durationMin: parseOptionalNumber(form.durationMin),
                notes: form.notes.trim() || null,
                caloriesBurned: parseOptionalNumber(form.caloriesBurned),
                fatBurnG: parseOptionalNumber(form.fatBurnG),
                supersetGroup,
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
            className="workout-record-modal"
        >
            <div className="workout-form-grid">
                {!showSessionFields && (
                    <div className="form-field span-full">
                        <label htmlFor="wo-date">Date</label>
                        <input
                            id="wo-date"
                            type="date"
                            value={form.date}
                            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                        />
                    </div>
                )}

                {showSessionFields && (
                    <div className="workout-session-block span-full">
                        <div className="form-field">
                            <label>Type</label>
                            <div className="segment-toggle" role="group" aria-label="Exercise type">
                                <button
                                    type="button"
                                    className={!inSession ? 'active' : ''}
                                    onClick={() => setInSession(false)}
                                >
                                    Single exercise
                                </button>
                                <button
                                    type="button"
                                    className={inSession ? 'active' : ''}
                                    onClick={() => {
                                        setInSession(true);
                                        if (sessionChoice === NEW_SESSION && sameDaySessions.length > 0) {
                                            setSessionChoice(pickDefaultSession(sameDaySessions));
                                        }
                                    }}
                                >
                                    Part of session
                                </button>
                            </div>
                        </div>
                        {inSession && (
                            <>
                                <div className="form-field">
                                    <label htmlFor="wo-session-picker">Session</label>
                                    <select
                                        id="wo-session-picker"
                                        value={sessionChoice}
                                        onChange={(e) => setSessionChoice(e.target.value)}
                                    >
                                        <option value={NEW_SESSION}>New session…</option>
                                        {sameDaySessions.map((session) => (
                                            <option key={session.sessionId} value={session.sessionId}>
                                                {session.sessionLabel || 'Workout'}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                {sessionChoice === NEW_SESSION && (
                                    <div className="form-field">
                                        <label htmlFor="wo-session-label">Session label</label>
                                        <input
                                            id="wo-session-label"
                                            type="text"
                                            placeholder="Shoulder + Abs"
                                            value={sessionLabel}
                                            onChange={(e) => setSessionLabel(e.target.value)}
                                        />
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                <div className="form-field span-full">
                    <label htmlFor="wo-exercise">Exercise</label>
                    <input
                        id="wo-exercise"
                        type="text"
                        placeholder="Bench press"
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

                <div className="form-field span-full">
                    <label>Weight</label>
                    <div className="segment-toggle" role="group" aria-label="Weight mode">
                        <button
                            type="button"
                            className={weightMode === 'same' ? 'active' : ''}
                            onClick={() => {
                                setWeightMode('same');
                                setForm((f) => ({ ...f, weightsKg: '' }));
                            }}
                        >
                            Same weight
                        </button>
                        <button
                            type="button"
                            className={weightMode === 'progressive' ? 'active' : ''}
                            onClick={() => {
                                setWeightMode('progressive');
                                setForm((f) => ({ ...f, weightKg: '' }));
                            }}
                        >
                            Progressive
                        </button>
                    </div>
                </div>

                {weightMode === 'same' ? (
                    <div className="form-field">
                        <label htmlFor="wo-weight">Weight (kg)</label>
                        <input
                            id="wo-weight"
                            type="number"
                            min="0"
                            step="0.5"
                            placeholder="20"
                            value={form.weightKg}
                            onChange={(e) => setForm((f) => ({ ...f, weightKg: e.target.value }))}
                        />
                    </div>
                ) : (
                    <div className="form-field">
                        <label htmlFor="wo-weights">Progressive (kg)</label>
                        <input
                            id="wo-weights"
                            type="text"
                            placeholder="10/20/30"
                            value={form.weightsKg}
                            onChange={(e) => setForm((f) => ({ ...f, weightsKg: e.target.value }))}
                        />
                    </div>
                )}

                {(inSession || editingEntry?.sessionId) && (
                    <div className="form-field">
                        <label htmlFor="wo-superset">Superset</label>
                        <input
                            id="wo-superset"
                            type="number"
                            min="1"
                            placeholder="1"
                            value={form.supersetGroup}
                            onChange={(e) => setForm((f) => ({ ...f, supersetGroup: e.target.value }))}
                        />
                    </div>
                )}

                <details className="workout-more-options span-full">
                    <summary>More options</summary>
                    <div className="workout-form-grid">
                        {showSessionFields && (
                            <div className="form-field span-full">
                                <label htmlFor="wo-date">Date</label>
                                <input
                                    id="wo-date"
                                    type="date"
                                    value={form.date}
                                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                                />
                            </div>
                        )}
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
                        <div className="form-field span-full">
                            <label htmlFor="wo-notes">Notes</label>
                            <textarea
                                id="wo-notes"
                                value={form.notes}
                                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                            />
                        </div>
                    </div>
                </details>
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
                        onChanged={onChanged}
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
                                        <th>Superset</th>
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
                                            <td className="col-weight">
                                                {formatCell(entry.weightsKg ?? entry.weightKg)}
                                            </td>
                                            <td>{formatCell(entry.supersetGroup)}</td>
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
