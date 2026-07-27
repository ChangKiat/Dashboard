import { useState } from 'react';

import type { WorkoutEntry, WorkoutSession } from '../api';
import {
    createWorkout,
    deleteWorkout,
    deleteWorkoutSession,
    updateWorkout,
} from '../api';
import { parseOptionalInt, parseOptionalNumber } from '../utils/tableFormat';
import {
    formatExerciseLine,
    formatSessionExerciseLines,
    formatSessionSetsReps,
    formatWorkoutEntrySummary,
} from '../utils/workoutSessions';
import DetailModal from './DetailModal';
import RowActions from './RowActions';

interface Props {
    session: WorkoutSession;
    onClose: () => void;
    onEdit: (entry: WorkoutEntry) => void;
    onDelete: (entry: WorkoutEntry) => void;
    onChanged: () => void;
}

type EditRow = {
    key: string;
    id: number | null;
    exercise: string;
    sets: string;
    reps: string;
    weightKg: string;
    weightsKg: string;
    durationMin: string;
    notes: string;
    caloriesBurned: string;
    fatBurnG: string;
    supersetGroup: string;
};

function entryToRow(entry: WorkoutEntry): EditRow {
    return {
        key: String(entry.id),
        id: entry.id,
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
    };
}

function emptyRow(): EditRow {
    return {
        key: crypto.randomUUID(),
        id: null,
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
    };
}

function parseSupersetGroup(raw: string): number | null | 'invalid' {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = parseInt(trimmed, 10);
    return Number.isInteger(n) && n >= 1 ? n : 'invalid';
}

