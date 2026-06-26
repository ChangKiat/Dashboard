import { useState } from 'react';

import type { FixedExpenseConfig } from '../api';
import { createFixedExpense, deleteFixedExpense, updateFixedExpense } from '../api';
import { usePagination } from '../hooks/usePagination';
import ExpenseCategorySelect from './ExpenseCategorySelect';
import RecordModal from './RecordModal';
import RowActions from './RowActions';
import TablePagination from './TablePagination';

type ModalMode = 'closed' | 'create' | 'edit';

interface Props {
    rows: FixedExpenseConfig[];
    variableCategories: string[];
    formatAmount: (amount: number) => string;
    onChanged: () => void;
}

export default function FixedExpensesTable({ rows, variableCategories, formatAmount, onChanged }: Props) {
    const { page, setPage, pageItems, totalPages, totalItems } = usePagination(rows);
    const [modalMode, setModalMode] = useState<ModalMode>('closed');
    const [editingEntry, setEditingEntry] = useState<FixedExpenseConfig | null>(null);
    const [form, setForm] = useState({
        description: '',
        category: '',
        amount: '',
        dayOfMonth: '',
        frequencyMonths: '',
    });
    const [saving, setSaving] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const openCreate = () => {
        setModalMode('create');
        setEditingEntry(null);
        setForm({
            description: '',
            category: '',
            amount: '',
            dayOfMonth: '1',
            frequencyMonths: '1',
        });
        setModalError(null);
    };

    const openEdit = (row: FixedExpenseConfig) => {
        setModalMode('edit');
        setEditingEntry(row);
        setForm({
            description: row.description,
            category: row.category,
            amount: String(row.amount),
            dayOfMonth: String(row.dayOfMonth),
            frequencyMonths: String(row.frequencyMonths),
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
        const dayOfMonth = parseInt(form.dayOfMonth, 10);
        const frequencyMonths = parseInt(form.frequencyMonths, 10);
        if (
            !form.description.trim() ||
            !form.category.trim() ||
            !Number.isFinite(amount) ||
            amount <= 0 ||
            !Number.isInteger(dayOfMonth) ||
            dayOfMonth < 1 ||
            dayOfMonth > 31 ||
            !Number.isInteger(frequencyMonths) ||
            frequencyMonths <= 0
        ) {
            setModalError('Fill in all fields with valid values.');
            return;
        }
        setSaving(true);
        setModalError(null);
        try {
            const payload = {
                description: form.description.trim(),
                category: form.category.trim(),
                amount,
                dayOfMonth,
                frequencyMonths,
            };
            if (modalMode === 'create') {
                await createFixedExpense({
                    ...payload,
                    startMonth: new Date().getMonth() + 1,
                });
            } else if (editingEntry) {
                await updateFixedExpense(editingEntry.id, payload);
            }
            closeModal();
            onChanged();
        } catch (err) {
            setModalError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (row: FixedExpenseConfig) => {
        setActionError(null);
        try {
            await deleteFixedExpense(row.id);
            onChanged();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to delete');
        }
    };

    return (
        <div className="expenses-table-card expenses-fixed-expenses">
            <div className="section-header-row">
                <h3>Fixed Expenses</h3>
                <button type="button" className="btn-add" onClick={openCreate}>
                    + Add
                </button>
            </div>
            {actionError && <p className="error">{actionError}</p>}
            <div className="table-scroll">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Description</th>
                            <th>Category</th>
                            <th>Amount</th>
                            <th>Date of payment</th>
                            <th className="actions-col">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="muted">
                                    No fixed expenses configured
                                </td>
                            </tr>
                        ) : (
                            pageItems.map((row) => (
                                <tr key={row.id}>
                                    <td>{row.description}</td>
                                    <td>{row.category}</td>
                                    <td>{formatAmount(row.amount)}</td>
                                    <td>{row.dayOfMonth}</td>
                                    <td>
                                        <RowActions
                                            onEdit={() => openEdit(row)}
                                            onDelete={() => handleDelete(row)}
                                            deleteLabel={`"${row.description}"`}
                                        />
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            <TablePagination
                page={page}
                totalPages={totalPages}
                totalItems={totalItems}
                onPageChange={setPage}
            />
            <RecordModal
                title={modalMode === 'create' ? 'Add fixed expense' : 'Edit fixed expense'}
                open={modalMode !== 'closed'}
                saving={saving}
                error={modalError}
                onClose={closeModal}
                onSave={handleSave}
            >
                <div className="form-field">
                    <label htmlFor="fx-description">Description</label>
                    <input
                        id="fx-description"
                        type="text"
                        value={form.description}
                        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    />
                </div>
                <div className="form-field">
                    <label htmlFor="fx-category">Category</label>
                    <ExpenseCategorySelect
                        id="fx-category"
                        value={form.category}
                        variableCategories={variableCategories}
                        usedCategories={rows.map((r) => r.category)}
                        onChange={(category) => setForm((f) => ({ ...f, category }))}
                    />
                </div>
                <div className="form-field">
                    <label htmlFor="fx-amount">Amount</label>
                    <input
                        id="fx-amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.amount}
                        onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    />
                </div>
                <div className="form-field">
                    <label htmlFor="fx-day">Day of month</label>
                    <input
                        id="fx-day"
                        type="number"
                        min="1"
                        max="31"
                        value={form.dayOfMonth}
                        onChange={(e) => setForm((f) => ({ ...f, dayOfMonth: e.target.value }))}
                    />
                </div>
                <div className="form-field">
                    <label htmlFor="fx-frequency">Frequency (months)</label>
                    <input
                        id="fx-frequency"
                        type="number"
                        min="1"
                        value={form.frequencyMonths}
                        onChange={(e) => setForm((f) => ({ ...f, frequencyMonths: e.target.value }))}
                    />
                </div>
            </RecordModal>
        </div>
    );
}
