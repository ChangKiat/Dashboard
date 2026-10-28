import { useCallback, useEffect, useState } from 'react';
import { fetchHealth, getAuthMe, logoutAuth } from './api';
import AppHeader from './components/AppHeader';
import BudgetsSection from './components/BudgetsSection';
import CalendarSection from './components/CalendarSection';
import CashflowSection from './components/CashflowSection';
import HealthCalendarSection from './components/HealthCalendarSection';
import HealthSection from './components/HealthSection';
import CarServiceSection from './components/CarServiceSection';
import LoginGate from './components/LoginGate';
import MealsSection from './components/MealsSection';
import SetupSection from './components/SetupSection';
import Sidebar from './components/Sidebar';
import TaxReliefSection from './components/TaxReliefSection';
import TripsSection from './components/TripsSection';
import VariableExpensesSection from './components/VariableExpensesSection';
import WorkoutsSection from './components/WorkoutsSection';
import { AmountVisibilityProvider } from './hooks/useAmountVisibility';
import { PaymentAccountsProvider } from './hooks/usePaymentAccounts';
import { RefreshProvider } from './hooks/useRefreshSignal';
import { useSectionTab, type TabId } from './hooks/useSectionTab';
import './App.css';

export default function App() {
    const { activeTab, setActiveTab } = useSectionTab();
    const [menuOpen, setMenuOpen] = useState(false);
    const closeMenu = useCallback(() => setMenuOpen(false), []);
    const openTab = useCallback(
        (tab: TabId) => {
            setActiveTab(tab);
            setMenuOpen(false);
            window.scrollTo(0, 0);
        },
        [setActiveTab]
    );
    const [authChecked, setAuthChecked] = useState(false);
    const [authenticated, setAuthenticated] = useState(false);
    const [health, setHealth] = useState<{ ok: boolean; database: string; telegramUser: string } | null>(null);

    useEffect(() => {
        getAuthMe()
            .then((me) => setAuthenticated(me.authenticated))
            .catch(() => setAuthenticated(false))
            .finally(() => setAuthChecked(true));
    }, []);

    useEffect(() => {
        if (!authenticated) return;
        fetchHealth()
            .then(setHealth)
            .catch(() => setHealth({ ok: false, database: 'unreachable', telegramUser: 'unreachable' }));
    }, [authenticated]);

    if (!authChecked) {
        return (
            <div className="app login-gate">
                <p className="subtitle">Checking session…</p>
            </div>
        );
    }

    if (!authenticated) {
        return <LoginGate />;
    }

    const configWarning =
        health &&
        (!health.ok || health.telegramUser.includes('missing'));

    async function onLogout() {
        try {
            await logoutAuth();
        } finally {
            setAuthenticated(false);
            setHealth(null);
        }
    }

    return (
        <AmountVisibilityProvider>
            <RefreshProvider>
                <PaymentAccountsProvider>
                    <div className="app-shell">
                        <Sidebar active={activeTab} onChange={openTab} open={menuOpen} onClose={closeMenu} />
                        <div className="app">
                            <AppHeader
                                activeTab={activeTab}
                                onOpenMenu={() => setMenuOpen(true)}
                                menuOpen={menuOpen}
                                onLock={onLogout}
                            />

                            {configWarning && (
                                <div className="banner warning">
                                    API config issue: {health?.database}
                                    {health?.telegramUser.includes('missing') && ' · Set TELEGRAM_USER_ID in .env'}
                                </div>
                            )}

                            <main className="main">
                                {activeTab === 'cashflow' && <CashflowSection />}
                                {activeTab === 'calendar' && <CalendarSection />}
                                {activeTab === 'variable' && <VariableExpensesSection />}
                                {activeTab === 'health' && <HealthSection />}
                                {activeTab === 'healthCalendar' && <HealthCalendarSection />}
                                {activeTab === 'workouts' && <WorkoutsSection />}
                                {activeTab === 'meals' && <MealsSection />}
                                {activeTab === 'car' && <CarServiceSection />}
                                {activeTab === 'tax' && <TaxReliefSection />}
                                {activeTab === 'budgets' && <BudgetsSection />}
                                {activeTab === 'recurring' && <SetupSection view="recurring" />}
                                {activeTab === 'loans' && <SetupSection view="loans" />}
                                {activeTab === 'interest' && <SetupSection view="interest" />}
                                {activeTab === 'mealGoals' && <SetupSection view="mealGoals" />}
                                {activeTab === 'accounts' && <SetupSection view="accounts" />}
                                {activeTab === 'trips' && <TripsSection />}
                            </main>
                        </div>
                    </div>
                </PaymentAccountsProvider>
            </RefreshProvider>
        </AmountVisibilityProvider>
    );
}
