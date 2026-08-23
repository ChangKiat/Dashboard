import { useCallback, useEffect, useMemo, useState } from 'react';

import type { CarServiceCategory, CarServiceOverview, CarServiceVisit } from '../api';
import {
    createCarServiceVisit,
    deleteCarServiceVisit,
    fetchCarServiceOverview,
    updateCarServiceVisit,
    upsertCarServiceItem,
} from '../api';

const CATEGORIES: CarServiceCategory[] = ['Material', 'Lubricants', 'Labour', 'Other'];

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

function cellAmount(
    visit: CarServiceVisit,
    category: CarServiceCategory,
    description: string
): number | null {
    const item = visit.items.find((i) => i.category === category && i.description === description);
    return item ? item.amount : null;
}

export default function CarServiceSection() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<CarServiceOverview | null>(null);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [showVisitForm, setShowVisitForm] = useState(false);
    const [editingVisitId, setEditingVisitId] = useState<number | null>(null);
    const [visitForm, setVisitForm] = useState({ date: '', odometerKm: '', notes: '' });
    const [itemForm, setItemForm] = useState({
        category: 'Material' as CarServiceCategory,
        description: '',
        amount: '',
    });
    const [saving, setSaving] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [editingCell, setEditingCell] = useState<{
        visitId: number;
        category: CarServiceCategory;
        description: string;
        value: string;
    } | null>(null);

    const loadData = useCallback(async () => {
        const overview = await fetchCarServiceOverview();
        setData(overview);
        setSelectedId((prev) => {
            if (prev != null && overview.visits.some((v) => v.id === prev)) return prev;
            return overview.visits.length > 0 ? overview.visits[overview.visits.length - 1].id : null;
        });
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

    const selected = useMemo(
        () => data?.visits.find((v) => v.id === selectedId) ?? null,
        [data, selectedId]
    );

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

    const refresh = async () => {
        await loadData();
        setActionError(null);
    };

    const handleCreateVisit = async () => {
        const odometerKm = parseInt(visitForm.odometerKm, 10);
        if (!visitForm.date || !Number.isInteger(odometerKm) || odometerKm < 0) {
            setActionError('Enter a valid date and odometer.');
            return;
        }
        setSaving(true);
        setActionError(null);
        try {
            const res = await createCarServiceVisit({
                date: visitForm.date,
                odometerKm,
                notes: visitForm.notes.trim() || null,
            });
            setVisitForm({ date: '', odometerKm: '', notes: '' });
            setShowVisitForm(false);
            setEditingVisitId(null);
            await refresh();
            setSelectedId(res.visit.id);
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to save visit');
        } finally {
            setSaving(false);
        }
    };

    const handleUpdateVisit = async () => {
        if (editingVisitId == null) return;
        const odometerKm = parseInt(visitForm.odometerKm, 10);
        if (!visitForm.date || !Number.isInteger(odometerKm) || odometerKm < 0) {
            setActionError('Enter a valid date and odometer.');
            return;
        }
        setSaving(true);
        setActionError(null);
        try {
            const id = editingVisitId;
            await updateCarServiceVisit(id, {
                date: visitForm.date,
                odometerKm,
                notes: visitForm.notes.trim() || null,
            });
            setShowVisitForm(false);
            setEditingVisitId(null);
            await refresh();
            setSelectedId(id);
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to update visit');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteVisit = async () => {
        if (!selected) return;
        if (!window.confirm(`Delete service on ${formatDate(selected.date)}?`)) return;
        setSaving(true);
        setActionError(null);
        try {
            await deleteCarServiceVisit(selected.id);
            setSelectedId(null);
            setShowVisitForm(false);
            setEditingVisitId(null);
            await refresh();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to delete visit');
        } finally {
            setSaving(false);
        }
    };

    const openEditVisit = () => {
        if (!selected) return;
        setEditingVisitId(selected.id);
        setVisitForm({
            date: selected.date,
            odometerKm: String(selected.odometerKm),
            notes: selected.notes ?? '',
        });
        setShowVisitForm(true);
    };

    const openCreateVisit = () => {
        setEditingVisitId(null);
        setVisitForm({ date: '', odometerKm: '', notes: '' });
        setShowVisitForm(true);
        setSelectedId(null);
    };

    const handleAddItem = async () => {
        if (!selected) return;
        const amount = parseFloat(itemForm.amount);
        if (!itemForm.description.trim() || !Number.isFinite(amount) || amount <= 0) {
            setActionError('Enter item description and amount.');
            return;
        }
        setSaving(true);
        setActionError(null);
        try {
            await upsertCarServiceItem(selected.id, {
                category: itemForm.category,
                description: itemForm.description.trim(),
                amount,
            });
            setItemForm({ category: itemForm.category, description: '', amount: '' });
            await refresh();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to save item');
        } finally {
            setSaving(false);
        }
    };

    const commitCellEdit = async () => {
        if (!editingCell) return;
        const amount = editingCell.value.trim() === '' ? 0 : parseFloat(editingCell.value);
        if (!Number.isFinite(amount) || amount < 0) {
            setActionError('Invalid amount');
            return;
        }
        setSaving(true);
        setActionError(null);
        try {
            await upsertCarServiceItem(editingCell.visitId, {
                category: editingCell.category,
                description: editingCell.description,
                amount,
            });
            setEditingCell(null);
            await refresh();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to update cell');
        } finally {
            setSaving(false);
        }
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
    const isEditingExisting = showVisitForm && editingVisitId != null;

    return (
        <section className="panel car-service-section">
            <div className="trips-summary-strip">
                <div className="trips-summary-item trips-summary-item--total">
                    <span className="trips-summary-label">Lifetime spend</span>
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
                <div className="trips-summary-item">
                    <span className="trips-summary-label">Avg / visit</span>
                    <span className="trips-summary-value">{formatMYR(summary.avgCostPerVisit)}</span>
                </div>
                <div className="trips-summary-item">
                    <span className="trips-summary-label">Avg km between</span>
                    <span className="trips-summary-value">
                        {summary.avgKmBetweenVisits != null
                            ? `${formatKm(Math.round(summary.avgKmBetweenVisits))} km`
                            : '—'}
                    </span>
                </div>
            </div>

            {actionError && <p className="error">{actionError}</p>}

            <div className="car-service-toolbar">
                <h3 className="car-service-heading">Service history</h3>
                <button type="button" className="btn-primary" onClick={openCreateVisit} disabled={saving}>
                    Add visit
                </button>
            </div>

            {showVisitForm && (
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
                    <div className="trips-form-actions span-full">
                        <button type="button" onClick={() => { setShowVisitForm(false); setEditingVisitId(null); }} disabled={saving}>
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="btn-primary"
                            onClick={isEditingExisting ? handleUpdateVisit : handleCreateVisit}
                            disabled={saving}
                        >
                            {isEditingExisting ? 'Save visit' : 'Create visit'}
                        </button>
                    </div>
                </div>
            )}

            <div className="trips-layout car-service-layout">
                <ul className="trips-list">
                    {visits.length === 0 && <li className="trips-empty muted">No service visits yet.</li>}
                    {[...visits].reverse().map((visit) => (
                        <li key={visit.id}>
                            <button
                                type="button"
                                className={
                                    visit.id === selectedId ? 'trips-list-item active' : 'trips-list-item'
                                }
                                onClick={() => {
                                    setSelectedId(visit.id);
                                    setShowVisitForm(false);
                                    setEditingVisitId(null);
                                }}
                            >
                                <span className="trips-list-name">{formatDate(visit.date)}</span>
                                <span className="muted">{formatMYR(visit.total)}</span>
                            </button>
                        </li>
                    ))}
                </ul>

                <div className="trips-detail">
                    {selected ? (
                        <>
                            <div className="trips-detail-title">
                                <h4>{formatDate(selected.date)}</h4>
                                <p className="muted">
                                    {formatKm(selected.odometerKm)} km
                                    {selected.kmSincePrev != null &&
                                        ` · +${formatKm(selected.kmSincePrev)} km since prior`}
                                    {selected.notes ? ` · ${selected.notes}` : ''}
                                </p>
                            </div>
                            <div className="trips-detail-actions">
                                <button type="button" onClick={openEditVisit} disabled={saving}>
                                    Edit visit
                                </button>
                                <button
                                    type="button"
                                    className="trips-delete-trip"
                                    onClick={handleDeleteVisit}
                                    disabled={saving}
                                >
                                    Delete
                                </button>
                            </div>

                            <div className="trips-table-wrap">
                                <table className="data-table trips-expenses-table">
                                    <thead>
                                        <tr>
                                            <th>Category</th>
                                            <th>Item</th>
                                            <th className="trips-col-num">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selected.items.length === 0 && (
                                            <tr>
                                                <td colSpan={3} className="muted">
                                                    No line items — add below or edit the matrix.
                                                </td>
                                            </tr>
                                        )}
                                        {selected.items.map((item) => (
                                            <tr key={item.id}>
                                                <td>{item.category}</td>
                                                <td>{item.description}</td>
                                                <td className="trips-col-num">{formatMYR(item.amount)}</td>
                                            </tr>
                                        ))}
                                        {selected.items.length > 0 && (
                                            <tr>
                                                <td colSpan={2}>
                                                    <strong>Total</strong>
                                                </td>
                                                <td className="trips-col-num">
                                                    <strong>{formatMYR(selected.total)}</strong>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="trips-form">
                                <label>
                                    Category
                                    <select
                                        value={itemForm.category}
                                        onChange={(e) =>
                                            setItemForm((f) => ({
                                                ...f,
                                                category: e.target.value as CarServiceCategory,
                                                description: '',
                                            }))
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
                                        list={`car-items-${itemForm.category}`}
                                        value={itemForm.description}
                                        onChange={(e) =>
                                            setItemForm((f) => ({ ...f, description: e.target.value }))
                                        }
                                        placeholder="e.g. Oil Filter (1.5TD)"
                                    />
                                    <datalist id={`car-items-${itemForm.category}`}>
                                        {(catalogByCategory.get(itemForm.category) ?? []).map((d) => (
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
                                        value={itemForm.amount}
                                        onChange={(e) =>
                                            setItemForm((f) => ({ ...f, amount: e.target.value }))
                                        }
                                    />
                                </label>
                                <div className="trips-form-actions">
                                    <button
                                        type="button"
                                        className="btn-primary"
                                        onClick={handleAddItem}
                                        disabled={saving}
                                    >
                                        Add / update item
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <p className="muted">Select a visit or add one to start logging parts and fluids.</p>
                    )}
                </div>
            </div>

            <div className="car-service-matrix-block">
                <h3 className="car-service-heading">Cost matrix</h3>
                <p className="muted car-service-hint">
                    Click a cell to set or clear the amount (leave blank to remove). Same layout as your spreadsheet.
                </p>
                {visits.length === 0 ? (
                    <p className="muted">Add a visit to build the matrix.</p>
                ) : (
                    <div className="car-service-matrix-wrap">
                        <table className="data-table car-service-matrix">
                            <thead>
                                <tr>
                                    <th className="car-service-sticky">Item Description</th>
                                    {visits.map((v) => (
                                        <th key={v.id} className="car-service-visit-col">
                                            <div>{formatDate(v.date)}</div>
                                            <div className="car-service-odo muted">{formatKm(v.odometerKm)}</div>
                                        </th>
                                    ))}
                                    <th className="trips-col-num">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {CATEGORIES.map((category) => {
                                    const descriptions = catalogByCategory.get(category) ?? [];
                                    if (descriptions.length === 0) return null;
                                    return (
                                        <FragmentCategory
                                            key={category}
                                            category={category}
                                            descriptions={descriptions}
                                            visits={visits}
                                            itemTotals={itemTotals}
                                            editingCell={editingCell}
                                            onStartEdit={(visitId, description, current) =>
                                                setEditingCell({
                                                    visitId,
                                                    category,
                                                    description,
                                                    value: current != null ? String(current) : '',
                                                })
                                            }
                                            onEditValue={(value) =>
                                                setEditingCell((c) => (c ? { ...c, value } : c))
                                            }
                                            onCommit={commitCellEdit}
                                            onCancel={() => setEditingCell(null)}
                                        />
                                    );
                                })}
                                <tr className="car-service-total-row">
                                    <td className="car-service-sticky">
                                        <strong>Visit total</strong>
                                    </td>
                                    {visits.map((v) => (
                                        <td key={v.id} className="trips-col-num">
                                            <strong>{v.total > 0 ? formatMYR(v.total) : '—'}</strong>
                                        </td>
                                    ))}
                                    <td className="trips-col-num">
                                        <strong>{formatMYR(summary.lifetimeTotal)}</strong>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {itemTotals.length > 0 && (
                <div className="car-service-item-totals">
                    <h3 className="car-service-heading">Spend by item</h3>
                    <div className="trips-table-wrap">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Category</th>
                                    <th>Item</th>
                                    <th className="trips-col-num">Times</th>
                                    <th className="trips-col-num">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {itemTotals.map((row) => (
                                    <tr key={`${row.category}-${row.description}`}>
                                        <td>{row.category}</td>
                                        <td>{row.description}</td>
                                        <td className="trips-col-num">{row.count}</td>
                                        <td className="trips-col-num">{formatMYR(row.total)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </section>
    );
}

function FragmentCategory({
    category,
    descriptions,
    visits,
    itemTotals,
    editingCell,
    onStartEdit,
    onEditValue,
    onCommit,
    onCancel,
}: {
    category: CarServiceCategory;
    descriptions: string[];
    visits: CarServiceVisit[];
    itemTotals: CarServiceOverview['itemTotals'];
    editingCell: {
        visitId: number;
        category: CarServiceCategory;
        description: string;
        value: string;
    } | null;
    onStartEdit: (visitId: number, description: string, current: number | null) => void;
    onEditValue: (value: string) => void;
    onCommit: () => void;
    onCancel: () => void;
}) {
    return (
        <>
            <tr className="car-service-category-row">
                <td className="car-service-sticky" colSpan={visits.length + 2}>
                    {category}
                </td>
            </tr>
            {descriptions.map((description) => {
                const rowTotal =
                    itemTotals.find((t) => t.category === category && t.description === description)
                        ?.total ?? 0;
                return (
                    <tr key={`${category}-${description}`}>
                        <td className="car-service-sticky">{description}</td>
                        {visits.map((visit) => {
                            const amount = cellAmount(visit, category, description);
                            const isEditing =
                                editingCell?.visitId === visit.id &&
                                editingCell.category === category &&
                                editingCell.description === description;
                            return (
                                <td key={visit.id} className="trips-col-num car-service-cell">
                                    {isEditing ? (
                                        <input
                                            className="car-service-cell-input"
                                            type="number"
                                            min={0}
                                            step={0.01}
                                            autoFocus
                                            value={editingCell.value}
                                            onChange={(e) => onEditValue(e.target.value)}
                                            onBlur={() => void onCommit()}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    void onCommit();
                                                }
                                                if (e.key === 'Escape') onCancel();
                                            }}
                                        />
                                    ) : (
                                        <button
                                            type="button"
                                            className="car-service-cell-btn"
                                            onClick={() => onStartEdit(visit.id, description, amount)}
                                        >
                                            {amount != null ? amount.toFixed(2) : ''}
                                        </button>
                                    )}
                                </td>
                            );
                        })}
                        <td className="trips-col-num">
                            {rowTotal > 0 ? formatMYR(rowTotal) : '—'}
                        </td>
                    </tr>
                );
            })}
        </>
    );
}
