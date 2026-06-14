interface Props {
    onEdit: () => void;
    onDelete: () => void;
    deleteLabel: string;
}

export default function RowActions({ onEdit, onDelete, deleteLabel }: Props) {
    const handleDelete = () => {
        if (window.confirm(`Delete ${deleteLabel}?`)) {
            onDelete();
        }
    };

    return (
        <div className="row-actions">
            <button type="button" className="btn-link" onClick={onEdit}>
                Edit
            </button>
            <button type="button" className="btn-link btn-danger-link" onClick={handleDelete}>
                Delete
            </button>
        </div>
    );
}
