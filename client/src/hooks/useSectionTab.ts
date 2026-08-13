import { useCallback, useState } from 'react';

export type TabId = 'expenses' | 'income' | 'health' | 'setup';

const STORAGE_KEY = 'dashboard-active-tab';

const VALID_TABS: TabId[] = ['expenses', 'income', 'health', 'setup'];

function readStoredTab(): TabId {
    try {
        const stored = sessionStorage.getItem(STORAGE_KEY);
        if (stored === 'workouts' || stored === 'meals') {
            return 'health';
        }
        if (stored && VALID_TABS.includes(stored as TabId)) {
            return stored as TabId;
        }
    } catch {
        // sessionStorage unavailable
    }
    return 'expenses';
}

export const TAB_LABELS: Record<TabId, string> = {
    expenses: 'Expenses',
    income: 'Income',
    health: 'Health',
    setup: 'Setup',
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
