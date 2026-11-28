import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { carVisitTypes, createCarServiceVisit, deleteCarServiceVisit, fetchCarServiceOverview, updateCarServiceVisit } from '../api';
import type { CarVisitType, CarServiceCategory, CarServiceOverview, CarServiceVisit, NextServiceSummary } from '../api';
import { useFormatMYR } from '../hooks/useAmountVisibility';
import { useRefreshSignal } from '../hooks/useRefreshSignal';
import { CalendarIcon, CarIcon, ChevronRightIcon, ClockIcon, ReceiptIcon, RepeatIcon, TagIcon, WalletIcon } from './icons';
import ConfirmDialog from './ConfirmDialog';
import ExportPdfButton from './ExportPdfButton';
import RecordModal from './RecordModal';
import SummaryCard from './SummaryCard';
import { carServiceReport } from '../utils/dashboardReports';
import { isTyreWork, nextTyreRotation, rotationTargets, TYRE_ITEMS, TYRE_ROTATION_KM, TYRE_ROTATION_MONTHS } from '../utils/tyreRotation';
import type { TyreRotation } from '../utils/tyreRotation';
import './CarServiceSection.css';

const categories: CarServiceCategory[] = ['Material', 'Lubricants', 'Labour', 'Other'];
const filters = ['All', ...carVisitTypes] as const;
const dayHeading = new Intl.DateTimeFormat('en-MY', { dateStyle: 'full', timeZone: 'UTC' });
const dateFormatter = new Intl.DateTimeFormat('en-MY', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dateLabel = (iso: string) => dateFormatter.format(new Date(iso + 'T00:00:00Z'));
const km = (value: number) => value.toLocaleString('en-MY') + ' km';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date());
const daysUntil = (iso: string) => Math.round((Date.parse(iso) - Date.parse(today())) / 86_400_000);
const days = (count: number) => count + (count === 1 ? ' day' : ' days');

function ServiceIcon({ type }: { type: CarVisitType }) {
    const Icon = type === 'Normal service' ? CarIcon : TagIcon;
    const tone = type === 'Normal service' ? 'blue' : 'amber';
    return <span aria-hidden="true" className={`category-icon category-icon--sm category-icon--${tone}`}>
        <Icon size={16} />
    </span>;
}

function dueStatus(date: string, kmReached = false) {
    const left = daysUntil(date);
    const when = kmReached ? 'Mileage reached' : left < 0 ? `Overdue by ${days(-left)}` : left === 0 ? 'Due today' : `In ${days(left)}`;
    return { when, variant: kmReached || left < 0 ? 'danger' as const : left <= 30 ? 'warning' as const : 'default' as const };
}

function TyreRotationCard({ rotation }: { rotation: TyreRotation }) {
    const { when, variant } = dueStatus(rotation.dueDate, rotation.kmReached);
    const limit = rotation.byOdometerKm == null
        ? `${TYRE_ROTATION_MONTHS} months after ${dateLabel(rotation.fromDate)}`
        : `by ${dateLabel(rotation.byDate)} or ${km(rotation.byOdometerKm)}`;
    return <SummaryCard tone="net" icon={<RepeatIcon size={26} />}
        label={rotation.estimated ? 'Tyre rotation (estimated)' : 'Tyre rotation'}
        value={dateLabel(rotation.dueDate)} variant={variant} sub={`${when} · ${limit}`} />;
}

/** When the next service falls due: the date limit, or earlier if the mileage will get there first. */
function NextServiceCard({ next }: { next: NextServiceSummary | null }) {
    if (!next) {
        return <SummaryCard tone="net" icon={<ClockIcon size={26} />} label="Next service" value="—"
            sub="Add a normal service to see when the next one is due" />;
    }
    const due = next.limitingFactor === 'km' ? next.predictedDate : next.byDate;
    const { when, variant } = dueStatus(due);
    return <SummaryCard tone="net" icon={<ClockIcon size={26} />}
        label={next.limitingFactor === 'km' ? 'Next service (estimated)' : 'Next service'}
        value={dateLabel(due)}
        variant={variant}
        sub={`${when} · by ${dateLabel(next.byDate)} or ${km(next.byOdometerKm)}, whichever comes first`} />;
}

