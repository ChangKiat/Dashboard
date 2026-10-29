import { useState, type ReactNode } from 'react';

import ConfirmDialog from './ConfirmDialog';

interface Props {
    onEdit: () => void;
    onDelete: () => void;
    deleteLabel: string;
    confirmTitle?: string;
    confirmMessage?: string;
    /** Extra row actions, shown above Edit. */
    children?: ReactNode;
}

export default function RowActions({
    onEdit,
    onDelete,
    deleteLabel,
    confirmTitle,
    confirmMessage,
    children,
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
                {children}
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
