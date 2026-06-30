import { useState } from 'react';

import ConfirmDialog from './ConfirmDialog';

interface Props {
    onEdit: () => void;
    onDelete: () => void;
    deleteLabel: string;
    confirmTitle?: string;
    confirmMessage?: string;
}

export default function RowActions({
    onEdit,
    onDelete,
    deleteLabel,
    confirmTitle,
    confirmMessage,
}: Props) {
    const [confirmOpen, setConfirmOpen] = useState(false);

    const title = confirmTitle ?? 'Delete this item?';
    const message =
        confirmMessage ??
        `"${deleteLabel}" will be permanently removed. This can't be undone.`;

    const handleConfirm = () => {
        setConfirmOpen(false);
        onDelete();
    };

    return (
        <>
            <div className="row-actions">
                <button type="button" className="btn-link" onClick={onEdit}>
                    Edit
                </button>
                <button
                    type="button"
                    className="btn-link btn-danger-link"
                    onClick={() => setConfirmOpen(true)}
                >
                    Delete
                </button>
            </div>
            <ConfirmDialog
                open={confirmOpen}
                title={title}
                message={message}
                onConfirm={handleConfirm}
                onCancel={() => setConfirmOpen(false)}
            />
        </>
    );
}
