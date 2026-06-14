import { useCallback, useState } from 'react';

export type TabId = 'expenses' | 'workouts' | 'meals';

const STORAGE_KEY = 'dashboard-active-tab';

const VALID_TABS: TabId[] = ['expenses', 'workouts', 'meals'];

function readStoredTab(): TabId {
    try {
        const stored = sessionStorage.getItem(STORAGE_KEY);
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
    workouts: 'Workouts',
    meals: 'Meals',
};

export const TAB_SUBTITLES: Record<TabId, string> = {
    expenses: 'Monthly budget overview',
    workouts: 'Workout sessions',
    meals: 'Meal macros',
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
