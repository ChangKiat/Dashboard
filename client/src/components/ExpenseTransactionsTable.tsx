import { useEffect, useMemo, useState } from 'react';

import type { ExpenseTransaction } from '../api';
import { deleteExpenseTransaction, updateExpenseTransaction } from '../api';
import { buildExpenseCategoryOptions } from '../utils/expenseCategories';
import { usePagination } from '../hooks/usePagination';
import ExpenseCategorySelect from './ExpenseCategorySelect';
import RecordModal from './RecordModal';
import RowActions from './RowActions';
import TablePagination from './TablePagination';

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
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [editing, setEditing] = useState<ExpenseTransaction | null>(null);
    const [form, setForm] = useState({ date: '', category: '', amount: '', description: '' });
    const [saving, setSaving] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const categoryOptions = useMemo(
        () => buildExpenseCategoryOptions(variableCategories, entries.map((e) => e.category)),
        [variableCategories, entries]
    );

    const filteredEntries = useMemo(() => {
        if (categoryFilter === 'all') return entries;
        return entries.filter(
            (e) => e.category.toLowerCase() === categoryFilter.toLowerCase()
        );
    }, [entries, categoryFilter]);

    const { page, setPage, pageItems, totalPages, totalItems } = usePagination(filteredEntries);

    useEffect(() => {
        setCategoryFilter('all');
    }, [entries]);

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

    if (entries.length === 0) {
        return <p className="muted">No transactions logged in this month.</p>;
    }

    return (
        <>
            {actionError && <p className="error">{actionError}</p>}
            <div className="transactions-toolbar">
                <select
                    className="chart-select"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    aria-label="Filter by category"
                >
                    <option value="all">All categories</option>
                    {categoryOptions.map((category) => (
                        <option key={category} value={category}>
                            {category}
                        </option>
                    ))}
                </select>
            </div>
            {filteredEntries.length === 0 ? (
                <p className="muted">No transactions match this category.</p>
            ) : (
                <>
                    <div className="table-scroll">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Category</th>
                                    <th>Amount</th>
                                    <th>Description</th>
                                    <th className="actions-col">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pageItems.map((entry) => (
                                    <tr key={entry.id}>
                                        <td>{entry.date}</td>
                                        <td>{entry.category}</td>
                                        <td>{formatAmount(entry.amount)}</td>
                                        <td className="notes-cell">{entry.description}</td>
                                        <td>
                                            <RowActions
                                                onEdit={() => openEdit(entry)}
                                                onDelete={() => handleDelete(entry)}
                                                deleteLabel="this transaction"
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <TablePagination
                        page={page}
                        totalPages={totalPages}
                        totalItems={totalItems}
                        onPageChange={setPage}
                    />
                </>
            )}
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
        </>
    );
}
