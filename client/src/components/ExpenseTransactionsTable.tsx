import { useState } from 'react';

import type { ExpenseTransaction } from '../api';
import { deleteExpenseTransaction, updateExpenseTransaction } from '../api';
import { usePagination } from '../hooks/usePagination';
import ExpenseCategorySelect from './ExpenseCategorySelect';
import RecordModal from './RecordModal';
import RowActions from './RowActions';
import TablePagination from './TablePagination';

const DAY_PAGE_SIZE = 5;

interface Props {
    entries: ExpenseTransaction[];
    variableCategories: string[];
    formatAmount: (amount: number) => string;
    onChanged: () => void;
}

export default function ExpenseTransactionsTable({
    entries,
    variableCategories,
    formatAmount,
    onChanged,
}: Props) {
    const [editing, setEditing] = useState<ExpenseTransaction | null>(null);
    const [form, setForm] = useState({ date: '', category: '', amount: '', description: '' });
    const [saving, setSaving] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const { page, setPage, pageItems, totalPages, totalItems } = usePagination(entries, {
        pageSize: DAY_PAGE_SIZE,
    });

    const openEdit = (entry: ExpenseTransaction) => {
        setEditing(entry);
        setForm({
            date: entry.date,
            category: entry.category,
            amount: String(entry.amount),
            description: entry.description,
        });
        setModalError(null);
    };

    const closeEdit = () => {
        setEditing(null);
        setModalError(null);
    };

    const handleSave = async () => {
        if (!editing) return;
        const amount = parseFloat(form.amount);
        if (!form.date || !form.category.trim() || !form.description.trim() || !Number.isFinite(amount) || amount <= 0) {
            setModalError('Date, category, description, and a positive amount are required.');
            return;
        }
        setSaving(true);
        setModalError(null);
        try {
            await updateExpenseTransaction(editing.id, {
                date: form.date,
                category: form.category.trim(),
                amount,
                description: form.description.trim(),
            });
            closeEdit();
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

    const editModal = (
        <RecordModal
            title="Edit transaction"
            open={editing != null}
            saving={saving}
            error={modalError}
            onClose={closeEdit}
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
        </RecordModal>
    );

    if (entries.length === 0) {
        return <p className="muted">No transactions logged this day.</p>;
    }

    return (
        <>
            {actionError && <p className="error">{actionError}</p>}
            <ul className="day-entry-list">
                {pageItems.map((entry) => (
                    <li key={entry.id} className="day-entry-card">
                        <div className="day-entry-main">
                            <span className="day-entry-title">{entry.description}</span>
                            <span className="day-entry-sub">
                                {entry.category} · {formatAmount(entry.amount)}
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
            {editModal}
        </>
    );
}
