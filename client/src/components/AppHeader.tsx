import { useAmountVisibility } from '../hooks/useAmountVisibility';
import { useRefreshControl } from '../hooks/useRefreshSignal';
import { TAB_LABELS, TAB_SUBTITLES, type TabId } from '../hooks/useSectionTab';
import { useTheme } from '../hooks/useTheme';
import { EyeIcon, EyeOffIcon, LockIcon, MenuIcon, MoonIcon, RefreshIcon, SunIcon } from './icons';

interface Props {
    activeTab: TabId;
    /** Opens the sidebar drawer; the button only shows on narrow screens. */
    onOpenMenu: () => void;
    menuOpen: boolean;
    onLock: () => void;
}

export default function AppHeader({ activeTab, onOpenMenu, menuOpen, onLock }: Props) {
    const { theme, toggleTheme } = useTheme();
    const { hidden, toggleHidden } = useAmountVisibility();
    const { refreshing, requestRefresh } = useRefreshControl();

    return (
        <header className="header">
            <div className="header-left">
                <button
                    type="button"
                    className="icon-btn menu-toggle"
                    aria-label="Open menu"
                    aria-expanded={menuOpen}
                    aria-controls="app-sidebar"
                    onClick={onOpenMenu}
                >
                    <MenuIcon />
                </button>
                <div className="header-titles">
                    <h1>{TAB_LABELS[activeTab]}</h1>
                    <p className="subtitle">{TAB_SUBTITLES[activeTab]}</p>
                </div>
            </div>
            <div className="header-controls">
                <button
                    type="button"
                    className="icon-btn"
                    aria-label="Hide amounts"
                    aria-pressed={hidden}
                    title={hidden ? 'Show amounts' : 'Hide amounts'}
                    onClick={toggleHidden}
                >
                    {hidden ? <EyeOffIcon /> : <EyeIcon />}
                </button>
                <button
                    type="button"
                    className="icon-btn"
                    aria-label={theme === 'dark' ? 'Switch to warm theme' : 'Switch to dark theme'}
                    title={theme === 'dark' ? 'Warm theme' : 'Dark theme'}
                    onClick={toggleTheme}
                >
                    {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
                </button>
                <button type="button" className="pill-btn pill-btn--lock" onClick={onLock}>
                    <LockIcon size={18} />
                    Lock
                </button>
                <button
                    type="button"
                    className="pill-btn pill-btn--primary"
                    onClick={requestRefresh}
                    disabled={refreshing}
                >
                    <RefreshIcon size={18} className={refreshing ? 'spin' : undefined} />
                    {refreshing ? 'Refreshing…' : 'Refresh'}
                </button>
            </div>
        </header>
    );
}
