import { useEffect, useRef } from 'react';

interface Props {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export default function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = 'Delete',
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel,
}: Props) {
    const cancelRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onCancel();
        };
        window.addEventListener('keydown', onKeyDown);
        cancelRef.current?.focus();
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open, onCancel]);

    if (!open) return null;

    return (
        <div className="record-modal-backdrop" onClick={onCancel}>
            <div
                className="record-modal confirm-dialog"
                role="alertdialog"
                aria-labelledby="confirm-dialog-title"
                aria-describedby="confirm-dialog-message"
                onClick={(e) => e.stopPropagation()}
            >
                <h4 id="confirm-dialog-title">{title}</h4>
                <p id="confirm-dialog-message" className="confirm-dialog-message">
                    {message}
                </p>
                <div className="record-modal-actions">
                    <button
                        ref={cancelRef}
                        type="button"
                        className="btn-secondary"
                        onClick={onCancel}
                    >
                        {cancelLabel}
                    </button>
                    <button type="button" className="btn-danger" onClick={onConfirm}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
