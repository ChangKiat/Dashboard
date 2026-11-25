import { useEffect, useState } from 'react';
import { fetchSchedulerSettings, saveSchedulerSettings, type SchedulerSettings } from '../api';

export default function SchedulerSection() {
    const [settings, setSettings] = useState<SchedulerSettings | null>(null);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [loading, setLoading] = useState(true);
    async function load() {
        setLoading(true); setError('');
        try { setSettings(await fetchSchedulerSettings()); }
        catch (e) { setError(e instanceof Error ? e.message : 'Could not load scheduler'); }
        finally { setLoading(false); }
    }
    useEffect(() => { void load(); }, []);
    function update(name: string, changes: { enabled?: boolean; time?: string }) {
        setSettings(s => s && ({ ...s, jobs: s.jobs.map(j => j.name === name ? { ...j, ...changes } : j) }));
        setSaved(false); setDirty(true);
    }
    async function save(event: React.FormEvent) {
        event.preventDefault();
        if (!settings) return;
        setSaving(true); setError(''); setSaved(false);
        try { await saveSchedulerSettings(settings.jobs); setSaved(true); setDirty(false); }
        catch (e) { setError(e instanceof Error ? e.message : 'Could not save scheduler'); }
        finally { setSaving(false); }
    }
    return <section className="panel">
        <div className="card scheduler-settings">
            <h2>Daily jobs</h2>
            <p className="muted">All times are Malaysia time (Asia/Kuala_Lumpur). Changes apply on the next check, usually within five minutes while the server is awake.</p>
            {error && <p className="error" role="alert">{error}</p>}
            {loading ? <p>Loading scheduler...</p> : !settings ? <button onClick={() => void load()}>Try again</button> : <>
                <p role="status">Server scheduler: <strong>{settings.serverEnabled ? 'On' : 'Off'}</strong></p>
                {!settings.serverEnabled && <p className="muted">You can save your preferences, but jobs will not run until the server scheduler is enabled.</p>}
                {!settings.ready && <p role="alert">Scheduler settings need to be installed on the server before you can save changes.</p>}
                <form onSubmit={save}>
                    <fieldset disabled={saving || !settings.ready} className="scheduler-fields">
                        {settings.jobs.map(job => <div className="scheduler-job" key={job.name}>
                            <label><input type="checkbox" checked={job.enabled} onChange={e => update(job.name, { enabled: e.target.checked })} /> {job.label}</label>
                            <label className="scheduler-time">Run at <input type="time" aria-label={`${job.label} time`} required value={job.time} onChange={e => update(job.name, { time: e.target.value })} /></label>
                        </div>)}
                        <button type="submit" disabled={!dirty}>{saving ? 'Saving...' : 'Save schedule'}</button>
                    </fieldset>
                </form>
                {saved && <p role="status">Schedule saved.</p>}
                <p className="muted">Completed jobs will not run again that day. Re-enabling bills or interest can catch up missed days within the last seven days. Daily check-ins only run for today. Turning a job off does not stop a run already in progress.</p>
                <p className="muted">If your server sleeps, its wake-up schedule also needs to cover these times.</p>
            </>}
        </div>
    </section>;
}
