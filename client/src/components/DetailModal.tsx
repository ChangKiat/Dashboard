import { useEffect, type ReactNode } from 'react';

interface Props {
    title: string;
    open: boolean;
    onClose: () => void;
    children: ReactNode;
}

export default function DetailModal({ title, open, onClose, children }: Props) {
    useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="record-modal-backdrop" onClick={onClose}>
            <div className="record-modal detail-modal" onClick={(e) => e.stopPropagation()}>
                <div className="detail-modal-header">
                    <h4>{title}</h4>
                    <button type="button" className="detail-modal-close" onClick={onClose} aria-label="Close">
                        ×
                    </button>
                </div>
                <div className="detail-modal-body">{children}</div>
            </div>
        </div>
    );
}
