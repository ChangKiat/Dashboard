import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ExpenseTransaction, TripWithTotals } from '../api';
import {
    createExpenseTransaction,
    deleteExpenseTransaction,
    fetchTrips,
    updateExpenseTransaction,
} from '../api';
import { usePagination } from '../hooks/usePagination';
import { usePaymentAccounts } from '../hooks/usePaymentAccounts';
import { isInvestmentCategory, isOtherCategory, requiresAccountTransfer, resolveOtherAccountFields } from '../utils/expenseCategories';
import { normalizeDescription } from '../utils/fixedExpenses';
import ExpenseCategorySelect from './ExpenseCategorySelect';
import PaymentMethodSelect from './PaymentMethodSelect';
import RecordModal from './RecordModal';
import RowActions from './RowActions';
import TablePagination from './TablePagination';

const DAY_PAGE_SIZE = 5;

type ModalMode = 'closed' | 'create' | 'edit';

type ReimbursementRow = { source: string; amount: string; paymentMethod: string };

interface Props {
    entries: ExpenseTransaction[];
    variableCategories: string[];
    fixedDescriptions?: string[];
    formatAmount: (amount: number) => string;
    onChanged: () => void;
    defaultDate?: string;
    searchQuery?: string;
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

function expenseEntryMatchesQuery(entry: ExpenseTransaction, query: string): boolean {
    if (entry.description.toLowerCase().includes(query)) return true;
    if (entry.category.toLowerCase().includes(query)) return true;
    if (entry.paymentMethod?.toLowerCase().includes(query)) return true;
    if (entry.toInvestmentAccount?.toLowerCase().includes(query)) return true;
    if (String(entry.amount).includes(query)) return true;
    if (entry.amount.toFixed(2).includes(query)) return true;
    return false;
}

export default function ExpenseTransactionsTable({
    entries,
    variableCategories,
    fixedDescriptions = [],
    formatAmount,
    onChanged,
    defaultDate,
    searchQuery = '',
}: Props) {
    const fixedDescriptionSet = useMemo(
        () => new Set(fixedDescriptions.map(normalizeDescription)),
        [fixedDescriptions]
    );
    const { accounts } = usePaymentAccounts();
    const investmentAccounts = useMemo(
        () =>
            [...accounts]
                .filter((a) => a.accountType === 'investment')
                .sort((a, b) => a.name.localeCompare(b.name, 'en-MY', { sensitivity: 'base' })),
        [accounts]
    );

    const [trips, setTrips] = useState<TripWithTotals[]>([]);
    const tripNameById = useMemo(() => new Map(trips.map((t) => [t.id, t.name])), [trips]);

    const loadTrips = useCallback(async () => {
        try {
            const res = await fetchTrips();
            setTrips(res.entries);
            return res.entries;
        } catch {
            // trip grouping is optional; the form still works without it
            return [];
        }
    }, []);

    useEffect(() => {
        void loadTrips();
    }, [loadTrips]);

    const [modalMode, setModalMode] = useState<ModalMode>('closed');
    const [editingEntry, setEditingEntry] = useState<ExpenseTransaction | null>(null);
    const [form, setForm] = useState({
        date: '',
        category: '',
        amount: '',
        description: '',
        paymentMethod: '',
        toInvestmentAccount: '',
        tripId: '',
    });
    const [showReimbursements, setShowReimbursements] = useState(false);
    const [reimbursements, setReimbursements] = useState<ReimbursementRow[]>([emptyReimbursement()]);
    const [saving, setSaving] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const filteredEntries = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return entries;
        return entries.filter((entry) => expenseEntryMatchesQuery(entry, q));
    }, [entries, searchQuery]);

    const { page, setPage, pageItems, totalPages, totalItems } = usePagination(filteredEntries, {
        pageSize: DAY_PAGE_SIZE,
    });

    const showTransferDestination = requiresAccountTransfer(form.category);
    /** Exchange / fund / card entries belong to their trip; only the Trips panel manages them. */
    const tripLocked = modalMode === 'edit' && editingEntry?.tripLeg != null;
    const investment = isInvestmentCategory(form.category);

    const openCreate = useCallback(() => {
        const date = defaultDate ?? '';
        setModalMode('create');
        setEditingEntry(null);
        setForm({
            date,
            category: '',
            amount: '',
            description: '',
            paymentMethod: '',
            toInvestmentAccount: '',
            tripId: '',
        });
        setShowReimbursements(false);
        setReimbursements([emptyReimbursement()]);
        setModalError(null);
        // Refresh so newly created trips show up, and pre-select the trip covering this date.
        void loadTrips().then((list) => {
            const match = tripForDate(list, date);
            if (!match) return;
            setForm((f) => (f.date === date && !f.tripId ? { ...f, tripId: String(match.id) } : f));
        });
    }, [defaultDate, loadTrips]);

    const openEdit = (entry: ExpenseTransaction) => {
        setModalMode('edit');
        setEditingEntry(entry);
        setForm({
            date: entry.date,
            category: entry.category,
            amount: String(entry.grossAmount ?? entry.amount),
            description: entry.description,
            paymentMethod: entry.paymentMethod ?? '',
            toInvestmentAccount: entry.toInvestmentAccount ?? '',
            tripId: entry.tripId != null ? String(entry.tripId) : '',
        });
        setModalError(null);
        void loadTrips();
    };

    const closeModal = () => {
        setModalMode('closed');
        setEditingEntry(null);
        setModalError(null);
    };

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
            if (modalMode === 'create') {
                await createExpenseTransaction(payload);
            } else if (editingEntry) {
                await updateExpenseTransaction(editingEntry.id, {
                    date: payload.date,
                    category: payload.category,
                    amount: payload.amount,
                    description: payload.description,
                    paymentMethod,
                    toInvestmentAccount: hasFundingTransfer ? toInvestmentAccount : null,
                    ...(tripLocked ? {} : { tripId }),
                });
            }
            closeModal();
            onChanged();
        } catch (err) {
            setModalError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (entry: ExpenseTransaction) => {
        setActionError(null);
        try {
            await deleteExpenseTransaction(entry.id);
            onChanged();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to delete');
        }
    };

    const formatEntryAmount = (entry: ExpenseTransaction) => {
        const reimbursed = entry.reimbursed ?? 0;
        const netAmount = entry.netAmount ?? entry.amount;
        if (reimbursed > 0) {
            return `${formatAmount(netAmount)} (gross ${formatAmount(entry.grossAmount ?? entry.amount)}, reimbursed ${formatAmount(reimbursed)})`;
        }
        return formatAmount(entry.amount);
    };

    const modal = (
        <RecordModal
            title={modalMode === 'create' ? 'Add transaction' : 'Edit transaction'}
            open={modalMode !== 'closed'}
            saving={saving}
            error={modalError}
            onClose={closeModal}
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
                    usedCategories={entries.map((e) => e.category)}
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

    return (
        <>
            {defaultDate != null && (
                <div className="section-header-row">
                    <button type="button" className="btn-add" onClick={openCreate}>
                        + Add
                    </button>
                </div>
            )}
            {actionError && <p className="error">{actionError}</p>}
            {entries.length === 0 ? (
                <p className="muted">No transactions logged this day.</p>
            ) : (
                <>
                    {filteredEntries.length === 0 && (
                        <p className="muted">No transactions match your search.</p>
                    )}
                    <ul className="day-entry-list">
                        {pageItems.map((entry) => (
                            <li key={entry.id} className="day-entry-card">
                                <div className="day-entry-main">
                                    <span className="day-entry-title">
                                        {entry.description}
                                        {fixedDescriptionSet.has(normalizeDescription(entry.description)) && (
                                            <span className="fixed-tag" title="Counted as a fixed expense">
                                                Fixed
                                            </span>
                                        )}
                                        {entry.tripId != null && tripNameById.has(entry.tripId) && (
                                            <span className="trip-tag" title="Grouped in this trip">
                                                {tripNameById.get(entry.tripId)}
                                            </span>
                                        )}
                                    </span>
                                    <span className="day-entry-sub">
                                        {entry.category}
                                        {entry.paymentMethod ? ` · ${entry.paymentMethod}` : ''}
                                        {entry.toInvestmentAccount
                                            ? ` → ${entry.toInvestmentAccount}`
                                            : ''}
                                        {' · '}
                                        {formatEntryAmount(entry)}
                                    </span>
                                </div>
                                <RowActions
                                    onEdit={() => openEdit(entry)}
                                    onDelete={() => handleDelete(entry)}
                                    deleteLabel="this transaction"
                                />
                            </li>
                        ))}
                    </ul>
                    {totalPages > 1 && (
                        <TablePagination
                            page={page}
                            totalPages={totalPages}
                            totalItems={totalItems}
                            onPageChange={setPage}
                        />
                    )}
                </>
            )}
            {modal}
        </>
    );
}
