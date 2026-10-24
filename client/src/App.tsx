import { useEffect, useState } from 'react';
import { fetchHealth, getAuthMe, logoutAuth } from './api';
import AppHeader from './components/AppHeader';
import CashflowSection from './components/CashflowSection';
import HealthSection from './components/HealthSection';
import CarServiceSection from './components/CarServiceSection';
import LoginGate from './components/LoginGate';
import SetupSection from './components/SetupSection';
import TaxReliefSection from './components/TaxReliefSection';
import { AmountVisibilityProvider } from './hooks/useAmountVisibility';
import { PaymentAccountsProvider } from './hooks/usePaymentAccounts';
import { RefreshProvider } from './hooks/useRefreshSignal';
import { useSectionTab } from './hooks/useSectionTab';
import './App.css';

export default function App() {
    const { activeTab, setActiveTab } = useSectionTab();
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
        return <LoginGate onAuthenticated={() => setAuthenticated(true)} />;
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
                    <div className="app">
                        <AppHeader activeTab={activeTab} onTabChange={setActiveTab} onLock={onLogout} />

                        {configWarning && (
                            <div className="banner warning">
                                API config issue: {health?.database}
                                {health?.telegramUser.includes('missing') && ' · Set TELEGRAM_USER_ID in .env'}
                            </div>
                        )}

                        <main className="main">
                            {activeTab === 'cashflow' && <CashflowSection />}
                            {activeTab === 'health' && <HealthSection />}
                            {activeTab === 'car' && <CarServiceSection />}
                            {activeTab === 'tax' && <TaxReliefSection />}
                            {activeTab === 'setup' && <SetupSection />}
                        </main>
                    </div>
                </PaymentAccountsProvider>
            </RefreshProvider>
        </AmountVisibilityProvider>
    );
}
