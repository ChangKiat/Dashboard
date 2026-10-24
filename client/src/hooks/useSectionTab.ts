import { useCallback, useState } from 'react';

export type TabId = 'cashflow' | 'health' | 'car' | 'tax' | 'setup';

const STORAGE_KEY = 'dashboard-active-tab';

const VALID_TABS: TabId[] = ['cashflow', 'health', 'car', 'tax', 'setup'];

function readStoredTab(): TabId {
    try {
        const stored = sessionStorage.getItem(STORAGE_KEY);
        if (stored === 'workouts' || stored === 'meals') {
            return 'health';
        }
        if (stored === 'expenses' || stored === 'income') {
            return 'cashflow';
        }
        if (stored && VALID_TABS.includes(stored as TabId)) {
            return stored as TabId;
        }
    } catch {
        // sessionStorage unavailable
    }
    return 'cashflow';
}

export const TAB_LABELS: Record<TabId, string> = {
    cashflow: 'Cashflow',
    health: 'Health',
    car: 'Car',
    tax: 'Tax Relief',
    setup: 'Setup',
};

export const TAB_SUBTITLES: Record<TabId, string> = {
    cashflow: 'Where your money went',
    health: 'Workouts, meals and body weight',
    car: 'Service visits and maintenance costs',
    tax: 'Claims toward this year’s tax relief',
    setup: 'Fixed expenses, interest and budget categories',
};

export function useSectionTab() {
    const [activeTab, setActiveTabState] = useState<TabId>(readStoredTab);

    const setActiveTab = useCallback((tab: TabId) => {
        setActiveTabState(tab);
        try {
            sessionStorage.setItem(STORAGE_KEY, tab);
        } catch {
            // ignore
        }
    }, []);

    return { activeTab, setActiveTab };
}
