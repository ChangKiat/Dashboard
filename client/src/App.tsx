import { useEffect, useState } from 'react';
import { fetchHealth, getAuthMe, logoutAuth } from './api';
import ExpensesSection from './components/ExpensesSection';
import HealthSection from './components/HealthSection';
import IncomeSection from './components/IncomeSection';
import LoginGate from './components/LoginGate';
import MonthPicker from './components/MonthPicker';
import SectionTabs from './components/SectionTabs';
import SetupSection from './components/SetupSection';
import { PaymentAccountsProvider } from './hooks/usePaymentAccounts';
import { useMonth } from './hooks/useMonth';
import { useSectionTab } from './hooks/useSectionTab';
import './App.css';

export default function App() {
    const { month, setMonth } = useMonth();
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
        <PaymentAccountsProvider>
            <div className="app">
                <header className="header">
                    <div className="header-left">
                        <h1>Personal Dashboard</h1>
                        <SectionTabs active={activeTab} onChange={setActiveTab} />
                    </div>
                    <div className="header-controls">
                        <MonthPicker month={month} onChange={setMonth} />
                        <button type="button" className="logout-btn" onClick={onLogout}>
                            Lock
                        </button>
                    </div>
                </header>

                {configWarning && (
                    <div className="banner warning">
                        API config issue: {health?.database}
                        {health?.telegramUser.includes('missing') && ' · Set TELEGRAM_USER_ID in .env'}
                    </div>
                )}

                <main className="main">
                    {activeTab === 'expenses' && <ExpensesSection month={month} />}
                    {activeTab === 'income' && <IncomeSection month={month} />}
                    {activeTab === 'health' && <HealthSection month={month} />}
                    {activeTab === 'setup' && <SetupSection month={month} />}
                </main>
            </div>
        </PaymentAccountsProvider>
    );
}
