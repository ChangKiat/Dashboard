import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { carVisitTypes, createCarServiceVisit, deleteCarServiceVisit, fetchCarServiceOverview, updateCarServiceVisit } from '../api';
import type { CarVisitType, CarServiceCategory, CarServiceOverview, CarServiceVisit } from '../api';
import { useFormatMYR } from '../hooks/useAmountVisibility';
import { useRefreshSignal } from '../hooks/useRefreshSignal';
import './CarServiceSection.css';

const categories: CarServiceCategory[] = ['Material', 'Lubricants', 'Labour', 'Other'];
const dateFormatter = new Intl.DateTimeFormat('en-MY', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dateLabel = (iso: string) => dateFormatter.format(new Date(iso + 'T00:00:00Z'));
const km = (value: number) => value.toLocaleString('en-MY') + ' km';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date());

type Line = { key: number; id?: number; category: CarServiceCategory; description: string; amount: string };
const emptyLine = (key: number): Line => ({ key, category: 'Material', description: '', amount: '' });

function VisitEditor({ visit, initialType = 'Normal service', data, onClose, onSaved }: {
    initialType?: CarVisitType;
    visit?: CarServiceVisit;
    data: CarServiceOverview;
    onClose: () => void;
    onSaved: (id: number | null) => void;
}) {
    const money = useFormatMYR();
    const [visitType, setVisitType] = useState<CarVisitType>(visit?.visitType ?? initialType);
    const [date, setDate] = useState(visit?.date ?? today());
    const [odometer, setOdometer] = useState(visit?.odometerKm?.toString() ?? '');
    const [notes, setNotes] = useState(visit?.notes ?? '');
    const [lines, setLines] = useState<Line[]>(() => visit
        ? visit.items.map((item, key) => ({ ...item, key, amount: String(item.amount) }))
        : [emptyLine(0)]);
    const nextKey = useRef(lines.length);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const change = (key: number, patch: Partial<Line>) => setLines((rows) =>
        rows.map((row) => row.key === key ? { ...row, ...patch } : row));

    function selectItem(line: Line, description: string) {
        for (let i = data.visits.length - 1; i >= 0; i--) {
            const match = data.visits[i].items.find((item) => item.category === line.category && item.description === description);
            if (match) {
                change(line.key, { description, amount: String(match.amount) });
                return;
            }
        }
        change(line.key, { description });
    }

    async function save(event: FormEvent) {
        event.preventDefault();
        const items = lines.filter((line) => line.description.trim() || line.amount || line.id)
            .map((line) => ({ id: line.id, category: line.category, description: line.description.trim(), amount: Number(line.amount) }));
        if (items.some((item) => !item.description || !Number.isFinite(item.amount) || item.amount <= 0)) {
            setError('Each item needs a name and an amount greater than zero.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            const fields = { visitType, date, odometerKm: visitType === 'Normal service' ? Number(odometer) : undefined, notes: notes.trim() || null, items };
            const result = visit ? await updateCarServiceVisit(visit.id, fields) : await createCarServiceVisit(fields);
            onSaved(result.visit.id);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save visit.');
        } finally {
            setBusy(false);
        }
    }

    async function removeVisit() {
        if (!visit || !window.confirm('Delete the visit on ' + dateLabel(visit.date) + ' and its items?')) return;
        setBusy(true);
        try {
            await deleteCarServiceVisit(visit.id);
            onSaved(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not delete visit.');
        } finally {
            setBusy(false);
        }
    }

    return <form className="service-editor" onSubmit={save}>
        <fieldset disabled={busy}>
            <legend>{visit ? 'Edit visit' : 'New visit'}</legend>
            <div className="service-fields">
                <label>Visit type<select value={visitType} onChange={(e) => setVisitType(e.target.value as CarVisitType)}>
                    {carVisitTypes.map((type) => <option key={type}>{type}</option>)}
                </select></label>
                <label>Visit date<input autoFocus required type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
                {visitType === 'Normal service' && <label>Odometer (km)<input required type="number" min="0" step="1" value={odometer} onChange={(e) => setOdometer(e.target.value)} /></label>}
                <label>Notes<input placeholder="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
            </div>
            <h4>Service items</h4>
            {categories.map((category) => <datalist key={category} id={'service-options-' + category}>
                {data.catalog.filter((item) => item.category === category).map((item) => <option key={item.description} value={item.description} />)}
            </datalist>)}
            {lines.map((line, index) => <div className="service-line" key={line.key}>
                <label>Category<select value={line.category} onChange={(e) => change(line.key, { category: e.target.value as CarServiceCategory })}>
                    {categories.map((category) => <option key={category}>{category}</option>)}
                </select></label>
                <label>Item name<input list={'service-options-' + line.category} placeholder="Choose or type a name" value={line.description} onChange={(e) => selectItem(line, e.target.value)} /></label>
                <label>Amount (RM)<input type="number" min="0.01" step="0.01" value={line.amount} onChange={(e) => change(line.key, { amount: e.target.value })} /></label>
                <button type="button" className="btn-link" aria-label={'Remove item ' + (index + 1)} onClick={() => setLines(lines.filter((row) => row.key !== line.key))}>Remove</button>
            </div>)}
            <div className="service-editor-subtotal">
                <button type="button" className="btn-secondary" onClick={() => setLines([...lines, emptyLine(nextKey.current++)])}>+ Add item</button>
                <strong>Total {money(lines.reduce((sum, row) => sum + Number(row.amount), 0))}</strong>
            </div>
            {error && <p role="alert" className="error">{error}</p>}
            <div className="service-controls">
                {visit && <button type="button" className="btn-link btn-danger-link" onClick={removeVisit}>Delete visit</button>}
                <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                <button className="btn-primary" type="submit">{busy ? 'Saving…' : 'Save visit'}</button>
            </div>
        </fieldset>
    </form>;
}

export default function CarServiceSection() {
    const money = useFormatMYR();
    const [data, setData] = useState<CarServiceOverview | null>(null);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<CarVisitType | 'All'>('All');
    const [expanded, setExpanded] = useState<number | null>(null);
    const [editor, setEditor] = useState<number | 'new' | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const request = useRef(0);
    const reload = useCallback(async () => {
        const token = ++request.current;
        setRefreshing(true);
        try {
            const result = await fetchCarServiceOverview();
            if (token === request.current) { setData(result); setError(''); }
        } catch (err) {
            if (token === request.current) setError(err instanceof Error ? err.message : 'Could not load service history.');
        } finally {
            if (token === request.current) setRefreshing(false);
        }
    }, []);
    useEffect(() => { void reload(); return () => { request.current++; }; }, [reload]);
    useRefreshSignal(reload);

    function saved(id: number | null) {
        setEditor(null);
        setQuery('');
        setTypeFilter('All');
        setExpanded(id);
        void reload();
    }

    const term = query.trim().toLowerCase();
    const visits = [...(data?.visits ?? [])].reverse().filter((visit) =>
        (typeFilter === 'All' || visit.visitType === typeFilter) &&
        [visit.visitType, visit.date, dateLabel(visit.date), visit.odometerKm?.toString(), visit.odometerKm == null ? null : km(visit.odometerKm), visit.notes,
            ...visit.items.flatMap((item) => [item.description, item.category])]
            .some((value) => value?.toLowerCase().includes(term)));
    const next = data?.summary.nextService;
    return <section className="panel service-log">
        <header className="service-top">
            <div><h2>Service history</h2>{data && <p>{data.summary.visitCount} visits
                {data.summary.latestOdometerKm !== null && ' · ' + km(data.summary.latestOdometerKm)}</p>}</div>
            <button type="button" className="btn-primary" disabled={!data || editor !== null || refreshing} onClick={() => setEditor('new')}>+ Add visit</button>
        </header>
        {data && <div className="service-spend" role="group" aria-label="Spending and visit filters">
            {(['All', ...carVisitTypes] as const).map((type) => {
                const total = type === 'All' ? data.summary.lifetimeTotal
                    : data.visits.reduce((sum, visit) => sum + (visit.visitType === type ? visit.total : 0), 0);
                return <button type="button" key={type} aria-pressed={typeFilter === type} disabled={editor !== null}
                    onClick={() => setTypeFilter(type)}>
                    <span>{type === 'All' ? 'Total spend' : type}</span><strong>{money(total)}</strong>
                </button>;
            })}
        </div>}
        {next && <div className="service-next"><strong>Next service</strong>
            <span>{dateLabel(next.byDate)} or {km(next.byOdometerKm)}, whichever comes first</span>
            {next.limitingFactor === 'km' && <span>Estimated {dateLabel(next.predictedDate)}</span>}
        </div>}
        {error && <p role="alert" className="error">{error} <button className="btn-link" onClick={reload}>Retry</button></p>}
        {!data && !error && <p>Loading visits…</p>}
        {data && <>
            {editor === 'new' && <VisitEditor initialType={typeFilter === 'All' ? 'Normal service' : typeFilter} data={data} onClose={() => setEditor(null)} onSaved={saved} />}
            {data.visits.length > 0 && <input className="service-search" type="search" aria-label="Search visits" placeholder="Search by item, date or mileage" value={query} disabled={editor !== null} onChange={(e) => setQuery(e.target.value)} />}
            {visits.map((visit) => <Fragment key={visit.id}>
                <div className="service-record">
                    <button className="service-row" aria-expanded={expanded === visit.id || editor === visit.id} disabled={editor !== null}
                        onClick={() => setExpanded(expanded === visit.id ? null : visit.id)}>
                        <span aria-hidden="true" className="service-chevron">{expanded === visit.id || editor === visit.id ? '▾' : '▸'}</span>
                        <span className="service-date">
                            <strong>{dateLabel(visit.date)}</strong>
                            {visit.visitType === 'Normal service' && visit.odometerKm != null && <small>{km(visit.odometerKm)}</small>}
                        </span>
                        <span className="service-preview"><b className="service-type">{visit.visitType}</b>{visit.items.map((item) => item.description).join(' · ') || visit.notes || 'No items recorded'}</span>
                        <strong className="service-cost">{money(visit.total)}</strong>
                    </button>
                    <button type="button" className="btn-link service-edit" aria-label={'Edit visit on ' + dateLabel(visit.date)} disabled={editor !== null || refreshing} onClick={() => setEditor(visit.id)}>Edit</button>
                </div>
                {editor === visit.id ? <VisitEditor visit={visit} data={data} onClose={() => setEditor(null)} onSaved={saved} />
                    : expanded === visit.id && <div className="service-detail">
                        {visit.items.map((item) => <div key={item.id}><span>{item.category}</span><strong>{item.description}</strong><span>{money(item.amount)}</span></div>)}
                        {!visit.items.length && <p>No items recorded.</p>}
                        {visit.notes && <p>{visit.notes}</p>}
                    </div>}
            </Fragment>)}
            {!visits.length && editor !== 'new' && <p className="muted">{term || typeFilter !== 'All' ? 'No visits match this filter.' : 'Add your first service visit to start the log.'}</p>}
        </>}
    </section>;
}
