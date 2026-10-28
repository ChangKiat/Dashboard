import { useEffect, useMemo, useState } from 'react';

import type { ExpenseTransaction, TripWithTotals } from '../api';
import { createExpenseTransaction, fetchTrips, updateExpenseTransaction } from '../api';
import { usePaymentAccounts } from '../hooks/usePaymentAccounts';
import { isInvestmentCategory, isOtherCategory, requiresAccountTransfer, resolveOtherAccountFields } from '../utils/expenseCategories';
import ExpenseCategorySelect from './ExpenseCategorySelect';
import PaymentMethodSelect from './PaymentMethodSelect';
import RecordModal from './RecordModal';

type ReimbursementRow = { source: string; amount: string; paymentMethod: string };

interface Props {
    /** The expense to edit, or null to add one on `defaultDate`. */
    entry: ExpenseTransaction | null;
    defaultDate?: string;
    variableCategories: string[];
    /** Categories already in use, offered in the category picker. */
    usedCategories: string[];
    onClose: () => void;
    /** Called once the expense is saved and the modal has closed. */
    onSaved: () => void;
}

function emptyReimbursement(): ReimbursementRow {
    return { source: '', amount: '', paymentMethod: '' };
}

/** The trip whose date range covers `date`, when exactly one does. */
function tripForDate(trips: TripWithTotals[], date: string): TripWithTotals | null {
    if (!date) return null;
    const matches = trips.filter(
        (t) => t.startDate && t.endDate && t.startDate <= date && date <= t.endDate
    );
    return matches.length === 1 ? matches[0] : null;
}

