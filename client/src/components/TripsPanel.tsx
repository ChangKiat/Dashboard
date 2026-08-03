import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Trip, TripLeg, TripSummary } from '../api';
import {
    createExpenseTransaction,
    createTrip,
    deleteExpenseTransaction,
    deleteTrip,
    fetchTripSummary,
    fetchTrips,
} from '../api';
import { usePaymentAccounts } from '../hooks/usePaymentAccounts';
import ExpenseCategorySelect from './ExpenseCategorySelect';
import PaymentMethodSelect from './PaymentMethodSelect';

interface Props {
    variableCategories: string[];
    formatAmount: (amount: number) => string;
    onChanged?: () => void;
}

type FormMode = 'none' | 'create-trip' | 'exchange' | 'expense';

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
    return '—';
}

function todayKL(): string {
    const t = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' }));
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, '0');
    const d = String(t.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export default function TripsPanel({ variableCategories, formatAmount, onChanged }: Props) {
    const { refresh: refreshAccounts } = usePaymentAccounts();
    const [trips, setTrips] = useState<Trip[]>([]);
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
            await loadSummary(selectedId);
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
            await loadSummary(selectedId);
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
        if (!confirm('Delete this trip entry?')) return;
        if (selectedId == null) return;
        try {
            await deleteExpenseTransaction(id);
            await loadSummary(selectedId);
            await refreshAccounts();
            onChanged?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete');
        }
    }

    async function handleDeleteTrip() {
        if (selectedId == null) return;
        if (!confirm('Delete this trip? It must have no linked expenses.')) return;
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

    if (loading) {
        return (
            <div className="trips-panel expenses-table-card">
                <p className="muted">Loading trips…</p>
            </div>
        );
    }

    return (
        <div className="trips-panel expenses-table-card">
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
                <aside className="trips-sidebar">
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
                                        resetForms();
                                    }}
                                >
                                    <span className="trips-list-name">{trip.name}</span>
                                    <span className="trips-currency-chip">{trip.tripCurrency}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </aside>

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
                                    className="btn-danger trips-delete-trip"
                                    onClick={handleDeleteTrip}
                                >
                                    Delete trip
                                </button>
                            </div>
                        </div>

                        <div className="trips-summary-strip">
                            <div className="trips-summary-item">
                                <span className="trips-summary-label">Exchanged</span>
                                <span className="trips-summary-value">
                                    {formatAmount(summary.exchangedMyr)}
                                </span>
                            </div>
                            <div className="trips-summary-item trips-summary-item--fund">
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
                            <div className="trips-summary-item trips-summary-item--total">
                                <span className="trips-summary-label">Trip total</span>
                                <span className="trips-summary-value">
                                    {formatAmount(summary.tripTotalMyr)}
                                </span>
                            </div>
                        </div>

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
                                    {summary.expenses.length === 0 && (
                                        <tr>
                                            <td colSpan={7} className="trips-empty muted">
                                                No trip entries yet
                                            </td>
                                        </tr>
                                    )}
                                    {summary.expenses.map((row) => (
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
                                                {row.tripLeg === 'fund'
                                                    ? '—'
                                                    : formatAmount(row.amount)}
                                            </td>
                                            <td className="actions-col">
                                                <button
                                                    type="button"
                                                    className="btn-danger-link"
                                                    onClick={() => handleDeleteExpense(row.id)}
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
