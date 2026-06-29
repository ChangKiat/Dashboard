import { useCallback, useState } from 'react';

import type { ExpenseTransaction } from '../api';
import { createExpenseTransaction, deleteExpenseTransaction, updateExpenseTransaction } from '../api';
import { usePagination } from '../hooks/usePagination';
import ExpenseCategorySelect from './ExpenseCategorySelect';
import RecordModal from './RecordModal';
import RowActions from './RowActions';
import TablePagination from './TablePagination';

const DAY_PAGE_SIZE = 5;

type ModalMode = 'closed' | 'create' | 'edit';

type ReimbursementRow = { source: string; amount: string };

interface Props {
    entries: ExpenseTransaction[];
    variableCategories: string[];
    formatAmount: (amount: number) => string;
    onChanged: () => void;
    defaultDate?: string;
}

function emptyReimbursement(): ReimbursementRow {
    return { source: '', amount: '' };
}

export default function ExpenseTransactionsTable({
    entries,
    variableCategories,
    formatAmount,
    onChanged,
    defaultDate,
}: Props) {
    const [modalMode, setModalMode] = useState<ModalMode>('closed');
    const [editingEntry, setEditingEntry] = useState<ExpenseTransaction | null>(null);
    const [form, setForm] = useState({ date: '', category: '', amount: '', description: '' });
    const [showReimbursements, setShowReimbursements] = useState(false);
    const [reimbursements, setReimbursements] = useState<ReimbursementRow[]>([emptyReimbursement()]);
    const [saving, setSaving] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const { page, setPage, pageItems, totalPages, totalItems } = usePagination(entries, {
        pageSize: DAY_PAGE_SIZE,
    });

    const openCreate = useCallback(() => {
        setModalMode('create');
        setEditingEntry(null);
        setForm({
            date: defaultDate ?? '',
            category: '',
            amount: '',
            description: '',
        });
        setShowReimbursements(false);
        setReimbursements([emptyReimbursement()]);
        setModalError(null);
    }, [defaultDate]);

    const openEdit = (entry: ExpenseTransaction) => {
        setModalMode('edit');
        setEditingEntry(entry);
        setForm({
            date: entry.date,
            category: entry.category,
            amount: String(entry.grossAmount ?? entry.amount),
            description: entry.description,
        });
        setModalError(null);
    };

    const closeModal = () => {
        setModalMode('closed');
        setEditingEntry(null);
        setModalError(null);
    };

    const parseReimbursements = (): { source: string; amount: number }[] | 'invalid' => {
        const items: { source: string; amount: number }[] = [];
        for (const row of reimbursements) {
            const source = row.source.trim();
            const amount = parseFloat(row.amount);
            if (!source && !row.amount.trim()) continue;
            if (!source || !Number.isFinite(amount) || amount <= 0) return 'invalid';
            items.push({ source, amount });
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

        let reimbursementPayload: { source: string; amount: number }[] | undefined;
        if (modalMode === 'create' && showReimbursements) {
            const parsed = parseReimbursements();
            if (parsed === 'invalid') {
                setModalError('Each reimbursement needs a person name and positive amount.');
                return;
            }
            reimbursementPayload = parsed.length > 0 ? parsed : undefined;
        }

        setSaving(true);
        setModalError(null);
        try {
            const payload = {
                date: form.date,
                category: form.category.trim(),
                amount,
                description: form.description.trim(),
                ...(reimbursementPayload ? { reimbursements: reimbursementPayload } : {}),
            };
            if (modalMode === 'create') {
                await createExpenseTransaction(payload);
            } else if (editingEntry) {
                await updateExpenseTransaction(editingEntry.id, {
                    date: payload.date,
                    category: payload.category,
                    amount: payload.amount,
                    description: payload.description,
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
                    onChange={(category) => setForm((f) => ({ ...f, category }))}
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
            {modalMode === 'create' && (
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
                    <h4>Expenses</h4>
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
                    <ul className="day-entry-list">
                        {pageItems.map((entry) => (
                            <li key={entry.id} className="day-entry-card">
                                <div className="day-entry-main">
                                    <span className="day-entry-title">{entry.description}</span>
                                    <span className="day-entry-sub">
                                        {entry.category} · {formatEntryAmount(entry)}
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
