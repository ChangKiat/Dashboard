import { useEffect, type ReactNode } from 'react';
import { TAB_GROUPS, TAB_LABELS, type TabId } from '../hooks/useSectionTab';
import {
    ActivityIcon,
    BarsIcon,
    CalendarCheckIcon,
    CalendarIcon,
    CardIcon,
    CarIcon,
    CloseIcon,
    CoinsIcon,
    DumbbellIcon,
    PercentIcon,
    PieIcon,
    PlaneIcon,
    ReceiptIcon,
    RepeatIcon,
    TargetIcon,
    UtensilsIcon,
    WalletIcon,
} from './icons';

const TAB_ICONS: Record<TabId, ReactNode> = {
    cashflow: <WalletIcon />,
    calendar: <CalendarIcon />,
    variable: <BarsIcon />,
    health: <ActivityIcon />,
    healthCalendar: <CalendarCheckIcon />,
    workouts: <DumbbellIcon />,
    meals: <UtensilsIcon />,
    car: <CarIcon />,
    tax: <ReceiptIcon />,
    budgets: <PieIcon />,
    recurring: <RepeatIcon />,
    loans: <CoinsIcon />,
    interest: <PercentIcon />,
    mealGoals: <TargetIcon />,
    accounts: <CardIcon />,
    trips: <PlaneIcon />,
};

interface Props {
    active: TabId;
    onChange: (tab: TabId) => void;
    /** Drawer state on narrow screens; the sidebar is always shown on wide ones. */
    open: boolean;
    onClose: () => void;
}

export default function Sidebar({ active, onChange, open, onClose }: Props) {
    useEffect(() => {
        if (!open) return;
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose();
        }
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [open, onClose]);

    return (
        <>
            {open && <div className="sidebar-backdrop" onClick={onClose} aria-hidden="true" />}
            <aside id="app-sidebar" className={open ? 'sidebar open' : 'sidebar'}>
                <div className="sidebar-brand">
                    <span className="sidebar-brand-name">Personal Dashboard</span>
                    <button
                        type="button"
                        className="icon-btn sidebar-close"
                        aria-label="Close menu"
                        onClick={onClose}
                    >
                        <CloseIcon size={18} />
                    </button>
                </div>
                <nav className="sidebar-nav" aria-label="Dashboard sections">
                    {TAB_GROUPS.map((group) => (
                        <div key={group.label ?? 'main'} className="sidebar-group">
                            {group.label && <p className="sidebar-group-label">{group.label}</p>}
                            {group.tabs.map((tab) => (
                                <button
                                    key={tab}
                                    type="button"
                                    className={active === tab ? 'sidebar-item active' : 'sidebar-item'}
                                    aria-current={active === tab ? 'page' : undefined}
                                    onClick={() => onChange(tab)}
                                >
                                    <span className="sidebar-item-icon">{TAB_ICONS[tab]}</span>
                                    {TAB_LABELS[tab]}
                                </button>
                            ))}
                        </div>
                    ))}
                </nav>
            </aside>
        </>
    );
}
