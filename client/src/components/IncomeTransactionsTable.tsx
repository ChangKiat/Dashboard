import { useCallback, useState } from 'react';

import type { ExpenseTransaction, IncomeTransaction } from '../api';
import {
    createIncomeTransaction,
    deleteIncomeTransaction,
    updateIncomeTransaction,
} from '../api';
import { usePagination } from '../hooks/usePagination';
import IncomeCategorySelect from './IncomeCategorySelect';
import RecordModal from './RecordModal';
import RowActions from './RowActions';
import TablePagination from './TablePagination';

const DAY_PAGE_SIZE = 5;

type ModalMode = 'closed' | 'create' | 'edit';

interface Props {
    entries: IncomeTransaction[];
    recentExpenses?: ExpenseTransaction[];
    formatAmount: (amount: number) => string;
    onChanged: () => void;
    defaultDate?: string;
}

export default function IncomeTransactionsTable({
    entries,
    recentExpenses = [],
    formatAmount,
    onChanged,
    defaultDate,
}: Props) {
    const [modalMode, setModalMode] = useState<ModalMode>('closed');
    const [editingEntry, setEditingEntry] = useState<IncomeTransaction | null>(null);
    const [form, setForm] = useState({
        date: '',
        category: '',
        amount: '',
        description: '',
        source: '',
        expenseId: '',
    });
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
            category: 'Claim',
            amount: '',
            description: '',
            source: '',
            expenseId: '',
        });
        setModalError(null);
    }, [defaultDate]);

    const openEdit = (entry: IncomeTransaction) => {
        setModalMode('edit');
        setEditingEntry(entry);
        setForm({
            date: entry.date,
            category: entry.category,
            amount: String(entry.amount),
            description: entry.description,
            source: entry.source ?? '',
            expenseId: entry.expenseId != null ? String(entry.expenseId) : '',
        });
        setModalError(null);
    };

    const closeModal = () => {
        setModalMode('closed');
        setEditingEntry(null);
        setModalError(null);
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

        let expenseId: number | null | undefined;
        if (form.category === 'Transfer' && form.expenseId.trim()) {
            const parsed = parseInt(form.expenseId.trim(), 10);
            if (!Number.isInteger(parsed) || parsed <= 0) {
                setModalError('Expense id must be a positive integer.');
                return;
            }
            expenseId = parsed;
        } else if (modalMode === 'edit' && form.category === 'Transfer' && !form.expenseId.trim()) {
            expenseId = null;
        }

        setSaving(true);
        setModalError(null);
        try {
            const payload = {
                date: form.date,
                category: form.category.trim(),
                amount,
                description: form.description.trim(),
                source: form.source.trim() || null,
                ...(expenseId !== undefined ? { expenseId } : {}),
            };
            if (modalMode === 'create') {
                await createIncomeTransaction(payload);
            } else if (editingEntry) {
                await updateIncomeTransaction(editingEntry.id, payload);
            }
            closeModal();
            onChanged();
        } catch (err) {
            setModalError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (entry: IncomeTransaction) => {
        setActionError(null);
        try {
            await deleteIncomeTransaction(entry.id);
            onChanged();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to delete');
        }
    };

    const showExpenseLink = form.category === 'Transfer';

    const modal = (
        <RecordModal
            title={modalMode === 'create' ? 'Add income' : 'Edit income'}
            open={modalMode !== 'closed'}
            saving={saving}
            error={modalError}
            onClose={closeModal}
            onSave={handleSave}
        >
            <div className="form-field">
                <label htmlFor="income-date">Date</label>
                <input
                    id="income-date"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
            </div>
            <div className="form-field">
                <label htmlFor="income-category">Category</label>
                <IncomeCategorySelect
                    id="income-category"
                    value={form.category}
                    usedCategories={entries.map((e) => e.category)}
                    onChange={(category) => setForm((f) => ({ ...f, category }))}
                />
            </div>
            <div className="form-field">
                <label htmlFor="income-amount">Amount</label>
                <input
                    id="income-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                />
            </div>
            <div className="form-field">
                <label htmlFor="income-description">Description</label>
                <input
                    id="income-description"
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
            </div>
            <div className="form-field">
                <label htmlFor="income-source">Source (optional)</label>
                <input
                    id="income-source"
                    type="text"
                    placeholder="Person or payer name"
                    value={form.source}
                    onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                />
            </div>
            {showExpenseLink && (
                <div className="form-field">
                    <label htmlFor="income-expense">Link to expense (optional)</label>
                    {recentExpenses.length > 0 ? (
                        <select
                            id="income-expense"
                            value={form.expenseId}
                            onChange={(e) => setForm((f) => ({ ...f, expenseId: e.target.value }))}
                        >
                            <option value="">None</option>
                            {recentExpenses.map((exp) => (
                                <option key={exp.id} value={String(exp.id)}>
                                    #{exp.id} — {exp.description} ({formatAmount(exp.amount)})
                                </option>
                            ))}
                        </select>
                    ) : (
                        <input
                            id="income-expense"
                            type="number"
                            min="1"
                            step="1"
                            placeholder="Expense id"
                            value={form.expenseId}
                            onChange={(e) => setForm((f) => ({ ...f, expenseId: e.target.value }))}
                        />
                    )}
                </div>
            )}
        </RecordModal>
    );

    return (
        <>
            {defaultDate != null && (
                <div className="section-header-row">
                    <h4>Income received</h4>
                    <button type="button" className="btn-add" onClick={openCreate}>
                        + Add
                    </button>
                </div>
            )}
            {actionError && <p className="error">{actionError}</p>}
            {entries.length === 0 ? (
                <p className="muted">No income logged this day.</p>
            ) : (
                <>
                    <ul className="day-entry-list">
                        {pageItems.map((entry) => (
                            <li key={entry.id} className="day-entry-card">
                                <div className="day-entry-main">
                                    <span className="day-entry-title">{entry.description}</span>
                                    <span className="day-entry-sub">
                                        {entry.category}
                                        {entry.source ? ` · ${entry.source}` : ''} ·{' '}
                                        {formatAmount(entry.amount)}
                                        {entry.expenseId != null ? ` · expense #${entry.expenseId}` : ''}
                                    </span>
                                </div>
                                <RowActions
                                    onEdit={() => openEdit(entry)}
                                    onDelete={() => handleDelete(entry)}
                                    deleteLabel="this income"
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
