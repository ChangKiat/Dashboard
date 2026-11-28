import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { assetImageUrl, deleteAsset, fetchAssets, saveAsset, uploadAssetImage } from '../api';
import type { Asset, AssetFields, AssetStatus } from '../api';
import { useFormatMYR } from '../hooks/useAmountVisibility';
import { useRefreshSignal } from '../hooks/useRefreshSignal';
import AssetPhotoPicker from './AssetPhotoPicker';
import type { PictureState } from './AssetPhotoPicker';
import ConfirmDialog from './ConfirmDialog';
import { BoxIcon, TrendUpIcon, WalletIcon } from './icons';
import RecordModal from './RecordModal';
import SummaryCard from './SummaryCard';
import './AssetsSection.css';

const CATEGORIES = ['Computer', 'Accessory', 'Phone & tablet', 'Car', 'Appliance', 'Furniture', 'Other'];
const STATUS_LABELS: Record<AssetStatus, string> = { active: 'Active', sold: 'Sold', broken: 'Broken' };

const dateFormatter = new Intl.DateTimeFormat('en-MY', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dateLabel = (iso: string) => dateFormatter.format(new Date(iso + 'T00:00:00Z'));
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date());
const count = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;

function ownedFor(iso: string) {
    const [year, month, day] = iso.split('-').map(Number);
    const [nowYear, nowMonth, nowDay] = today().split('-').map(Number);
    const months = (nowYear - year) * 12 + (nowMonth - month) - (nowDay < day ? 1 : 0);
    if (months < 0) return 'Not yet bought';
    if (months < 1) return 'Under a month';
    const years = Math.floor(months / 12);
    return [years && `${years} yr`, months % 12 && `${months % 12} mo`].filter(Boolean).join(' ');
}