type Line = { key: number; id?: number; category: CarServiceCategory; description: string; amount: string };
const emptyLine = (key: number): Line => ({ key, category: 'Material', description: '', amount: '' });

function VisitModal({ visit, initialType, data, onClose, onSaved }: {
    initialType: CarVisitType;
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
    const [error, setError] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const change = (key: number, patch: Partial<Line>) => setLines((rows) =>
        rows.map((row) => row.key === key ? { ...row, ...patch } : row));

    /** Picking a name used before also fills in what it cost last time. */
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

    const reading = odometer.trim() ? Number(odometer) : null;
    const validReading = reading == null || (Number.isInteger(reading) && reading >= 0);
    const tyreReminder = date && lines.some((line) => isTyreWork(line.description))
        ? rotationTargets(date, validReading ? reading : null)
        : null;

    async function save() {
        if (busy) return;
        if (!date) {
            setError('Enter the visit date.');
            return;
        }
        if (!validReading || (visitType === 'Normal service' && reading == null)) {
            setError('Enter the odometer reading in whole kilometres.');
            return;
        }
        const items = lines.filter((line) => line.description.trim() || line.amount || line.id)
            .map((line) => ({ id: line.id, category: line.category, description: line.description.trim(), amount: Number(line.amount) }));
        if (items.some((item) => !item.description || !Number.isFinite(item.amount) || item.amount <= 0)) {
            setError('Each item needs a name and an amount greater than zero.');
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const fields = { visitType, date, odometerKm: reading, notes: notes.trim() || null, items };
            const result = visit ? await updateCarServiceVisit(visit.id, fields) : await createCarServiceVisit(fields);
            onSaved(result.visit.id);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save visit.');
        } finally {
            setBusy(false);
        }
    }

    async function removeVisit() {
        setConfirmDelete(false);
        if (!visit) return;
        setBusy(true);
        setError(null);
        try {
            await deleteCarServiceVisit(visit.id);
            onSaved(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not delete visit.');
        } finally {
            setBusy(false);
        }
    }

    function submit(event: FormEvent) {
        event.preventDefault();
        void save();
    }

    return <>
        <RecordModal className="service-modal" title={visit ? 'Edit visit' : 'Add visit'} open saving={busy}
            error={error} onClose={onClose} onSave={() => void save()}>
            <form className="service-form" onSubmit={submit} noValidate>
                <fieldset disabled={busy}>
                    <div className="pill-group" role="group" aria-label="Visit type">
                        {carVisitTypes.map((type) => <button key={type} type="button" aria-pressed={visitType === type}
                            className={visitType === type ? 'pill-group-btn active' : 'pill-group-btn'}
                            onClick={() => setVisitType(type)}>{type}</button>)}
                    </div>
                    <div className="service-fields">
                        <label className="form-field"><span>Visit date</span>
                            <input autoFocus type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
                        <label className="form-field"><span>{visitType === 'Normal service' ? 'Odometer (km)' : 'Odometer (km, optional)'}</span>
                            <input type="number" inputMode="numeric" min="0" step="1" value={odometer}
                                placeholder={data.summary.latestOdometerKm != null ? 'Last: ' + km(data.summary.latestOdometerKm) : undefined}
                                onChange={(e) => setOdometer(e.target.value)} /></label>
                        <label className="form-field service-field-wide"><span>Title (optional)</span>
                            <input placeholder={"Shown in the list, e.g. 60,000 km service. Blank shows “" + visitType + "”"} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
                    </div>
                    <h5 className="service-items-title">Items</h5>
                    {categories.map((category) => <datalist key={category} id={'service-options-' + category}>
                        {[...new Set([
                            ...(category === 'Material' ? TYRE_ITEMS : []),
                            ...data.catalog.filter((item) => item.category === category).map((item) => item.description),
                        ])].map((name) => <option key={name} value={name} />)}
                    </datalist>)}
                    {lines.map((line, index) => <div className="service-line" key={line.key}>
                        <label className="form-field"><span>Category</span>
                            <select value={line.category} onChange={(e) => change(line.key, { category: e.target.value as CarServiceCategory })}>
                                {categories.map((category) => <option key={category}>{category}</option>)}
                            </select></label>
                        <label className="form-field service-line-name"><span>Item name</span>
                            <input list={'service-options-' + line.category} placeholder="Choose or type a name" value={line.description} onChange={(e) => selectItem(line, e.target.value)} /></label>
                        <label className="form-field"><span>Amount (RM)</span>
                            <input type="number" inputMode="decimal" min="0.01" step="0.01" value={line.amount} onChange={(e) => change(line.key, { amount: e.target.value })} /></label>
                        <button type="button" className="trip-txn-action trip-txn-action--danger" aria-label={'Remove item ' + (index + 1)} title="Remove item"
                            onClick={() => setLines(lines.filter((row) => row.key !== line.key))}>×</button>
                    </div>)}
                    <button type="button" className="show-more-btn" onClick={() => setLines([...lines, emptyLine(nextKey.current++)])}>+ Add item</button>
                    <p className="service-tyre-note" role="status">
                        {tyreReminder
                            ? <><strong>Next tyre rotation:</strong> {tyreReminder.byOdometerKm != null && km(tyreReminder.byOdometerKm) + ' or '}{dateLabel(tyreReminder.byDate)}
                                {tyreReminder.byOdometerKm == null && '. Add the odometer reading to track mileage too.'}</>
                            : <>Optional: add an item named “Tyre change” or “Tyre rotation” to get a rotation reminder after {km(TYRE_ROTATION_KM)} or {TYRE_ROTATION_MONTHS} months.</>}
                    </p>
                    <div className="service-total">
                        {visit ? <button type="button" className="btn-link btn-danger-link" onClick={() => setConfirmDelete(true)}>Delete visit</button> : <span />}
                        <strong>Total {money(lines.reduce((sum, row) => sum + Number(row.amount), 0))}</strong>
                    </div>
                </fieldset>
                {/* Lets Enter save from any field. */}
                <button type="submit" hidden />
            </form>
        </RecordModal>
        <ConfirmDialog open={confirmDelete} title="Delete visit?"
            message={visit ? `The visit on ${dateLabel(visit.date)} and its items will be permanently removed.` : ''}
            onConfirm={() => void removeVisit()} onCancel={() => setConfirmDelete(false)} />
    </>;
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
    const allVisits = data?.visits ?? [];
    const typeVisits = allVisits.filter((visit) => typeFilter === 'All' || visit.visitType === typeFilter);
    const visits = [...typeVisits].reverse().filter((visit) =>
        [visit.visitType, visit.date, dateLabel(visit.date), visit.odometerKm?.toString(), visit.odometerKm == null ? null : km(visit.odometerKm), visit.notes,
            ...visit.items.flatMap((item) => [item.description, item.category])]
            .some((value) => value?.toLowerCase().includes(term)));
    const sum = (list: CarServiceVisit[]) => list.reduce((total, visit) => total + visit.total, 0);
    const spend = sum(typeVisits);
    const latest = typeVisits.reduce<CarServiceVisit | null>((last, visit) => !last || visit.date >= last.date ? visit : last, null);
    const groups = new Map<string, CarServiceVisit[]>();
    for (const visit of visits) {
        const group = groups.get(visit.date);
        if (group) group.push(visit);
        else groups.set(visit.date, [visit]);
    }
    const editing = typeof editor === 'number' ? allVisits.find((visit) => visit.id === editor) : undefined;
    const rotation = data ? nextTyreRotation(data.visits, data.summary.latestOdometerKm, data.summary.nextService?.avgKmPerDay ?? null) : null;
    const addButton = <button type="button" className="btn-primary" disabled={!data} onClick={() => setEditor('new')}>+ Add visit</button>;

    return <section className="panel service-log">
        <div className="page-toolbar">
            <div className="page-toolbar-group">
                <div className="pill-group" role="group" aria-label="Visit type">
                    {filters.map((type) => <button key={type} type="button" aria-pressed={typeFilter === type}
                        className={typeFilter === type ? 'pill-group-btn active' : 'pill-group-btn'}
                        onClick={() => setTypeFilter(type)}>
                        {type === 'All' ? 'All' : type}
                    </button>)}
                </div>
            </div>
            <div className="page-toolbar-group">
                <ExportPdfButton sensitive disabled={!visits.length || !!error || refreshing}
                    build={() => carServiceReport(visits, typeFilter, query, money)} />
                {addButton}
            </div>
        </div>
        {error && <p role="alert" className="error">{error} <button type="button" className="btn-link" onClick={reload}>Retry</button></p>}
        {!data && !error && <p className="muted">Loading visits…</p>}
        {data && <div className="expenses-layout">
            <div className={rotation ? 'summary-grid-4' : 'budgets-summary-grid'}>
                <NextServiceCard next={data.summary.nextService} />
                {rotation && <TyreRotationCard rotation={rotation} />}
                <SummaryCard tone="spend" icon={<WalletIcon size={26} />}
                    label={typeFilter === 'All' ? 'Total spend' : typeFilter + ' spend'} value={money(spend)}
                    sub={typeVisits.length
                        ? `${typeVisits.length} ${typeVisits.length === 1 ? 'visit' : 'visits'} · ${money(spend / typeVisits.length)} on average`
                        : 'No visits yet'} />
                <SummaryCard tone="income" icon={<CalendarIcon size={26} />} label="Last visit"
                    value={latest ? dateLabel(latest.date) : '—'}
                    sub={latest ? [money(latest.total), latest.odometerKm != null ? km(latest.odometerKm) : latest.visitType].filter(Boolean).join(' · ') : undefined} />
            </div>
            <section className="card" aria-labelledby="service-history-title">
                <div className="variable-txns-header">
                    <div>
                        <h3 id="service-history-title">Service history</h3>
                        <p className="budgets-card-sub">{visits.length} {visits.length === 1 ? 'visit' : 'visits'} · {money(sum(visits))} · Select a visit to see its details</p>
                    </div>
                    {allVisits.length > 0 && <div className="variable-txns-tools">
                        <input type="search" aria-label="Search visits" placeholder="Search visits" value={query} onChange={(e) => setQuery(e.target.value)} />
                    </div>}
                </div>
                {Array.from(groups, ([date, group]) => <div key={date} className="trip-day">
                    <p className="trip-day-heading">{dayHeading.format(new Date(date + 'T00:00:00Z'))}</p>
                    <ul className="variable-txn-list">{group.map((visit) => <li key={visit.id}>
                        <button type="button" className="variable-txn variable-txn--clickable service-row" aria-expanded={expanded === visit.id}
                            onClick={() => setExpanded(expanded === visit.id ? null : visit.id)}>
                            <ServiceIcon type={visit.visitType} />
                            <span className="service-row-main">
                                <span className="variable-txn-title">{visit.notes || visit.visitType}</span>
                                <span className="variable-txn-meta">{[
                                    visit.notes && visit.visitType,
                                    visit.odometerKm != null && km(visit.odometerKm),
                                    `${visit.items.length} ${visit.items.length === 1 ? 'item' : 'items'}`,
                                ].filter(Boolean).join(' · ')}</span>
                            </span>
                            <span className="variable-txn-amount">{money(visit.total)}</span>
                            <span className="service-chevron" aria-hidden="true"><ChevronRightIcon size={16} /></span>
                        </button>
                        {expanded === visit.id && <div className="service-detail">
                            {visit.items.length > 0
                                ? <ul aria-label={'Items for the visit on ' + dateLabel(visit.date)}>
                                    {visit.items.map((item) => <li key={item.id}>
                                        <span>{item.description}<small>{item.category}</small></span>
                                        <span>{money(item.amount)}</span>
                                    </li>)}
                                </ul>
                                : <p className="muted">No items recorded.</p>}
                            <button type="button" className="btn-secondary" disabled={refreshing}
                                aria-label={'Edit visit on ' + dateLabel(visit.date)} onClick={() => setEditor(visit.id)}>Edit visit</button>
                        </div>}
                    </li>)}</ul>
                </div>)}
                {!visits.length && <div className="service-empty">
                    <span className="category-icon category-icon--blue" aria-hidden="true"><ReceiptIcon size={18} /></span>
                    <p className="muted">{allVisits.length ? 'No visits match this filter.' : 'Add your first service visit to start the log.'}</p>
                    {allVisits.length
                        ? <button type="button" className="btn-secondary" onClick={() => { setQuery(''); setTypeFilter('All'); }}>Show all visits</button>
                        : addButton}
                </div>}
            </section>
        </div>}
        {data && (editor === 'new' || editing) && <VisitModal key={editor} visit={editing} data={data}
            initialType={typeFilter === 'All' ? 'Normal service' : typeFilter}
            onClose={() => setEditor(null)} onSaved={saved} />}
    </section>;
}
