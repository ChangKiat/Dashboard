import { useCallback, useEffect, useMemo, useState } from 'react';

import type { TripLeg, TripLinkCandidate, TripSummary, TripWithTotals } from '../api';
import {
    createExpenseTransaction,
    createTrip,
    deleteExpenseTransaction,
    deleteTrip,
    fetchTripLinkCandidates,
    fetchTripSummary,
    fetchTrips,
    linkTripExpenses,
    unlinkTripExpense,
} from '../api';
import { usePaymentAccounts } from '../hooks/usePaymentAccounts';
import ConfirmDialog from './ConfirmDialog';
import ExpenseCategorySelect from './ExpenseCategorySelect';
import PaymentMethodSelect from './PaymentMethodSelect';

interface Props {
    variableCategories: string[];
    formatAmount: (amount: number) => string;
    onChanged?: () => void;
    /** Bump to reload trips after transactions change elsewhere (e.g. tagged from the expense form). */
    reloadKey?: number;
}

type FormMode = 'none' | 'create-trip' | 'exchange' | 'expense' | 'link';

function formatFx(amount: number, currency: string) {
    return `${currency} ${amount.toLocaleString('en-MY', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

function legLabel(leg: TripLeg | null) {
    if (leg === 'exchange') return 'Exchange';
    if (leg === 'fund') return 'Trip fund';
    if (leg === 'card') return 'Credit card';
    return 'Linked';
}

function todayKL(): string {
    const t = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' }));
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, '0');
    const d = String(t.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export default function TripsPanel({ variableCategories, formatAmount, onChanged, reloadKey = 0 }: Props) {
    const { refresh: refreshAccounts } = usePaymentAccounts();
    const [trips, setTrips] = useState<TripWithTotals[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [summary, setSummary] = useState<TripSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [formMode, setFormMode] = useState<FormMode>('none');
    const [saving, setSaving] = useState(false);

    // create trip
    const [tripName, setTripName] = useState('');
    const [tripCurrency, setTripCurrency] = useState('USD');
    const [tripStart, setTripStart] = useState('');
    const [tripEnd, setTripEnd] = useState('');

    // exchange / expense shared
    const [date, setDate] = useState(todayKL());
    const [category, setCategory] = useState('Travel');
    const [description, setDescription] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('');
    const [myrAmount, setMyrAmount] = useState('');
    const [fxAmount, setFxAmount] = useState('');
    const [spendSource, setSpendSource] = useState<'fund' | 'card'>('fund');

    // link existing transactions
    const [candidates, setCandidates] = useState<TripLinkCandidate[]>([]);
    const [candStart, setCandStart] = useState('');
    const [candEnd, setCandEnd] = useState('');
    const [candSearch, setCandSearch] = useState('');
    const [candLoading, setCandLoading] = useState(false);
    const [picked, setPicked] = useState<Set<number>>(new Set());

    const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
    const [pendingDelete, setPendingDelete] = useState<
        { kind: 'trip' } | { kind: 'entry'; id: number } | null
    >(null);

    const categories = useMemo(() => {
        const set = new Set(variableCategories);
        set.add('Travel');
        return [...set];
    }, [variableCategories]);

    const loadTrips = useCallback(async () => {
        const res = await fetchTrips();
        setTrips(res.entries);
        return res.entries;
    }, []);

    const loadSummary = useCallback(async (id: number) => {
        const res = await fetchTripSummary(id);
        setSummary(res);
    }, []);

    /** Refresh the open trip plus the list totals after any change. */
    const reloadSelected = useCallback(
        async (id: number) => {
            await Promise.all([loadSummary(id), loadTrips()]);
        },
        [loadSummary, loadTrips]
    );

    const filteredCandidates = useMemo(() => {
        const q = candSearch.trim().toLowerCase();
        if (!q) return candidates;
        return candidates.filter(
            (c) =>
                c.description.toLowerCase().includes(q) ||
                c.category.toLowerCase().includes(q) ||
                (c.paymentMethod ?? '').toLowerCase().includes(q)
        );
    }, [candidates, candSearch]);

    const pickedTotal = useMemo(
        () => candidates.filter((c) => picked.has(c.id)).reduce((sum, c) => sum + c.amount, 0),
        [candidates, picked]
    );

    const visibleExpenses = useMemo(() => {
        if (!summary) return [];
        if (!categoryFilter) return summary.expenses;
        return summary.expenses.filter(
            (row) => row.category === categoryFilter && row.tripLeg !== 'exchange'
        );
    }, [summary, categoryFilter]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        loadTrips()
            .catch((err) => {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load trips');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [loadTrips]);

    useEffect(() => {
        if (selectedId == null) {
            setSummary(null);
            return;
        }
        let cancelled = false;
        loadSummary(selectedId).catch((err) => {
            if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load trip');
        });
        return () => {
            cancelled = true;
        };
    }, [selectedId, loadSummary]);

    useEffect(() => {
        if (reloadKey === 0) return;
        loadTrips().catch(() => {
            /* keep current list on background refresh failure */
        });
        if (selectedId != null) {
            loadSummary(selectedId).catch(() => {
                /* keep current summary */
            });
        }
        // Only reload when the key bumps; selectedId changes are handled by the effect above.
    }, [reloadKey]);

    function resetForms() {
        setFormMode('none');
        setTripName('');
        setTripCurrency('USD');
        setTripStart('');
        setTripEnd('');
        setDate(todayKL());
        setCategory('Travel');
        setDescription('');
        setPaymentMethod('');
        setMyrAmount('');
        setFxAmount('');
        setSpendSource('fund');
        setCandidates([]);
        setCandSearch('');
        setPicked(new Set());
    }

    async function loadCandidates(id: number, range?: { start?: string; end?: string }) {
        setCandLoading(true);
        setError(null);
        try {
            const res = await fetchTripLinkCandidates(id, range);
            setCandidates(res.entries);
            setCandStart(res.start);
            setCandEnd(res.end);
            setPicked(new Set());
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load transactions');
        } finally {
            setCandLoading(false);
        }
    }

    function togglePicked(id: number) {
        setPicked((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function toggleAllVisible() {
        setPicked((prev) => {
            const allPicked = filteredCandidates.every((c) => prev.has(c.id));
            const next = new Set(prev);
            for (const c of filteredCandidates) {
                if (allPicked) next.delete(c.id);
                else next.add(c.id);
            }
            return next;
        });
    }

    async function handleLink(e: React.FormEvent) {
        e.preventDefault();
        if (selectedId == null || picked.size === 0) return;
        setSaving(true);
        setError(null);
        try {
            await linkTripExpenses(selectedId, [...picked]);
            await reloadSelected(selectedId);
            resetForms();
            onChanged?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to link transactions');
        } finally {
            setSaving(false);
        }
    }

    async function handleUnlink(expenseId: number) {
        if (selectedId == null) return;
        try {
            await unlinkTripExpense(selectedId, expenseId);
            await reloadSelected(selectedId);
            onChanged?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to unlink');
        }
    }

    async function handleCreateTrip(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
            const res = await createTrip({
                name: tripName.trim(),
                tripCurrency: tripCurrency.trim() || 'USD',
                startDate: tripStart || null,
                endDate: tripEnd || null,
            });
            await loadTrips();
            setSelectedId(res.trip.id);
            resetForms();
            onChanged?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create trip');
        } finally {
            setSaving(false);
        }
    }

    async function handleExchange(e: React.FormEvent) {
        e.preventDefault();
        if (selectedId == null) return;
        setSaving(true);
        setError(null);
        try {
            const myr = parseFloat(myrAmount);
            const fx = parseFloat(fxAmount);
            await createExpenseTransaction({
                date,
                amount: myr,
                category,
                description: description.trim() || `Currency exchange (${summary?.trip.tripCurrency ?? 'FX'})`,
                paymentMethod: paymentMethod || null,
                tripId: selectedId,
                tripLeg: 'exchange',
                fxAmount: fx,
                fxCurrency: summary?.trip.tripCurrency,
            });
            await reloadSelected(selectedId);
            resetForms();
            await refreshAccounts();
            onChanged?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to add exchange');
        } finally {
            setSaving(false);
        }
    }

    async function handleExpense(e: React.FormEvent) {
        e.preventDefault();
        if (selectedId == null) return;
        setSaving(true);
        setError(null);
        try {
            const fx = parseFloat(fxAmount);
            const payload: Parameters<typeof createExpenseTransaction>[0] = {
                date,
                category,
                description: description.trim() || 'Trip expense',
                tripId: selectedId,
                tripLeg: spendSource,
                fxAmount: fx,
                fxCurrency: summary?.trip.tripCurrency,
            };
            if (spendSource === 'card') {
                payload.paymentMethod = paymentMethod || null;
                payload.amount = parseFloat(myrAmount);
            }
            await createExpenseTransaction(payload);
            await reloadSelected(selectedId);
            resetForms();
            await refreshAccounts();
            onChanged?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to add expense');
        } finally {
            setSaving(false);
        }
    }

    async function handleDeleteExpense(id: number) {
        if (selectedId == null) return;
        try {
            await deleteExpenseTransaction(id);
            await reloadSelected(selectedId);
            await refreshAccounts();
            onChanged?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete');
        }
    }

    async function handleDeleteTrip() {
        if (selectedId == null) return;
        try {
            await deleteTrip(selectedId);
            setSelectedId(null);
            setSummary(null);
            await loadTrips();
            onChanged?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete trip');
        }
    }

    function handleConfirmDelete() {
        const target = pendingDelete;
        setPendingDelete(null);
        if (!target) return;
        if (target.kind === 'trip') void handleDeleteTrip();
        else void handleDeleteExpense(target.id);
    }

    const confirmDialog = (
        <ConfirmDialog
            open={pendingDelete != null}
            title={pendingDelete?.kind === 'trip' ? 'Delete trip' : 'Delete trip entry'}
            message={
                pendingDelete?.kind === 'trip'
                    ? `Delete "${summary?.trip.name ?? 'this trip'}"? Linked transactions are kept and just removed from the trip. Exchange / fund / card entries must be deleted first.`
                    : 'Delete this trip entry? This removes the transaction and updates account balances.'
            }
            onConfirm={handleConfirmDelete}
            onCancel={() => setPendingDelete(null)}
        />
    );

    if (loading) {
        return (
            <div className="trips-panel card">
                <p className="muted">Loading trips…</p>
            </div>
        );
    }

    return (
        <div className="trips-panel card">
            <div className="section-header-row">
                <h3>Trips</h3>
                <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                        resetForms();
                        setFormMode('create-trip');
                    }}
                >
                    New trip
                </button>
            </div>

            {error && <p className="error">{error}</p>}

            {formMode === 'create-trip' && (
                <form className="trips-form" onSubmit={handleCreateTrip}>
                    <label>
                        Name
                        <input value={tripName} onChange={(e) => setTripName(e.target.value)} required />
                    </label>
                    <label>
                        Currency
                        <input
                            value={tripCurrency}
                            onChange={(e) => setTripCurrency(e.target.value.toUpperCase())}
                            required
                            maxLength={6}
                        />
                    </label>
                    <label>
                        Start
                        <input type="date" value={tripStart} onChange={(e) => setTripStart(e.target.value)} />
                    </label>
                    <label>
                        End
                        <input type="date" value={tripEnd} onChange={(e) => setTripEnd(e.target.value)} />
                    </label>
                    <div className="trips-form-actions">
                        <button type="submit" className="btn-primary" disabled={saving}>
                            Create
                        </button>
                        <button type="button" className="btn-secondary" onClick={resetForms}>
                            Cancel
                        </button>
                    </div>
                </form>
            )}

            <div className="trips-layout">
                <ul className="trips-list">
                    {trips.length === 0 && <li className="trips-empty muted">No trips yet</li>}
                    {trips.map((trip) => (
                        <li key={trip.id}>
                            <button
                                type="button"
                                className={
                                    selectedId === trip.id
                                        ? 'trips-list-item active'
                                        : 'trips-list-item'
                                }
                                onClick={() => {
                                    setSelectedId(trip.id);
                                    setCategoryFilter(null);
                                    resetForms();
                                }}
                            >
                                <span className="trips-list-main">
                                    <span className="trips-list-name">{trip.name}</span>
                                    <span className="trips-list-meta muted">
                                        {trip.tripCurrency} · {trip.entryCount}{' '}
                                        {trip.entryCount === 1 ? 'entry' : 'entries'}
                                    </span>
                                </span>
                                <span className="trips-list-total">{formatAmount(trip.spentMyr)}</span>
                            </button>
                        </li>
                    ))}
                </ul>

                {summary && (
                    <div className="trips-detail">
                        <div className="trips-detail-header section-header-row">
                            <div className="trips-detail-title">
                                <h4>{summary.trip.name}</h4>
                                <p className="muted">
                                    {[summary.trip.startDate, summary.trip.endDate]
                                        .filter(Boolean)
                                        .join(' → ') || 'No dates'}{' '}
                                    · {summary.trip.tripCurrency}
                                </p>
                            </div>
                            <div className="trips-detail-actions">
                                <button
                                    type="button"
                                    className="btn-primary"
                                    onClick={() => {
                                        setFormMode('exchange');
                                        setDescription('');
                                        setCategory('Travel');
                                        setDate(todayKL());
                                    }}
                                >
                                    Add exchange
                                </button>
                                <button
                                    type="button"
                                    className="btn-primary"
                                    onClick={() => {
                                        setFormMode('expense');
                                        setDescription('');
                                        setCategory('Travel');
                                        setDate(todayKL());
                                        setSpendSource(
                                            summary.fundRemaining > 0 ? 'fund' : 'card'
                                        );
                                    }}
                                >
                                    Add expense
                                </button>
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => {
                                        resetForms();
                                        setFormMode('link');
                                        void loadCandidates(summary.trip.id);
                                    }}
                                >
                                    Link transactions
                                </button>
                                <button
                                    type="button"
                                    className="btn-danger trips-delete-trip"
                                    onClick={() => setPendingDelete({ kind: 'trip' })}
                                >
                                    Delete trip
                                </button>
                            </div>
                        </div>

                        <div className="trips-summary-strip">
                            <div className="trips-summary-item trips-summary-item--spent">
                                <span className="trips-summary-label">Total spent</span>
                                <span className="trips-summary-value">
                                    {formatAmount(summary.spentMyr)}
                                </span>
                                {summary.days != null && summary.days > 0 && (
                                    <span className="trips-summary-sub muted">
                                        {formatAmount(summary.spentMyr / summary.days)} / day ·{' '}
                                        {summary.days} {summary.days === 1 ? 'day' : 'days'}
                                    </span>
                                )}
                            </div>
                            <div className="trips-summary-item">
                                <span className="trips-summary-label">Exchanged</span>
                                <span className="trips-summary-value">
                                    {formatAmount(summary.exchangedMyr)}
                                </span>
                            </div>
                            <div className="trips-summary-item">
                                <span className="trips-summary-label">Fund left</span>
                                <span className="trips-summary-value">
                                    {formatFx(summary.fundRemaining, summary.trip.tripCurrency)}
                                </span>
                            </div>
                            <div className="trips-summary-item">
                                <span className="trips-summary-label">Fund used</span>
                                <span className="trips-summary-value">
                                    {formatFx(summary.fundSpent, summary.trip.tripCurrency)}
                                </span>
                            </div>
                            <div className="trips-summary-item">
                                <span className="trips-summary-label">Card</span>
                                <span className="trips-summary-value">
                                    {formatAmount(summary.cardMyr)}
                                </span>
                            </div>
                            <div className="trips-summary-item">
                                <span className="trips-summary-label">Linked</span>
                                <span className="trips-summary-value">
                                    {formatAmount(summary.linkedMyr)}
                                </span>
                            </div>
                            <div className="trips-summary-item trips-summary-item--total">
                                <span
                                    className="trips-summary-label"
                                    title="Exchanged + card + linked: MYR that left your accounts"
                                >
                                    Total cost
                                </span>
                                <span className="trips-summary-value">
                                    {formatAmount(summary.tripTotalMyr)}
                                </span>
                            </div>
                        </div>

                        {summary.byCategory.length > 0 && (
                            <div className="trips-breakdown">
                                <div className="trips-breakdown-head">
                                    <span className="trips-summary-label">Spending by category</span>
                                    {categoryFilter && (
                                        <button
                                            type="button"
                                            className="btn-link"
                                            onClick={() => setCategoryFilter(null)}
                                        >
                                            Show all
                                        </button>
                                    )}
                                </div>
                                <ul className="trips-breakdown-list">
                                    {summary.byCategory.map((c) => {
                                        const pct =
                                            summary.spentMyr > 0
                                                ? (c.amountMyr / summary.spentMyr) * 100
                                                : 0;
                                        const active = categoryFilter === c.category;
                                        return (
                                            <li key={c.category}>
                                                <button
                                                    type="button"
                                                    className={
                                                        active
                                                            ? 'trips-breakdown-row active'
                                                            : 'trips-breakdown-row'
                                                    }
                                                    aria-pressed={active}
                                                    onClick={() =>
                                                        setCategoryFilter(active ? null : c.category)
                                                    }
                                                >
                                                    <span className="trips-breakdown-name">
                                                        {c.category}
                                                        <span className="muted"> · {c.count}</span>
                                                    </span>
                                                    <span className="trips-breakdown-bar">
                                                        <span
                                                            className="trips-breakdown-fill"
                                                            style={{ width: `${Math.max(pct, 1)}%` }}
                                                        />
                                                    </span>
                                                    <span className="trips-breakdown-amount">
                                                        {formatAmount(c.amountMyr)}
                                                        <span className="muted"> {pct.toFixed(0)}%</span>
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}

                        {formMode === 'link' && (
                            <form className="trips-link-form" onSubmit={handleLink}>
                                <div className="trips-link-filters">
                                    <label>
                                        From
                                        <input
                                            type="date"
                                            value={candStart}
                                            onChange={(e) => setCandStart(e.target.value)}
                                        />
                                    </label>
                                    <label>
                                        To
                                        <input
                                            type="date"
                                            value={candEnd}
                                            onChange={(e) => setCandEnd(e.target.value)}
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        disabled={candLoading || !candStart || !candEnd}
                                        onClick={() =>
                                            loadCandidates(summary.trip.id, {
                                                start: candStart,
                                                end: candEnd,
                                            })
                                        }
                                    >
                                        Load
                                    </button>
                                    <label className="trips-link-search">
                                        Search
                                        <input
                                            value={candSearch}
                                            onChange={(e) => setCandSearch(e.target.value)}
                                            placeholder="Description, category, account"
                                        />
                                    </label>
                                </div>

                                <div className="trips-table-wrap trips-link-table-wrap">
                                    <table className="data-table trips-expenses-table">
                                        <thead>
                                            <tr>
                                                <th className="trips-col-check">
                                                    <input
                                                        type="checkbox"
                                                        aria-label="Select all shown"
                                                        checked={
                                                            filteredCandidates.length > 0 &&
                                                            filteredCandidates.every((c) =>
                                                                picked.has(c.id)
                                                            )
                                                        }
                                                        onChange={toggleAllVisible}
                                                        disabled={filteredCandidates.length === 0}
                                                    />
                                                </th>
                                                <th>Date</th>
                                                <th>Category</th>
                                                <th>Description</th>
                                                <th className="trips-col-num">MYR</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {candLoading && (
                                                <tr>
                                                    <td colSpan={5} className="trips-empty muted">
                                                        Loading…
                                                    </td>
                                                </tr>
                                            )}
                                            {!candLoading && filteredCandidates.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="trips-empty muted">
                                                        No ungrouped transactions in this range
                                                    </td>
                                                </tr>
                                            )}
                                            {!candLoading &&
                                                filteredCandidates.map((c) => (
                                                    <tr
                                                        key={c.id}
                                                        className={picked.has(c.id) ? 'is-picked' : undefined}
                                                        onClick={() => togglePicked(c.id)}
                                                    >
                                                        <td className="trips-col-check">
                                                            <input
                                                                type="checkbox"
                                                                aria-label={`Select ${c.description}`}
                                                                checked={picked.has(c.id)}
                                                                onChange={() => togglePicked(c.id)}
                                                                onClick={(e) => e.stopPropagation()}
                                                            />
                                                        </td>
                                                        <td>{c.date}</td>
                                                        <td>{c.category}</td>
                                                        <td>
                                                            {c.description}
                                                            {c.paymentMethod ? (
                                                                <span className="muted">
                                                                    {' '}
                                                                    · {c.paymentMethod}
                                                                </span>
                                                            ) : null}
                                                        </td>
                                                        <td className="trips-col-num">
                                                            {formatAmount(c.amount)}
                                                        </td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="trips-form-actions">
                                    <span className="muted trips-link-count">
                                        {picked.size} selected · {formatAmount(pickedTotal)}
                                    </span>
                                    <button
                                        type="submit"
                                        className="btn-primary"
                                        disabled={saving || picked.size === 0}
                                    >
                                        Add to trip
                                    </button>
                                    <button type="button" className="btn-secondary" onClick={resetForms}>
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        )}

                        {formMode === 'exchange' && (
                            <form className="trips-form" onSubmit={handleExchange}>
                                <label>
                                    Date
                                    <input
                                        type="date"
                                        value={date}
                                        onChange={(e) => setDate(e.target.value)}
                                        required
                                    />
                                </label>
                                <label>
                                    From account
                                    <PaymentMethodSelect
                                        id="trip-exchange-from"
                                        value={paymentMethod}
                                        onChange={setPaymentMethod}
                                        excludeTypes={['credit', 'investment']}
                                    />
                                </label>
                                <label>
                                    MYR paid
                                    <input
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        value={myrAmount}
                                        onChange={(e) => setMyrAmount(e.target.value)}
                                        required
                                    />
                                </label>
                                <label>
                                    {summary.trip.tripCurrency} received
                                    <input
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        value={fxAmount}
                                        onChange={(e) => setFxAmount(e.target.value)}
                                        required
                                    />
                                </label>
                                <label>
                                    Category
                                    <ExpenseCategorySelect
                                        id="trip-exchange-cat"
                                        value={category}
                                        variableCategories={categories}
                                        onChange={setCategory}
                                    />
                                </label>
                                <label className="span-full">
                                    Description
                                    <input
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder="Currency exchange"
                                    />
                                </label>
                                <div className="trips-form-actions span-full">
                                    <button
                                        type="submit"
                                        className="btn-primary"
                                        disabled={saving || !paymentMethod}
                                    >
                                        Save exchange
                                    </button>
                                    <button type="button" className="btn-secondary" onClick={resetForms}>
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        )}

                        {formMode === 'expense' && (
                            <form className="trips-form" onSubmit={handleExpense}>
                                <label>
                                    Date
                                    <input
                                        type="date"
                                        value={date}
                                        onChange={(e) => setDate(e.target.value)}
                                        required
                                    />
                                </label>
                                <label>
                                    Pay from
                                    <select
                                        value={spendSource}
                                        onChange={(e) =>
                                            setSpendSource(e.target.value as 'fund' | 'card')
                                        }
                                    >
                                        <option value="fund">
                                            Trip fund ({formatFx(summary.fundRemaining, summary.trip.tripCurrency)} left)
                                        </option>
                                        <option value="card">Credit card</option>
                                    </select>
                                </label>
                                <label>
                                    {summary.trip.tripCurrency} amount
                                    <input
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        value={fxAmount}
                                        onChange={(e) => setFxAmount(e.target.value)}
                                        required
                                    />
                                </label>
                                {spendSource === 'card' && (
                                    <>
                                        <label>
                                            MYR charged
                                            <input
                                                type="number"
                                                min="0.01"
                                                step="0.01"
                                                value={myrAmount}
                                                onChange={(e) => setMyrAmount(e.target.value)}
                                                required
                                            />
                                        </label>
                                        <label>
                                            Credit card
                                            <PaymentMethodSelect
                                                id="trip-card-pay"
                                                value={paymentMethod}
                                                onChange={setPaymentMethod}
                                                excludeTypes={['account', 'investment']}
                                            />
                                        </label>
                                    </>
                                )}
                                <label>
                                    Category
                                    <ExpenseCategorySelect
                                        id="trip-expense-cat"
                                        value={category}
                                        variableCategories={categories}
                                        onChange={setCategory}
                                    />
                                </label>
                                <label className="span-full">
                                    Description
                                    <input
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        required
                                    />
                                </label>
                                <div className="trips-form-actions span-full">
                                    <button
                                        type="submit"
                                        className="btn-primary"
                                        disabled={
                                            saving ||
                                            (spendSource === 'card' && !paymentMethod)
                                        }
                                    >
                                        Save expense
                                    </button>
                                    <button type="button" className="btn-secondary" onClick={resetForms}>
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        )}

                        <div className="trips-table-wrap">
                            <table className="data-table trips-expenses-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Type</th>
                                        <th>Category</th>
                                        <th>Description</th>
                                        <th className="trips-col-num">FX</th>
                                        <th className="trips-col-num">MYR</th>
                                        <th className="actions-col" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {visibleExpenses.length === 0 && (
                                        <tr>
                                            <td colSpan={7} className="trips-empty muted">
                                                {categoryFilter
                                                    ? `No ${categoryFilter} entries`
                                                    : 'No trip entries yet'}
                                            </td>
                                        </tr>
                                    )}
                                    {visibleExpenses.map((row) => (
                                        <tr key={row.id}>
                                            <td>{row.date}</td>
                                            <td>
                                                <span
                                                    className={`trip-leg-badge trip-leg-${row.tripLeg ?? 'none'}`}
                                                >
                                                    {legLabel(row.tripLeg)}
                                                </span>
                                            </td>
                                            <td>{row.category}</td>
                                            <td>
                                                {row.description}
                                                {row.paymentMethod ? (
                                                    <span className="muted">
                                                        {' '}
                                                        · {row.paymentMethod}
                                                    </span>
                                                ) : null}
                                            </td>
                                            <td className="trips-col-num">
                                                {row.fxAmount != null
                                                    ? formatFx(
                                                          row.fxAmount,
                                                          row.fxCurrency ||
                                                              summary.trip.tripCurrency
                                                      )
                                                    : '—'}
                                            </td>
                                            <td className="trips-col-num">
                                                {row.tripLeg === 'fund' ? (
                                                    <span
                                                        className="muted"
                                                        title="MYR equivalent at the exchange rate (already counted in the exchange)"
                                                    >
                                                        ≈ {formatAmount(row.amount)}
                                                    </span>
                                                ) : (
                                                    formatAmount(row.amount)
                                                )}
                                            </td>
                                            <td className="actions-col">
                                                {row.tripLeg == null ? (
                                                    <button
                                                        type="button"
                                                        className="btn-link"
                                                        title="Remove from this trip (keeps the transaction)"
                                                        onClick={() => handleUnlink(row.id)}
                                                    >
                                                        Unlink
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="btn-danger-link"
                                                        onClick={() =>
                                                            setPendingDelete({ kind: 'entry', id: row.id })
                                                        }
                                                    >
                                                        Delete
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
            {confirmDialog}
        </div>
    );
}
