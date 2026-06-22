import type { MealEntry, WorkoutEntry } from '../api';
import { formatCell } from '../utils/tableFormat';
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

    const title =
        type === 'workout' ? entry.exercise : entry.description;

    const handleDelete = () => {
        const label =
            type === 'workout'
                ? `this ${entry.exercise} entry`
                : `"${entry.description}"`;
        if (window.confirm(`Delete ${label}?`)) {
            onDelete();
        }
    };

    return (
        <DetailModal title={title} open onClose={onClose}>
            <dl className="detail-field-list">
                <DetailField label="Date" value={entry.date} />
                {type === 'workout' ? (
                    <>
                        <DetailField label="Exercise" value={entry.exercise} />
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
                <button type="button" className="btn-link btn-danger-link" onClick={handleDelete}>
                    Delete
                </button>
                <button type="button" className="btn-primary" onClick={onEdit}>
                    Edit
                </button>
            </div>
        </DetailModal>
    );
}