function AssetModal({ asset, initialCategory, onClose, onSaved }: {
    asset?: Asset;
    initialCategory: string;
    onClose: () => void;
    onSaved: (status?: AssetStatus) => void;
}) {
    const [name, setName] = useState(asset?.name ?? '');
    const [category, setCategory] = useState(asset?.category ?? initialCategory);
    const [status, setStatus] = useState<AssetStatus>(asset?.status ?? 'active');
    const [purchaseDate, setPurchaseDate] = useState(asset?.purchaseDate ?? today());
    const [purchaseValue, setPurchaseValue] = useState(asset?.purchaseValue.toString() ?? '');
    const [currentValue, setCurrentValue] = useState(asset?.currentValue?.toString() ?? '');
    const [notes, setNotes] = useState(asset?.notes ?? '');
    const [picture, setPicture] = useState<PictureState>({ pending: false, image: null });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    /** Set once a new asset exists, so saving again after a failed picture upload does not add it twice. */
    const savedId = useRef<number | null>(asset?.id ?? null);
    const savedStatus = useRef<AssetStatus | undefined>(undefined);

    async function save() {
        if (busy) return;
        const bought = Number(purchaseValue);
        const worth = currentValue.trim() ? Number(currentValue) : null;
        if (!name.trim()) return setError('Enter a name.');
        if (!purchaseDate) return setError('Enter the purchase date.');
        if (!purchaseValue.trim() || !Number.isFinite(bought) || bought < 0) return setError('Enter the purchase value.');
        if (worth != null && (!Number.isFinite(worth) || worth < 0)) return setError('Current value cannot be below zero.');
        if (picture.pending) return setError('Press “Cut out item” or “Use photo as is”, or discard the new photo.');
        setBusy(true);
        setError(null);
        const fields: AssetFields = {
            name: name.trim(), category, status, purchaseDate, purchaseValue: bought,
            currentValue: worth, notes: notes.trim() || null,
        };
        try {
            savedId.current = (await saveAsset(savedId.current, fields)).id;
            savedStatus.current = status;
            if (picture.image) await uploadAssetImage(savedId.current, picture.image);
            onSaved(status);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save the asset.');
        } finally {
            setBusy(false);
        }
    }

    async function remove() {
        setConfirmDelete(false);
        if (savedId.current == null) return;
        setBusy(true);
        setError(null);
        try {
            await deleteAsset(savedId.current);
            onSaved();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not delete the asset.');
        } finally {
            setBusy(false);
        }
    }

    function submit(event: FormEvent) {
        event.preventDefault();
        void save();
    }

    return <>
        <RecordModal className="asset-modal" title={asset ? 'Edit asset' : 'Add asset'} open saving={busy}
            error={error} onSave={() => void save()}
            onClose={() => (savedStatus.current ? onSaved(savedStatus.current) : onClose())}>
            <form className="asset-form" onSubmit={submit} noValidate>
                <AssetPhotoPicker disabled={busy} onChange={setPicture}
                    currentImageUrl={asset?.imageVersion ? assetImageUrl(asset) : null} />
                <div className="asset-fields">
                    <label className="form-field asset-field-wide"><span>Name</span>
                        <input autoFocus maxLength={200} placeholder="e.g. Work laptop" value={name} disabled={busy}
                            onChange={(e) => setName(e.target.value)} /></label>
                    <label className="form-field"><span>Category</span>
                        <select value={category} disabled={busy} onChange={(e) => setCategory(e.target.value)}>
                            {CATEGORIES.map((option) => <option key={option}>{option}</option>)}
                        </select></label>
                    <label className="form-field"><span>Purchase date</span>
                        <input type="date" value={purchaseDate} disabled={busy} onChange={(e) => setPurchaseDate(e.target.value)} /></label>
                    <label className="form-field"><span>Purchase value (RM)</span>
                        <input type="number" inputMode="decimal" min="0" step="0.01" value={purchaseValue} disabled={busy}
                            onChange={(e) => setPurchaseValue(e.target.value)} /></label>
                    <label className="form-field"><span>Current value (RM, optional)</span>
                        <input type="number" inputMode="decimal" min="0" step="0.01" value={currentValue} disabled={busy}
                            onChange={(e) => setCurrentValue(e.target.value)} /></label>
                    <label className="form-field"><span>Status</span>
                        <select value={status} disabled={busy} onChange={(e) => setStatus(e.target.value as AssetStatus)}>
                            {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select></label>
                    <label className="form-field asset-field-wide"><span>Notes (optional)</span>
                        <textarea maxLength={2000} placeholder="Model, serial number, warranty…" value={notes} disabled={busy}
                            onChange={(e) => setNotes(e.target.value)} /></label>
                </div>
                {asset && <button type="button" className="btn-link btn-danger-link asset-delete" disabled={busy}
                    onClick={() => setConfirmDelete(true)}>Delete asset</button>}
                {/* Lets Enter save from any field. */}
                <button type="submit" hidden />
            </form>
        </RecordModal>
        <ConfirmDialog open={confirmDelete} title="Delete asset?"
            message={asset ? `“${asset.name}” and its picture will be permanently removed.` : ''}
            onConfirm={() => void remove()} onCancel={() => setConfirmDelete(false)} />
    </>;
}

export default function AssetsSection() {
    const money = useFormatMYR();
    const [data, setData] = useState<Asset[] | null>(null);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('All');
    const [showHistory, setShowHistory] = useState(false);
    const [editor, setEditor] = useState<number | 'new' | null>(null);
    const request = useRef(0);
    const reload = useCallback(async () => {
        const token = ++request.current;
        try {
            const result = await fetchAssets();
            if (token === request.current) { setData(result); setError(''); }
        } catch (err) {
            if (token === request.current) setError(err instanceof Error ? err.message : 'Could not load assets.');
        }
    }, []);
    useEffect(() => { void reload(); return () => { request.current++; }; }, [reload]);
    useRefreshSignal(reload);

    function saved(status?: AssetStatus) {
        setEditor(null);
        setFilter('All');
        if (status) setShowHistory(status !== 'active');
        void reload();
    }

    const all = data ?? [];
    const assetsInView = all.filter((asset) => (asset.status !== 'active') === showHistory);
    const used = CATEGORIES.filter((category) => assetsInView.some((asset) => asset.category === category));
    const active = used.includes(filter) ? filter : 'All';
    // Newest purchase first.
    const shown = assetsInView.filter((asset) => active === 'All' || asset.category === active).reverse();
    const paid = shown.reduce((sum, asset) => sum + asset.purchaseValue, 0);
    const worth = shown.reduce((sum, asset) => sum + (asset.currentValue ?? asset.purchaseValue), 0);
    const unvalued = shown.filter((asset) => asset.currentValue == null).length;
    const editing = typeof editor === 'number' ? all.find((asset) => asset.id === editor) : undefined;
    const addButton = <button type="button" className="btn-primary" disabled={!data} onClick={() => setEditor('new')}>+ Add asset</button>;

    return <section className="panel assets-page">
        <div className="pill-group asset-views" role="group" aria-label="Asset view">
            {[false, true].map((history) => <button key={String(history)} type="button"
                aria-pressed={showHistory === history}
                className={showHistory === history ? 'pill-group-btn active' : 'pill-group-btn'}
                onClick={() => { setShowHistory(history); setFilter('All'); }}>
                {history ? 'History' : 'Active'}
            </button>)}
        </div>
        <div className="page-toolbar">
            <div className="page-toolbar-group">
                {used.length > 0 && <div className="pill-group assets-filter" role="group" aria-label="Category">
                    {['All', ...used].map((category) => <button key={category} type="button" aria-pressed={active === category}
                        className={active === category ? 'pill-group-btn active' : 'pill-group-btn'}
                        onClick={() => setFilter(category)}>{category}</button>)}
                </div>}
            </div>
            <div className="page-toolbar-group">{addButton}</div>
        </div>
        {error && <p role="alert" className="error">{error} <button type="button" className="btn-link" onClick={reload}>Retry</button></p>}
        {!data && !error && <p className="muted">Loading assets…</p>}
        {data && <div className="expenses-layout">
            {!showHistory && <div className="budgets-summary-grid">
                <SummaryCard tone="net" icon={<BoxIcon size={26} />} label={active === 'All' ? 'Items owned' : active}
                    value={count(shown.length)} />
                <SummaryCard tone="spend" icon={<WalletIcon size={26} />} label="Total paid" value={money(paid)} />
                <SummaryCard tone="income" icon={<TrendUpIcon size={26} />} label="Worth now" value={money(worth)}
                    sub={unvalued ? `${count(unvalued)} without a current value, counted at the price paid` : undefined} />
            </div>}
            {shown.length > 0
                ? <ul className="asset-grid">{shown.map((asset) => <li key={asset.id}>
                    <button type="button" className="asset-card" onClick={() => setEditor(asset.id)}>
                        <span className="asset-card-picture">
                            {asset.imageVersion
                                ? <img src={assetImageUrl(asset)} alt="" loading="lazy" />
                                : <BoxIcon size={48} />}
                        </span>
                        <span className="asset-card-name">{asset.name}</span>
                        <span className="asset-card-meta">{asset.category} · {dateLabel(asset.purchaseDate)}{!showHistory && ` · ${ownedFor(asset.purchaseDate)}`}</span>
                        {showHistory && <span className="asset-card-meta">{STATUS_LABELS[asset.status]}</span>}
                        <span className="asset-card-value">{money(asset.purchaseValue)}</span>
                        {!showHistory && asset.currentValue != null && <span className="asset-card-meta">Worth now {money(asset.currentValue)}</span>}
                    </button>
                </li>)}</ul>
                : <div className="card asset-empty">
                    <span className="category-icon category-icon--blue" aria-hidden="true"><BoxIcon size={18} /></span>
                    <p className="muted">{showHistory ? 'Sold and broken assets appear here.' : 'No active assets.'}</p>
                    {!showHistory && addButton}
                </div>}
        </div>}
        {data && (editor === 'new' || editing) && <AssetModal key={editor} asset={editing}
            initialCategory={active === 'All' ? CATEGORIES[0] : active}
            onClose={() => setEditor(null)} onSaved={saved} />}
    </section>;
}
