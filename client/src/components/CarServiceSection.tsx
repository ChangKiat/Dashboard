import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CarServiceCategory, CarServiceOverview, CarServiceVisit } from '../api';
import {
    createCarServiceVisit,
    deleteCarServiceVisit,
    fetchCarServiceOverview,
    updateCarServiceVisit,
    upsertCarServiceItem,
} from '../api';

const CATEGORIES: CarServiceCategory[] = ['Material', 'Lubricants', 'Labour', 'Other'];

type PendingItem = {
    category: CarServiceCategory;
    description: string;
    amount: string;
};

type VisitDraft = { date: string; odometerKm: string };

const EMPTY_ITEM: PendingItem = { category: 'Material', description: '', amount: '' };

function formatMYR(amount: number) {
    return `RM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
}

function formatKm(km: number) {
    return km.toLocaleString('en-MY');
}

function todayIsoKl(): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kuala_Lumpur',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
}

function daysUntil(iso: string): number {
    const [y, m, d] = iso.split('-').map(Number);
    const target = new Date(y, m - 1, d);
    const [ty, tm, td] = todayIsoKl().split('-').map(Number);
    const today = new Date(ty, tm - 1, td);
    return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function nextServiceStatusLabel(days: number): string {
    if (days < 0) return `${Math.abs(days)} days overdue`;
    if (days === 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
    return `Due in ${days} days`;
}

function cellKey(visitId: number, category: CarServiceCategory, description: string) {
    return `${visitId}::${category}::${description}`;
}

function cellAmount(
    visit: CarServiceVisit,
    category: CarServiceCategory,
    description: string
): number | null {
    const item = visit.items.find((i) => i.category === category && i.description === description);
    return item ? item.amount : null;
}

function buildLastPriceMap(visits: CarServiceVisit[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const visit of [...visits].reverse()) {
        for (const item of visit.items) {
            const key = `${item.category}::${item.description}`;
            if (!map.has(key)) map.set(key, item.amount);
        }
    }
    return map;
}

function amountForSelectedItem(
    category: CarServiceCategory,
    description: string,
    catalog: string[],
    lastPrices: Map<string, number>
): string | null {
    const trimmed = description.trim();
    if (!trimmed) return null;
    const isKnown = catalog.includes(trimmed) || lastPrices.has(`${category}::${trimmed}`);
    if (!isKnown) return null;
    const last = lastPrices.get(`${category}::${trimmed}`);
    return last != null ? String(last) : '';
}

function buildEditDrafts(visits: CarServiceVisit[], catalog: { category: CarServiceCategory; description: string }[]) {
    const visitDrafts: Record<number, VisitDraft> = {};
    const cellDrafts: Record<string, string> = {};

    for (const visit of visits) {
        visitDrafts[visit.id] = {
            date: visit.date,
            odometerKm: String(visit.odometerKm),
        };
        for (const row of catalog) {
            const amount = cellAmount(visit, row.category, row.description);
            if (amount != null) {
                cellDrafts[cellKey(visit.id, row.category, row.description)] = String(amount);
            }
        }
    }

    return { visitDrafts, cellDrafts };
}

export default function CarServiceSection() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<CarServiceOverview | null>(null);
    const [showVisitForm, setShowVisitForm] = useState(false);
    const [visitForm, setVisitForm] = useState({ date: '', odometerKm: '', notes: '' });
    const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
    const [itemDraft, setItemDraft] = useState<PendingItem>(EMPTY_ITEM);
    const [saving, setSaving] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [matrixEditMode, setMatrixEditMode] = useState(false);
    const [draftVisits, setDraftVisits] = useState<Record<number, VisitDraft>>({});
    const [draftCells, setDraftCells] = useState<Record<string, string>>({});
    const matrixScrollRef = useRef<HTMLDivElement>(null);
    const [matrixScroll, setMatrixScroll] = useState({ left: false, right: false });

    const loadData = useCallback(async () => {
        setData(await fetchCarServiceOverview());
    }, []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        loadData()
            .catch((err) => {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [loadData]);

    const catalogByCategory = useMemo(() => {
        const map = new Map<CarServiceCategory, string[]>();
        for (const cat of CATEGORIES) map.set(cat, []);
        for (const row of data?.catalog ?? []) {
            const list = map.get(row.category) ?? [];
            list.push(row.description);
            map.set(row.category, list);
        }
        return map;
    }, [data]);

    const lastPriceByItem = useMemo(
        () => buildLastPriceMap(data?.visits ?? []),
        [data?.visits]
    );

    const applyItemSelection = (draft: PendingItem, description: string): PendingItem => {
        const catalog = catalogByCategory.get(draft.category) ?? [];
        const autoAmount = amountForSelectedItem(draft.category, description, catalog, lastPriceByItem);
        return {
            ...draft,
            description,
            amount: autoAmount != null ? autoAmount : draft.amount,
        };
    };

    const refresh = async () => {
        await loadData();
        setActionError(null);
    };

    const closeVisitForm = () => {
        setShowVisitForm(false);
        setVisitForm({ date: '', odometerKm: '', notes: '' });
        setPendingItems([]);
        setItemDraft(EMPTY_ITEM);
    };

    const openCreateVisit = () => {
        setVisitForm({ date: '', odometerKm: '', notes: '' });
        setPendingItems([]);
        setItemDraft(EMPTY_ITEM);
        setShowVisitForm(true);
    };

    const enterMatrixEditMode = () => {
        if (!data || data.visits.length === 0) return;
        closeVisitForm();
        const { visitDrafts, cellDrafts } = buildEditDrafts(data.visits, data.catalog);
        setDraftVisits(visitDrafts);
        setDraftCells(cellDrafts);
        setMatrixEditMode(true);
        setActionError(null);
    };

    const cancelMatrixEditMode = () => {
        setMatrixEditMode(false);
        setDraftVisits({});
        setDraftCells({});
        setActionError(null);
    };

    const addPendingItem = () => {
        const amount = parseFloat(itemDraft.amount);
        if (!itemDraft.description.trim() || !Number.isFinite(amount) || amount <= 0) {
            setActionError('Enter item description and amount.');
            return;
        }
        setActionError(null);
        setPendingItems((rows) => [
            ...rows,
            {
                category: itemDraft.category,
                description: itemDraft.description.trim(),
                amount: itemDraft.amount,
            },
        ]);
        setItemDraft({ category: itemDraft.category, description: '', amount: '' });
    };

    const removePendingItem = (index: number) => {
        setPendingItems((rows) => rows.filter((_, i) => i !== index));
    };

    const parsePendingItems = () =>
        pendingItems
            .map((row) => ({
                category: row.category,
                description: row.description,
                amount: parseFloat(row.amount),
            }))
            .filter((row) => row.description && Number.isFinite(row.amount) && row.amount > 0);

    const handleCreateVisit = async () => {
        const odometerKm = parseInt(visitForm.odometerKm, 10);
        if (!visitForm.date || !Number.isInteger(odometerKm) || odometerKm < 0) {
            setActionError('Enter a valid date and odometer.');
            return;
        }
        setSaving(true);
        setActionError(null);
        try {
            await createCarServiceVisit({
                date: visitForm.date,
                odometerKm,
                notes: visitForm.notes.trim() || null,
                items: parsePendingItems(),
            });
            closeVisitForm();
            await refresh();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to save visit');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteVisit = async (visit: CarServiceVisit) => {
        if (!window.confirm(`Delete service on ${formatDate(visit.date)}?`)) return;
        setSaving(true);
        setActionError(null);
        try {
            await deleteCarServiceVisit(visit.id);
            setDraftVisits((prev) => {
                const next = { ...prev };
                delete next[visit.id];
                return next;
            });
            setDraftCells((prev) => {
                const next = { ...prev };
                for (const key of Object.keys(next)) {
                    if (key.startsWith(`${visit.id}::`)) delete next[key];
                }
                return next;
            });
            await refresh();
            if (data && data.visits.length <= 1) cancelMatrixEditMode();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to delete visit');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveMatrix = async () => {
        if (!data) return;
        setSaving(true);
        setActionError(null);
        try {
            for (const visit of data.visits) {
                const draft = draftVisits[visit.id];
                if (!draft) continue;

                const odometerKm = parseInt(draft.odometerKm, 10);
                if (!draft.date || !Number.isInteger(odometerKm) || odometerKm < 0) {
                    throw new Error(`Invalid date or odometer for ${formatDate(visit.date)}`);
                }

                if (draft.date !== visit.date || odometerKm !== visit.odometerKm) {
                    await updateCarServiceVisit(visit.id, {
                        date: draft.date,
                        odometerKm,
                        notes: visit.notes,
                    });
                }

                for (const row of data.catalog) {
                    const key = cellKey(visit.id, row.category, row.description);
                    const raw = draftCells[key] ?? '';
                    const trimmed = raw.trim();
                    const amount = trimmed === '' ? 0 : parseFloat(trimmed);
                    if (!Number.isFinite(amount) || amount < 0) {
                        throw new Error(`Invalid amount for ${row.description}`);
                    }

                    const existing = cellAmount(visit, row.category, row.description);
                    const unchanged =
                        (existing == null && trimmed === '') ||
                        (existing != null && trimmed !== '' && amount === existing);
                    if (unchanged) continue;

                    await upsertCarServiceItem(visit.id, {
                        category: row.category,
                        description: row.description,
                        amount,
                    });
                }
            }

            cancelMatrixEditMode();
            await refresh();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to save changes');
        } finally {
            setSaving(false);
        }
    };

    const setDraftCell = (key: string, value: string) => {
        setDraftCells((prev) => ({ ...prev, [key]: value }));
    };

    const setDraftVisit = (visitId: number, patch: Partial<VisitDraft>) => {
        setDraftVisits((prev) => ({
            ...prev,
            [visitId]: { ...prev[visitId], ...patch },
        }));
    };

    const updateMatrixScrollHints = useCallback(() => {
        const el = matrixScrollRef.current;
        if (!el) return;
        setMatrixScroll({
            left: el.scrollLeft > 4,
            right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
        });
    }, []);

    useEffect(() => {
        updateMatrixScrollHints();
        const el = matrixScrollRef.current;
        if (!el) return;
        const observer = new ResizeObserver(updateMatrixScrollHints);
        observer.observe(el);
        return () => observer.disconnect();
    }, [data?.visits.length, matrixEditMode, updateMatrixScrollHints]);

    const scrollMatrix = (direction: -1 | 1) => {
        matrixScrollRef.current?.scrollBy({ left: direction * 280, behavior: 'smooth' });
    };

    if (loading) return <section className="panel"><p className="muted">Loading car service…</p></section>;
    if (error || !data) {
        return (
            <section className="panel">
                <p className="error">{error ?? 'Failed to load'}</p>
            </section>
        );
    }

    const { summary, visits, itemTotals } = data;

    return (
        <section className="panel car-service-section">
            <div className="trips-summary-strip">
                <div className="trips-summary-item trips-summary-item--total">
                    <span className="trips-summary-label">Total spend</span>
                    <span className="trips-summary-value">{formatMYR(summary.lifetimeTotal)}</span>
                </div>
                <div className="trips-summary-item">
                    <span className="trips-summary-label">Visits</span>
                    <span className="trips-summary-value">{summary.visitCount}</span>
                </div>
                <div className="trips-summary-item">
                    <span className="trips-summary-label">Latest odometer</span>
                    <span className="trips-summary-value">
                        {summary.latestOdometerKm != null ? `${formatKm(summary.latestOdometerKm)} km` : '—'}
                    </span>
                </div>
                {summary.nextService && (
                    <div className="trips-summary-item car-service-next-summary">
                        <span className="trips-summary-label">Next service</span>
                        <span className="trips-summary-value">
                            {formatDate(summary.nextService.predictedDate)}
                        </span>
                        <span className="car-service-next-detail muted">
                            {formatKm(summary.nextService.byOdometerKm)} km · 6 months
                            {' · '}
                            {nextServiceStatusLabel(daysUntil(summary.nextService.predictedDate))}
                            {summary.nextService.limitingFactor === 'km' ? ' (km)' : ' (date)'}
                        </span>
                    </div>
                )}
            </div>

            {actionError && <p className="error">{actionError}</p>}

            <div className="car-service-toolbar">
                <p className="muted car-service-hint">
                    {matrixEditMode
                        ? 'Edit costs below. Leave blank to remove an item.'
                        : 'Use Edit to change visits and costs.'}
                </p>
                <div className="car-service-toolbar-actions">
                    {matrixEditMode ? (
                        <>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={cancelMatrixEditMode}
                                disabled={saving}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={() => void handleSaveMatrix()}
                                disabled={saving}
                            >
                                Save changes
                            </button>
                        </>
                    ) : (
                        <>
                            {visits.length > 0 && (
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={enterMatrixEditMode}
                                    disabled={saving || showVisitForm}
                                >
                                    Edit
                                </button>
                            )}
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={openCreateVisit}
                                disabled={saving || matrixEditMode}
                            >
                                Add visit
                            </button>
                        </>
                    )}
                </div>
            </div>

            {showVisitForm && !matrixEditMode && (
                <div className="trips-form car-service-visit-form">
                    <label>
                        Date
                        <input
                            type="date"
                            value={visitForm.date}
                            onChange={(e) => setVisitForm((f) => ({ ...f, date: e.target.value }))}
                        />
                    </label>
                    <label>
                        Odometer (km)
                        <input
                            type="number"
                            min={0}
                            step={1}
                            value={visitForm.odometerKm}
                            onChange={(e) => setVisitForm((f) => ({ ...f, odometerKm: e.target.value }))}
                        />
                    </label>
                    <label className="span-full">
                        Notes
                        <input
                            type="text"
                            value={visitForm.notes}
                            onChange={(e) => setVisitForm((f) => ({ ...f, notes: e.target.value }))}
                            placeholder="Optional"
                        />
                    </label>

                    <div className="span-full car-service-items-heading">Items</div>
                    <label>
                        Category
                        <select
                            value={itemDraft.category}
                            onChange={(e) =>
                                setItemDraft({
                                    category: e.target.value as CarServiceCategory,
                                    description: '',
                                    amount: '',
                                })
                            }
                        >
                            {CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                    {c}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Item
                        <input
                            list={`car-items-${itemDraft.category}`}
                            value={itemDraft.description}
                            onChange={(e) => setItemDraft((f) => applyItemSelection(f, e.target.value))}
                            onBlur={(e) => setItemDraft((f) => applyItemSelection(f, e.target.value))}
                            placeholder="e.g. Oil Filter (1.5TD)"
                        />
                        <datalist id={`car-items-${itemDraft.category}`}>
                            {(catalogByCategory.get(itemDraft.category) ?? []).map((d) => (
                                <option key={d} value={d} />
                            ))}
                        </datalist>
                    </label>
                    <label>
                        Amount (RM)
                        <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={itemDraft.amount}
                            onChange={(e) => setItemDraft((f) => ({ ...f, amount: e.target.value }))}
                        />
                    </label>
                    <div className="trips-form-actions">
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={addPendingItem}
                            disabled={saving}
                        >
                            Add item
                        </button>
                    </div>

                    {pendingItems.length > 0 && (
                        <div className="car-service-pending-wrap span-full">
                            <div className="car-service-pending-header">
                                <span className="car-service-pending-title">Added items</span>
                                <span className="car-service-pending-total">
                                    {formatMYR(
                                        pendingItems.reduce((sum, row) => sum + parseFloat(row.amount), 0)
                                    )}
                                </span>
                            </div>
                            <table className="data-table car-service-pending-table">
                                <thead>
                                    <tr>
                                        <th>Category</th>
                                        <th>Item</th>
                                        <th className="trips-col-num">Amount</th>
                                        <th className="actions-col" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {pendingItems.map((row, index) => (
                                        <tr key={`${row.category}-${row.description}-${index}`}>
                                            <td className="car-service-pending-cat">{row.category}</td>
                                            <td>{row.description}</td>
                                            <td className="trips-col-num">
                                                {formatMYR(parseFloat(row.amount))}
                                            </td>
                                            <td className="actions-col">
                                                <button
                                                    type="button"
                                                    className="btn-link btn-danger-link"
                                                    onClick={() => removePendingItem(index)}
                                                    disabled={saving}
                                                >
                                                    Remove
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div className="trips-form-actions span-full">
                        <button type="button" className="btn-secondary" onClick={closeVisitForm} disabled={saving}>
                            Cancel
                        </button>
                        <button type="button" className="btn-primary" onClick={handleCreateVisit} disabled={saving}>
                            Create visit
                        </button>
                    </div>
                </div>
            )}

            {visits.length === 0 ? (
                <p className="muted">No service visits yet. Add one to start.</p>
            ) : (
                <div className="car-service-scroll-shell">
                    <button
                        type="button"
                        className="car-service-scroll-btn car-service-scroll-btn--prev"
                        aria-label="Scroll left"
                        disabled={!matrixScroll.left}
                        onClick={() => scrollMatrix(-1)}
                    >
                        ‹
                    </button>
                    <div
                        ref={matrixScrollRef}
                        className={`car-service-matrix-wrap scroll-strip${matrixEditMode ? ' car-service-matrix-wrap--edit' : ''}`}
                        onScroll={updateMatrixScrollHints}
                    >
                        <table className="data-table car-service-matrix">
                        <thead>
                            <tr>
                                <th className="car-service-sticky">Item</th>
                                {visits.map((v) => {
                                    const draft = draftVisits[v.id];
                                    return (
                                        <th key={v.id} className="car-service-visit-col">
                                            {matrixEditMode && draft ? (
                                                <>
                                                    <input
                                                        className="car-service-header-input"
                                                        type="date"
                                                        value={draft.date}
                                                        onChange={(e) =>
                                                            setDraftVisit(v.id, { date: e.target.value })
                                                        }
                                                        disabled={saving}
                                                    />
                                                    <input
                                                        className="car-service-header-input car-service-header-input--odo"
                                                        type="number"
                                                        min={0}
                                                        step={1}
                                                        value={draft.odometerKm}
                                                        onChange={(e) =>
                                                            setDraftVisit(v.id, { odometerKm: e.target.value })
                                                        }
                                                        placeholder="km"
                                                        disabled={saving}
                                                    />
                                                    <button
                                                        type="button"
                                                        className="btn-danger car-service-visit-btn"
                                                        onClick={() => void handleDeleteVisit(v)}
                                                        disabled={saving}
                                                    >
                                                        Delete
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="car-service-visit-date">{formatDate(v.date)}</div>
                                                    <div className="car-service-odo">{formatKm(v.odometerKm)} km</div>
                                                </>
                                            )}
                                        </th>
                                    );
                                })}
                                <th className="trips-col-num car-service-total-col">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {CATEGORIES.map((category) => {
                                const descriptions = catalogByCategory.get(category) ?? [];
                                if (descriptions.length === 0) return null;
                                return (
                                    <CategoryRows
                                        key={category}
                                        category={category}
                                        descriptions={descriptions}
                                        visits={visits}
                                        itemTotals={itemTotals}
                                        matrixEditMode={matrixEditMode}
                                        draftCells={draftCells}
                                        onDraftCellChange={setDraftCell}
                                    />
                                );
                            })}
                            <tr className="car-service-total-row">
                                <td className="car-service-sticky">
                                    <strong>Visit total</strong>
                                </td>
                                {visits.map((v, visitIndex) => (
                                    <td
                                        key={v.id}
                                        className={`trips-col-num car-service-visit-data${
                                            visitIndex % 2 === 1 ? ' car-service-visit-data--alt' : ''
                                        }`}
                                    >
                                        <strong>{v.total > 0 ? formatMYR(v.total) : '—'}</strong>
                                    </td>
                                ))}
                                <td className="trips-col-num car-service-total-col">
                                    <strong>{formatMYR(summary.lifetimeTotal)}</strong>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    </div>
                    <button
                        type="button"
                        className="car-service-scroll-btn car-service-scroll-btn--next"
                        aria-label="Scroll right"
                        disabled={!matrixScroll.right}
                        onClick={() => scrollMatrix(1)}
                    >
                        ›
                    </button>
                </div>
            )}
        </section>
    );
}

function CategoryRows({
    category,
    descriptions,
    visits,
    itemTotals,
    matrixEditMode,
    draftCells,
    onDraftCellChange,
}: {
    category: CarServiceCategory;
    descriptions: string[];
    visits: CarServiceVisit[];
    itemTotals: CarServiceOverview['itemTotals'];
    matrixEditMode: boolean;
    draftCells: Record<string, string>;
    onDraftCellChange: (key: string, value: string) => void;
}) {
    return (
        <>
            <tr className="car-service-category-row">
                <td className="car-service-sticky car-service-category-label">{category}</td>
                <td className="car-service-category-fill" colSpan={visits.length} />
                <td className="car-service-category-fill car-service-total-col" />
            </tr>
            {descriptions.map((description) => {
                const rowTotal =
                    itemTotals.find((t) => t.category === category && t.description === description)
                        ?.total ?? 0;
                return (
                    <tr key={`${category}-${description}`}>
                        <td className="car-service-sticky">{description}</td>
                        {visits.map((visit, visitIndex) => {
                            const amount = cellAmount(visit, category, description);
                            const key = cellKey(visit.id, category, description);
                            const draftValue = draftCells[key] ?? (amount != null ? String(amount) : '');

                            return (
                                <td
                                    key={visit.id}
                                    className={`trips-col-num car-service-cell car-service-visit-data${
                                        visitIndex % 2 === 1 ? ' car-service-visit-data--alt' : ''
                                    }`}
                                >
                                    {matrixEditMode ? (
                                        <input
                                            className="car-service-cell-input"
                                            type="number"
                                            min={0}
                                            step={0.01}
                                            value={draftValue}
                                            placeholder="—"
                                            onChange={(e) => onDraftCellChange(key, e.target.value)}
                                        />
                                    ) : amount != null ? (
                                        <span className="car-service-cell-value">{amount.toFixed(2)}</span>
                                    ) : (
                                        <span className="car-service-cell-value car-service-cell-value--empty">—</span>
                                    )}
                                </td>
                            );
                        })}
                        <td className="trips-col-num car-service-total-col">
                            {rowTotal > 0 ? formatMYR(rowTotal) : '—'}
                        </td>
                    </tr>
                );
            })}
        </>
    );
}