export default function WorkoutSessionDetailModal({
    session,
    onClose,
    onEdit,
    onDelete,
    onChanged,
}: Props) {
    const [editing, setEditing] = useState(false);
    const [label, setLabel] = useState(session.sessionLabel ?? '');
    const [rows, setRows] = useState<EditRow[]>(() => session.exercises.map(entryToRow));
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmDeleteSession, setConfirmDeleteSession] = useState(false);

    const setsReps = formatSessionSetsReps(session.exercises);
    const title = session.sessionLabel || 'Workout';
    const exerciseLines = formatSessionExerciseLines(session.exercises);

    const startEdit = () => {
        setLabel(session.sessionLabel ?? '');
        setRows(session.exercises.map(entryToRow));
        setError(null);
        setConfirmDeleteSession(false);
        setEditing(true);
    };

    const cancelEdit = () => {
        setEditing(false);
        setError(null);
        setConfirmDeleteSession(false);
    };

    const updateRow = (key: string, patch: Partial<EditRow>) => {
        setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    };

    const handleSaveAll = async () => {
        const trimmedLabel = label.trim();
        if (!trimmedLabel) {
            setError('Session label is required.');
            return;
        }
        if (rows.length === 0) {
            setError('Add at least one exercise, or delete the session.');
            return;
        }

        for (const row of rows) {
            if (!row.exercise.trim()) {
                setError('Every exercise needs a name.');
                return;
            }
            if (parseSupersetGroup(row.supersetGroup) === 'invalid') {
                setError('Superset group must be a positive integer (e.g. 1).');
                return;
            }
        }

        setSaving(true);
        setError(null);
        try {
            const originalIds = new Set(session.exercises.map((e) => e.id));
            const keptIds = new Set(rows.filter((r) => r.id != null).map((r) => r.id as number));

            await Promise.all(
                [...originalIds]
                    .filter((id) => !keptIds.has(id))
                    .map((id) => deleteWorkout(id))
            );

            await Promise.all(
                rows.map(async (row) => {
                    const supersetGroup = parseSupersetGroup(row.supersetGroup) as number | null;
                    const weightsKg = row.weightsKg.trim() || null;
                    const fields = {
                        date: session.date,
                        exercise: row.exercise.trim(),
                        sets: parseOptionalInt(row.sets),
                        reps: parseOptionalInt(row.reps),
                        weightKg: parseOptionalNumber(row.weightKg),
                        weightsKg,
                        durationMin: parseOptionalNumber(row.durationMin),
                        notes: row.notes.trim() || null,
                        caloriesBurned: parseOptionalNumber(row.caloriesBurned),
                        fatBurnG: parseOptionalNumber(row.fatBurnG),
                        sessionId: session.sessionId,
                        sessionLabel: trimmedLabel,
                        supersetGroup,
                    };

                    if (row.id == null) {
                        await createWorkout(fields);
                    } else {
                        await updateWorkout(row.id, fields);
                    }
                })
            );

            onChanged();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save session');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteSession = async () => {
        setDeleting(true);
        setError(null);
        try {
            await deleteWorkoutSession(session.sessionId);
            onChanged();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete session');
            setConfirmDeleteSession(false);
        } finally {
            setDeleting(false);
        }
    };

    if (editing) {
        return (
            <DetailModal title={`Edit · ${title}`} open onClose={saving || deleting ? () => {} : cancelEdit}>
                {error && <p className="error">{error}</p>}
                <div className="form-field">
                    <label htmlFor="session-edit-label">Session label</label>
                    <input
                        id="session-edit-label"
                        type="text"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        disabled={saving || deleting}
                    />
                </div>
                <div className="workout-session-edit-rows">
                    {rows.map((row, index) => (
                        <div key={row.key} className="workout-session-edit-row">
                            <div className="workout-session-edit-row-header">
                                <span className="muted">Exercise {index + 1}</span>
                                <button
                                    type="button"
                                    className="btn-danger-link"
                                    disabled={saving || deleting}
                                    onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                                >
                                    Remove
                                </button>
                            </div>
                            <div className="form-field">
                                <label>Name</label>
                                <input
                                    type="text"
                                    value={row.exercise}
                                    onChange={(e) => updateRow(row.key, { exercise: e.target.value })}
                                    disabled={saving || deleting}
                                />
                            </div>
                            <div className="form-row-inline">
                                <div className="form-field">
                                    <label>Sets</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={row.sets}
                                        onChange={(e) => updateRow(row.key, { sets: e.target.value })}
                                        disabled={saving || deleting}
                                    />
                                </div>
                                <div className="form-field">
                                    <label>Reps</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={row.reps}
                                        onChange={(e) => updateRow(row.key, { reps: e.target.value })}
                                        disabled={saving || deleting}
                                    />
                                </div>
                                <div className="form-field">
                                    <label>Weight (kg)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.5"
                                        value={row.weightKg}
                                        onChange={(e) => updateRow(row.key, { weightKg: e.target.value })}
                                        disabled={saving || deleting}
                                    />
                                </div>
                            </div>
                            <div className="form-row-inline">
                                <div className="form-field">
                                    <label>Progressive weights</label>
                                    <input
                                        type="text"
                                        placeholder="10/20/30"
                                        value={row.weightsKg}
                                        onChange={(e) => updateRow(row.key, { weightsKg: e.target.value })}
                                        disabled={saving || deleting}
                                    />
                                </div>
                                <div className="form-field">
                                    <label>Superset group</label>
                                    <input
                                        type="number"
                                        min="1"
                                        placeholder="1"
                                        value={row.supersetGroup}
                                        onChange={(e) =>
                                            updateRow(row.key, { supersetGroup: e.target.value })
                                        }
                                        disabled={saving || deleting}
                                    />
                                </div>
                                <div className="form-field">
                                    <label>Duration (min)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.5"
                                        value={row.durationMin}
                                        onChange={(e) =>
                                            updateRow(row.key, { durationMin: e.target.value })
                                        }
                                        disabled={saving || deleting}
                                    />
                                </div>
                            </div>
                            <div className="form-field">
                                <label>Notes</label>
                                <input
                                    type="text"
                                    value={row.notes}
                                    onChange={(e) => updateRow(row.key, { notes: e.target.value })}
                                    disabled={saving || deleting}
                                />
                            </div>
                        </div>
                    ))}
                </div>
                <button
                    type="button"
                    className="btn-secondary"
                    disabled={saving || deleting}
                    onClick={() => setRows((prev) => [...prev, emptyRow()])}
                >
                    + Add exercise
                </button>

                {confirmDeleteSession ? (
                    <div className="confirm-dialog workout-session-delete-confirm">
                        <h4>Delete entire session?</h4>
                        <p className="confirm-dialog-message">
                            All {session.exercises.length} exercise
                            {session.exercises.length === 1 ? '' : 's'} in &quot;{title}&quot; will be
                            permanently deleted.
                        </p>
                        <div className="record-modal-actions">
                            <button
                                type="button"
                                className="btn-secondary"
                                disabled={deleting}
                                onClick={() => setConfirmDeleteSession(false)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn-danger"
                                disabled={deleting}
                                onClick={handleDeleteSession}
                            >
                                {deleting ? 'Deleting…' : 'Delete session'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="record-modal-actions">
                        <button
                            type="button"
                            className="btn-danger-link"
                            disabled={saving || deleting}
                            onClick={() => setConfirmDeleteSession(true)}
                        >
                            Delete session
                        </button>
                        <button
                            type="button"
                            className="btn-secondary"
                            disabled={saving || deleting}
                            onClick={cancelEdit}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="btn-primary"
                            disabled={saving || deleting}
                            onClick={handleSaveAll}
                        >
                            {saving ? 'Saving…' : 'Save session'}
                        </button>
                    </div>
                )}
            </DetailModal>
        );
    }

    return (
        <DetailModal title={title} open onClose={onClose}>
            {setsReps && <p className="day-detail-stat">{setsReps}</p>}
            {exerciseLines.length > 0 && (
                <p className="muted workout-session-superset-preview">{exerciseLines.join(' · ')}</p>
            )}
            <ul className="workout-session-modal-list">
                {session.exercises.map((entry) => (
                    <li key={entry.id} className="day-entry-card workout-session-modal-item">
                        <div className="day-entry-main">
                            <span className="day-entry-title">{formatExerciseLine(entry)}</span>
                            <span className="day-entry-sub">{formatWorkoutEntrySummary(entry)}</span>
                        </div>
                        <RowActions
                            onEdit={() => onEdit(entry)}
                            onDelete={() => onDelete(entry)}
                            deleteLabel={entry.exercise}
                            confirmTitle="Remove from session?"
                            confirmMessage={`"${entry.exercise}" will be removed from ${title}.`}
                        />
                    </li>
                ))}
            </ul>
            <div className="record-modal-actions">
                <button type="button" className="btn-secondary" onClick={onClose}>
                    Close
                </button>
                <button type="button" className="btn-primary" onClick={startEdit}>
                    Edit session
                </button>
            </div>
        </DetailModal>
    );
}
