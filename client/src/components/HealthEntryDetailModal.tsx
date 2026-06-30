import { useState } from 'react';

import type { MealEntry, WorkoutEntry } from '../api';
import { formatCell } from '../utils/tableFormat';
import ConfirmDialog from './ConfirmDialog';
import DetailModal from './DetailModal';

type Props =
    | {
          type: 'workout';
          entry: WorkoutEntry;
          onClose: () => void;
          onEdit: () => void;
          onDelete: () => void;
      }
    | {
          type: 'meal';
          entry: MealEntry;
          onClose: () => void;
          onEdit: () => void;
          onDelete: () => void;
      };

function DetailField({ label, value }: { label: string; value: string }) {
    return (
        <div className="detail-field">
            <dt>{label}</dt>
            <dd>{value}</dd>
        </div>
    );
}

export default function HealthEntryDetailModal(props: Props) {
    const { type, entry, onClose, onEdit, onDelete } = props;
    const [confirmOpen, setConfirmOpen] = useState(false);

    const title = type === 'workout' ? entry.exercise : entry.description;

    const confirmTitle = type === 'workout' ? 'Remove exercise?' : 'Delete meal?';
    const confirmMessage =
        type === 'workout'
            ? `"${entry.exercise}" will be permanently removed. This can't be undone.`
            : `"${entry.description}" will be permanently removed. This can't be undone.`;

    return (
        <>
            <DetailModal title={title} open onClose={onClose}>
                <dl className="detail-field-list">
                    <DetailField label="Date" value={entry.date} />
                    {type === 'workout' ? (
                        <>
                            <DetailField label="Exercise" value={entry.exercise} />
                            {entry.sessionLabel && (
                                <DetailField label="Session" value={entry.sessionLabel} />
                            )}
                            <DetailField label="Sets" value={formatCell(entry.sets)} />
                            <DetailField label="Reps" value={formatCell(entry.reps)} />
                            <DetailField label="Weight (kg)" value={formatCell(entry.weightKg)} />
                            <DetailField label="Duration (min)" value={formatCell(entry.durationMin)} />
                            <DetailField label="Calories burned" value={formatCell(entry.caloriesBurned)} />
                            <DetailField label="Fat burned (g)" value={formatCell(entry.fatBurnG)} />
                            <DetailField label="Notes" value={formatCell(entry.notes)} />
                        </>
                    ) : (
                        <>
                            <DetailField label="Meal type" value={formatCell(entry.mealType)} />
                            <DetailField label="Description" value={entry.description} />
                            <DetailField label="Protein (g)" value={formatCell(entry.proteinG)} />
                            <DetailField label="Carbs (g)" value={formatCell(entry.carbsG)} />
                            <DetailField label="Fat (g)" value={formatCell(entry.fatG)} />
                            <DetailField label="Calories" value={formatCell(entry.calories)} />
                        </>
                    )}
                </dl>
                <div className="record-modal-actions">
                    <button type="button" className="btn-secondary" onClick={onClose}>
                        Close
                    </button>
                    <button
                        type="button"
                        className="btn-link btn-danger-link"
                        onClick={() => setConfirmOpen(true)}
                    >
                        Delete
                    </button>
                    <button type="button" className="btn-primary" onClick={onEdit}>
                        Edit
                    </button>
                </div>
            </DetailModal>
            <ConfirmDialog
                open={confirmOpen}
                title={confirmTitle}
                message={confirmMessage}
                onConfirm={() => {
                    setConfirmOpen(false);
                    onDelete();
                }}
                onCancel={() => setConfirmOpen(false)}
            />
        </>
    );
}
