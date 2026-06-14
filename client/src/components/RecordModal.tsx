import type { ReactNode } from 'react';

interface Props {
    title: string;
    open: boolean;
    saving: boolean;
    error: string | null;
    onClose: () => void;
    onSave: () => void;
    children: ReactNode;
}

export default function RecordModal({
    title,
    open,
    saving,
    error,
    onClose,
    onSave,
    children,
}: Props) {
    if (!open) return null;

    return (
        <div className="record-modal-backdrop" onClick={onClose}>
            <div className="record-modal" onClick={(e) => e.stopPropagation()}>
                <h4>{title}</h4>
                <div className="record-modal-body">{children}</div>
                {error && <p className="error">{error}</p>}
                <div className="record-modal-actions">
                    <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
                        Cancel
                    </button>
                    <button type="button" className="btn-primary" onClick={onSave} disabled={saving}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}
