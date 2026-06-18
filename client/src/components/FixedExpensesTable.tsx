import { useState } from 'react';

import type { FixedExpenseConfig } from '../api';
import { deleteFixedExpense, updateFixedExpense } from '../api';
import { usePagination } from '../hooks/usePagination';
import ExpenseCategorySelect from './ExpenseCategorySelect';
import RecordModal from './RecordModal';
import RowActions from './RowActions';
import TablePagination from './TablePagination';

interface Props {
    rows: FixedExpenseConfig[];
    variableCategories: string[];
    formatAmount: (amount: number) => string;
    onChanged: () => void;
}

export default function FixedExpensesTable({ rows, variableCategories, formatAmount, onChanged }: Props) {
    const { page, setPage, pageItems, totalPages, totalItems } = usePagination(rows);
    const [editing, setEditing] = useState<FixedExpenseConfig | null>(null);
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

    const openEdit = (row: FixedExpenseConfig) => {
        setEditing(row);
        setForm({
            description: row.description,
            category: row.category,
            amount: String(row.amount),
            dayOfMonth: String(row.dayOfMonth),
            frequencyMonths: String(row.frequencyMonths),
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
            await updateFixedExpense(editing.id, {
                description: form.description.trim(),
                category: form.category.trim(),
                amount,
                dayOfMonth,
                frequencyMonths,
            });
            closeEdit();
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
            <h3>Fixed Expenses</h3>
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
                title="Edit fixed expense"
                open={editing != null}
                saving={saving}
                error={modalError}
                onClose={closeEdit}
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
