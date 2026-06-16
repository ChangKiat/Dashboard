import { useEffect, useState } from 'react';
import { fetchHealth } from './api';
import ExpensesSection from './components/ExpensesSection';
import HealthSection from './components/HealthSection';
import MonthPicker from './components/MonthPicker';
import SectionTabs from './components/SectionTabs';
import { useMonth } from './hooks/useMonth';
import { TAB_SUBTITLES, useSectionTab } from './hooks/useSectionTab';
import './App.css';

export default function App() {
    const { month, setMonth } = useMonth();
    const { activeTab, setActiveTab } = useSectionTab();
    const [health, setHealth] = useState<{ ok: boolean; database: string; telegramUser: string } | null>(null);

    useEffect(() => {
        fetchHealth()
            .then(setHealth)
            .catch(() => setHealth({ ok: false, database: 'unreachable', telegramUser: 'unreachable' }));
    }, []);

    const configWarning =
        health &&
        (!health.ok || health.telegramUser.includes('missing'));

    return (
        <div className="app">
            <header className="header">
                <div>
                    <h1>Personal Dashboard</h1>
                    <p className="subtitle">{TAB_SUBTITLES[activeTab]}</p>
                </div>
                <div className="header-controls">
                    <MonthPicker month={month} onChange={setMonth} />
                    <SectionTabs active={activeTab} onChange={setActiveTab} />
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
                {activeTab === 'health' && <HealthSection month={month} />}
            </main>
        </div>
    );
}
