import { useCallback, useState } from 'react';

export type TabId =
    | 'cashflow'
    | 'health'
    | 'car'
    | 'tax'
    | 'budgets'
    | 'recurring'
    | 'loans'
    | 'interest'
    | 'mealGoals'
    | 'accounts'
    | 'trips';

const STORAGE_KEY = 'dashboard-active-tab';

/** Sidebar groups, top to bottom. A null label means no heading. */
export const TAB_GROUPS: { label: string | null; tabs: TabId[] }[] = [
    { label: null, tabs: ['cashflow', 'health', 'car', 'tax'] },
    { label: 'Planning', tabs: ['budgets', 'recurring', 'loans', 'interest', 'mealGoals'] },
    { label: 'Organize', tabs: ['accounts', 'trips'] },
];

const VALID_TABS: TabId[] = TAB_GROUPS.flatMap((group) => group.tabs);

function readStoredTab(): TabId {
    try {
        const stored = sessionStorage.getItem(STORAGE_KEY);
        if (stored === 'workouts' || stored === 'meals') {
            return 'health';
        }
        if (stored === 'expenses' || stored === 'income') {
            return 'cashflow';
        }
        if (stored === 'setup') {
            return 'recurring';
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
    budgets: 'Budgets',
    recurring: 'Recurring',
    loans: 'Loans',
    interest: 'Interest',
    mealGoals: 'Meal goals',
    accounts: 'Accounts',
    trips: 'Trips',
};

export const TAB_SUBTITLES: Record<TabId, string> = {
    cashflow: 'Where your money went',
    health: 'Workouts, meals and body weight',
    car: 'Service visits and maintenance costs',
    tax: 'Claims toward this year’s tax relief',
    budgets: 'A monthly limit for each spending category',
    recurring: 'Bills and subscriptions that repeat',
    loans: 'Loan repayments and their interest',
    interest: 'Interest your accounts pay you',
    mealGoals: 'Daily nutrition targets and body stats',
    accounts: 'Bank accounts, cards and investments',
    trips: 'What each trip cost, in money and workdays',
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
