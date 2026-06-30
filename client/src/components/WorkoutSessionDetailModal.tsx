import type { WorkoutEntry, WorkoutSession } from '../api';
import {
    formatExerciseLine,
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
}

export default function WorkoutSessionDetailModal({
    session,
    onClose,
    onEdit,
    onDelete,
}: Props) {
    const setsReps = formatSessionSetsReps(session.exercises);
    const title = session.sessionLabel || 'Workout';

    return (
        <DetailModal title={title} open onClose={onClose}>
            {setsReps && <p className="day-detail-stat">{setsReps}</p>}
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
            </div>
        </DetailModal>
    );
}
