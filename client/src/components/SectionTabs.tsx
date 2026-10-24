import { useEffect, useRef, useState } from 'react';
import { TAB_LABELS, type TabId } from '../hooks/useSectionTab';
import { MenuIcon } from './icons';

interface Props {
    active: TabId;
    onChange: (tab: TabId) => void;
}

const TABS: TabId[] = ['cashflow', 'health', 'car', 'tax', 'setup'];

export default function SectionTabs({ active, onChange }: Props) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;

        function onPointerDown(e: PointerEvent) {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        }

        function onKeyDown(e: KeyboardEvent) {
            if (e.key === 'Escape') setOpen(false);
        }

        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    return (
        <div className="section-menu" ref={rootRef}>
            <button
                type="button"
                className="icon-btn section-menu-toggle"
                aria-label="Dashboard sections"
                aria-expanded={open}
                aria-controls="section-menu-list"
                onClick={() => setOpen((o) => !o)}
            >
                <MenuIcon />
            </button>
            {open && (
                <nav id="section-menu-list" className="section-menu-list" aria-label="Dashboard sections">
                    {TABS.map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            className={active === tab ? 'section-menu-item active' : 'section-menu-item'}
                            aria-current={active === tab ? 'page' : undefined}
                            onClick={() => {
                                onChange(tab);
                                setOpen(false);
                            }}
                        >
                            {TAB_LABELS[tab]}
                        </button>
                    ))}
                </nav>
            )}
        </div>
    );
}