/** The Add / Edit transaction form. Render it to open it; the form starts from `entry`. */
export default function ExpenseRecordModal({
    entry,
    defaultDate,
    variableCategories,
    usedCategories,
    onClose,
    onSaved,
}: Props) {
    const modalMode = entry ? 'edit' : 'create';
    const { accounts } = usePaymentAccounts();
    const investmentAccounts = useMemo(
        () =>
            [...accounts]
                .filter((a) => a.accountType === 'investment')
                .sort((a, b) => a.name.localeCompare(b.name, 'en-MY', { sensitivity: 'base' })),
        [accounts]
    );

    const [trips, setTrips] = useState<TripWithTotals[]>([]);
    const [form, setForm] = useState(() => ({
        date: entry?.date ?? defaultDate ?? '',
        category: entry?.category ?? '',
        amount: entry ? String(entry.grossAmount ?? entry.amount) : '',
        description: entry?.description ?? '',
        paymentMethod: entry?.paymentMethod ?? '',
        toInvestmentAccount: entry?.toInvestmentAccount ?? '',
        tripId: entry?.tripId != null ? String(entry.tripId) : '',
    }));
    const [showReimbursements, setShowReimbursements] = useState(false);
    const [reimbursements, setReimbursements] = useState<ReimbursementRow[]>([emptyReimbursement()]);
    const [saving, setSaving] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);

    // Loaded on open so newly created trips show up; a new expense gets the trip covering its date.
    useEffect(() => {
        let cancelled = false;
        fetchTrips()
            .then((res) => {
                if (cancelled) return;
                setTrips(res.entries);
                if (entry) return;
                const date = defaultDate ?? '';
                const match = tripForDate(res.entries, date);
                if (!match) return;
                setForm((f) => (f.date === date && !f.tripId ? { ...f, tripId: String(match.id) } : f));
            })
            .catch(() => {
                // trip grouping is optional; the form still works without it
            });
        return () => {
            cancelled = true;
        };
    }, [entry, defaultDate]);

    const showTransferDestination = requiresAccountTransfer(form.category);
    /** Exchange / fund / card entries belong to their trip; only the Trips panel manages them. */
    const tripLocked = entry?.tripLeg != null;
    const investment = isInvestmentCategory(form.category);

    const parseReimbursements = ():
        | { source: string; amount: number; paymentMethod: string }[]
        | 'invalid' => {
        const items: { source: string; amount: number; paymentMethod: string }[] = [];
        for (const row of reimbursements) {
            const source = row.source.trim();
            const amount = parseFloat(row.amount);
            const paymentMethod = row.paymentMethod.trim();
            if (!source && !row.amount.trim() && !paymentMethod) continue;
            if (!source || !Number.isFinite(amount) || amount <= 0 || !paymentMethod) {
                return 'invalid';
            }
            items.push({ source, amount, paymentMethod });
        }
        return items;
    };

    const handleSave = async () => {
        const amount = parseFloat(form.amount);
        if (
            !form.date ||
            !form.category.trim() ||
            !form.description.trim() ||
            !Number.isFinite(amount) ||
            amount <= 0
        ) {
            setModalError('Date, category, description, and a positive amount are required.');
            return;
        }

        const rawFrom = form.paymentMethod.trim() || null;
        const rawTo = form.toInvestmentAccount.trim() || null;

        let paymentMethod = rawFrom;
        let toInvestmentAccount = rawTo;

        if (investment) {
            if (!paymentMethod) {
                setModalError('Select the account money is coming from.');
                return;
            }
            if (!toInvestmentAccount) {
                setModalError('Select the investment account to fund.');
                return;
            }
            if (paymentMethod === toInvestmentAccount) {
                setModalError('From and to accounts must be different.');
                return;
            }
        } else if (isOtherCategory(form.category)) {
            if (rawFrom && rawTo && rawFrom === rawTo) {
                setModalError('From and to accounts must be different.');
                return;
            }
            const resolved = resolveOtherAccountFields(rawFrom, rawTo);
            paymentMethod = resolved.paymentMethod;
            toInvestmentAccount = resolved.toInvestmentAccount;
        }

        const hasFundingTransfer = Boolean(paymentMethod && toInvestmentAccount);

        let reimbursementPayload: { source: string; amount: number; paymentMethod: string }[] | undefined;
        if (modalMode === 'create' && showReimbursements && !showTransferDestination) {
            const parsed = parseReimbursements();
            if (parsed === 'invalid') {
                setModalError(
                    'Each reimbursement needs a person name, positive amount, and received-into account.'
                );
                return;
            }
            reimbursementPayload = parsed.length > 0 ? parsed : undefined;
        }

        const tripId = form.tripId ? Number(form.tripId) : null;

        setSaving(true);
        setModalError(null);
        try {
            const payload = {
                date: form.date,
                category: form.category.trim(),
                amount,
                description: form.description.trim(),
                paymentMethod,
                toInvestmentAccount: hasFundingTransfer ? toInvestmentAccount : null,
                ...(reimbursementPayload ? { reimbursements: reimbursementPayload } : {}),
                ...(tripId != null ? { tripId } : {}),
            };
            if (!entry) {
                await createExpenseTransaction(payload);
            } else {
                await updateExpenseTransaction(entry.id, {
                    date: payload.date,
                    category: payload.category,
                    amount: payload.amount,
                    description: payload.description,
                    paymentMethod,
                    toInvestmentAccount: hasFundingTransfer ? toInvestmentAccount : null,
                    ...(tripLocked ? {} : { tripId }),
                });
            }
            onClose();
            onSaved();
        } catch (err) {
            setModalError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    return (
        <RecordModal
            title={modalMode === 'create' ? 'Add transaction' : 'Edit transaction'}
            open
            saving={saving}
            error={modalError}
            onClose={onClose}
            onSave={handleSave}
        >
            <div className="form-field">
                <label htmlFor="tx-date">Date</label>
                <input
                    id="tx-date"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
            </div>
            <div className="form-field">
                <label htmlFor="tx-category">Category</label>
                <ExpenseCategorySelect
                    id="tx-category"
                    value={form.category}
                    variableCategories={variableCategories}
                    usedCategories={usedCategories}
                    onChange={(category) =>
                        setForm((f) => ({
                            ...f,
                            category,
                            toInvestmentAccount: requiresAccountTransfer(category)
                                ? f.toInvestmentAccount
                                : '',
                        }))
                    }
                />
            </div>
            <div className="form-field">
                <label htmlFor="tx-amount">Amount</label>
                <input
                    id="tx-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                />
            </div>
            <div className="form-field">
                <label htmlFor="tx-description">Description</label>
                <input
                    id="tx-description"
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
            </div>
            <div className="form-field">
                <label htmlFor="tx-payment-method">
                    {investment
                        ? 'From account'
                        : showTransferDestination
                          ? 'From account (optional)'
                          : 'Payment method'}
                </label>
                <PaymentMethodSelect
                    id="tx-payment-method"
                    value={form.paymentMethod}
                    onChange={(paymentMethod) => setForm((f) => ({ ...f, paymentMethod }))}
                    excludeTypes={['investment']}
                />
            </div>
            {showTransferDestination && investment && (
                <div className="form-field">
                    <label htmlFor="tx-to-investment">To investment account</label>
                    <select
                        id="tx-to-investment"
                        value={form.toInvestmentAccount}
                        onChange={(e) =>
                            setForm((f) => ({ ...f, toInvestmentAccount: e.target.value }))
                        }
                    >
                        <option value="">—</option>
                        {investmentAccounts.map((account) => (
                            <option key={account.id} value={account.name}>
                                {account.name}
                            </option>
                        ))}
                    </select>
                    {investmentAccounts.length === 0 && (
                        <span className="muted form-hint">
                            Add an investment account on the Income tab first.
                        </span>
                    )}
                </div>
            )}
            {showTransferDestination && !investment && (
                <div className="form-field">
                    <label htmlFor="tx-to-account">To account (optional)</label>
                    <PaymentMethodSelect
                        id="tx-to-account"
                        value={form.toInvestmentAccount}
                        onChange={(toInvestmentAccount) =>
                            setForm((f) => ({ ...f, toInvestmentAccount }))
                        }
                    />
                </div>
            )}
            <div className="form-field">
                <label htmlFor="tx-trip">Trip</label>
                <select
                    id="tx-trip"
                    value={form.tripId}
                    disabled={tripLocked}
                    onChange={(e) => setForm((f) => ({ ...f, tripId: e.target.value }))}
                >
                    <option value="">No trip</option>
                    {trips.map((trip) => (
                        <option key={trip.id} value={trip.id}>
                            {trip.name}
                            {trip.startDate ? ` (${trip.startDate}${trip.endDate ? ` → ${trip.endDate}` : ''})` : ''}
                        </option>
                    ))}
                </select>
                {tripLocked && (
                    <span className="muted form-hint">
                        Trip exchange / fund / card entries are managed from the Trips panel.
                    </span>
                )}
                {!tripLocked && trips.length === 0 && (
                    <span className="muted form-hint">Create a trip in the Trips panel to group spending.</span>
                )}
            </div>
            {modalMode === 'create' && !showTransferDestination && (
                <div className="form-field">
                    <label>
                        <input
                            type="checkbox"
                            checked={showReimbursements}
                            onChange={(e) => setShowReimbursements(e.target.checked)}
                        />{' '}
                        Shared bill reimbursements
                    </label>
                    {showReimbursements && (
                        <div className="reimbursement-rows">
                            {reimbursements.map((row, index) => (
                                <div key={index} className="reimbursement-row">
                                    <input
                                        type="text"
                                        placeholder="Person"
                                        value={row.source}
                                        onChange={(e) =>
                                            setReimbursements((rows) =>
                                                rows.map((r, i) =>
                                                    i === index ? { ...r, source: e.target.value } : r
                                                )
                                            )
                                        }
                                    />
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="Amount"
                                        value={row.amount}
                                        onChange={(e) =>
                                            setReimbursements((rows) =>
                                                rows.map((r, i) =>
                                                    i === index ? { ...r, amount: e.target.value } : r
                                                )
                                            )
                                        }
                                    />
                                    <PaymentMethodSelect
                                        id={`reimb-into-${index}`}
                                        value={row.paymentMethod}
                                        onChange={(paymentMethod) =>
                                            setReimbursements((rows) =>
                                                rows.map((r, i) =>
                                                    i === index ? { ...r, paymentMethod } : r
                                                )
                                            )
                                        }
                                        emptyLabel="Received into"
                                    />
                                    {reimbursements.length > 1 && (
                                        <button
                                            type="button"
                                            className="btn-icon"
                                            onClick={() =>
                                                setReimbursements((rows) =>
                                                    rows.filter((_, i) => i !== index)
                                                )
                                            }
                                        >
                                            ×
                                        </button>
                                    )}
                                </div>
                            ))}
                            <button
                                type="button"
                                className="btn-add"
                                onClick={() =>
                                    setReimbursements((rows) => [...rows, emptyReimbursement()])
                                }
                            >
                                + Add person
                            </button>
                        </div>
                    )}
                </div>
            )}
        </RecordModal>
    );
}
