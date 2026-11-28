import { useCallback, useState } from 'react';

export type TabId =
    | 'cashflow'
    | 'calendar'
    | 'variable'
    | 'health'
    | 'healthCalendar'
    | 'workouts'
    | 'meals'
    | 'car'
    | 'assets'
    | 'tax'
    | 'budgets'
    | 'recurring'
    | 'loans'
    | 'interest'
    | 'mealGoals'
    | 'accounts'
    | 'trips'
    | 'scheduler';

const STORAGE_KEY = 'dashboard-active-tab';

/** Sidebar groups, top to bottom. A null label means no heading. */
export const TAB_GROUPS: { label: string | null; tabs: TabId[] }[] = [
    { label: null, tabs: ['cashflow', 'calendar', 'variable', 'car', 'assets', 'tax'] },
    { label: 'Health', tabs: ['health', 'healthCalendar', 'workouts', 'meals'] },
    { label: 'Planning', tabs: ['budgets', 'recurring', 'loans', 'interest', 'mealGoals'] },
    { label: 'Organize', tabs: ['accounts', 'trips', 'scheduler'] },
];

const VALID_TABS: TabId[] = TAB_GROUPS.flatMap((group) => group.tabs);

function readStoredTab(): TabId {
    try {
        const stored = sessionStorage.getItem(STORAGE_KEY);
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
    calendar: 'Calendar',
    variable: 'Variable expenses',
    health: 'Health',
    healthCalendar: 'Health calendar',
    workouts: 'Workouts',
    meals: 'Meals',
    car: 'Car',
    assets: 'Assets',
    tax: 'Tax Relief',
    budgets: 'Budgets',
    recurring: 'Recurring',
    loans: 'Loans',
    interest: 'Interest',
    mealGoals: 'Meal goals',
    accounts: 'Accounts',
    trips: 'Trips',
    scheduler: 'Scheduler',
};

export const TAB_SUBTITLES: Record<TabId, string> = {
    cashflow: 'Where your money went',
    calendar: 'Income and spending day by day',
    variable: 'Spending in each category against its budget',
    health: 'Weight, training and eating at a glance',
    healthCalendar: 'Workouts, meals, weight and steps day by day',
    workouts: 'Sessions, lifts and personal records',
    meals: 'Calories and protein against your targets',
    car: 'Service visits and maintenance costs',
    assets: 'What you own, when you bought it and what it’s worth',
    tax: 'Claims toward this year’s tax relief',
    budgets: 'A monthly limit for each spending category',
    recurring: 'Bills and subscriptions that repeat',
    loans: 'Loan repayments and their interest',
    interest: 'Interest your accounts pay you',
    mealGoals: 'Daily nutrition targets and body stats',
    accounts: 'Balances and activity for your accounts, cards and investments',
    trips: 'What each trip cost, in money and workdays',
    scheduler: 'Choose when your daily jobs run',
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
