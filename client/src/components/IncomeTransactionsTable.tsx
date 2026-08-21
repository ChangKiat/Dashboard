import { useCallback, useMemo, useState } from 'react';

import type { ExpenseTransaction, IncomeTransaction } from '../api';
import {
    createIncomeTransaction,
    deleteIncomeTransaction,
    updateIncomeTransaction,
} from '../api';
import { usePagination } from '../hooks/usePagination';
import { formatIncomeAccountFlow } from '../utils/incomeAccounts';
import IncomeCategorySelect from './IncomeCategorySelect';
import PaymentMethodSelect from './PaymentMethodSelect';
import RecordModal from './RecordModal';
import RowActions from './RowActions';
import TablePagination from './TablePagination';

const DAY_PAGE_SIZE = 5;
const MONTH_PAGE_SIZE = 10;

function expenseMatchesQuery(exp: ExpenseTransaction, query: string): boolean {
    if (String(exp.id).includes(query)) return true;
    if (exp.description.toLowerCase().includes(query)) return true;
    if (exp.date.includes(query)) return true;
    if (String(exp.amount).includes(query)) return true;
    if (exp.amount.toFixed(2).includes(query)) return true;
    return false;
}

type ModalMode = 'closed' | 'create' | 'edit';
type TableVariant = 'day' | 'month';

interface Props {
    entries: IncomeTransaction[];
    recentExpenses?: ExpenseTransaction[];
    formatAmount: (amount: number) => string;
    onChanged: () => void;
    defaultDate?: string;
    variant?: TableVariant;
    month?: string;
}

export default function IncomeTransactionsTable({
    entries,
    recentExpenses = [],
    formatAmount,
    onChanged,
    defaultDate,
    variant = defaultDate != null ? 'day' : 'month',
    month,
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
        paymentMethod: '',
        fromPaymentMethod: '',
    });
    const [saving, setSaving] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [expenseSearchQuery, setExpenseSearchQuery] = useState('');

    const { page, setPage, pageItems, totalPages, totalItems } = usePagination(entries, {
        pageSize: variant === 'month' ? MONTH_PAGE_SIZE : DAY_PAGE_SIZE,
    });

    const filteredExpenses = useMemo(() => {
        const q = expenseSearchQuery.trim().toLowerCase();
        if (!q) return recentExpenses;
        return recentExpenses.filter((exp) => expenseMatchesQuery(exp, q));
    }, [recentExpenses, expenseSearchQuery]);

    const openCreate = useCallback(() => {
        setModalMode('create');
        setEditingEntry(null);
        const defaultCreateDate = defaultDate ?? (month ? `${month}-01` : '');
        setForm({
            date: defaultCreateDate,
            category: 'Claim',
            amount: '',
            description: '',
            source: '',
            expenseId: '',
            paymentMethod: '',
            fromPaymentMethod: '',
        });
        setExpenseSearchQuery('');
        setModalError(null);
    }, [defaultDate, month]);

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
            paymentMethod: entry.paymentMethod ?? '',
            fromPaymentMethod: entry.fromPaymentMethod ?? '',
        });
        setExpenseSearchQuery('');
        setModalError(null);
    };

    const closeModal = () => {
        setModalMode('closed');
        setEditingEntry(null);
        setExpenseSearchQuery('');
        setModalError(null);
    };

    const handleCategoryChange = (category: string) => {
        setForm((f) => ({
            ...f,
            category,
            expenseId: category === 'Account transfer' ? '' : f.expenseId,
            fromPaymentMethod: category === 'Account transfer' ? f.fromPaymentMethod : '',
        }));
        if (category !== 'Transfer') setExpenseSearchQuery('');
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

        const isAccountTransfer = form.category === 'Account transfer';
        const paymentMethod = form.paymentMethod.trim() || null;
        const fromPaymentMethod = isAccountTransfer ? form.fromPaymentMethod.trim() || null : null;

        if (isAccountTransfer) {
            if (!fromPaymentMethod || !paymentMethod) {
                setModalError('Account transfer requires both from and to accounts.');
                return;
            }
            if (fromPaymentMethod === paymentMethod) {
                setModalError('From and to accounts must be different.');
                return;
            }
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
        } else if (isAccountTransfer) {
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
                paymentMethod,
                fromPaymentMethod,
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
    const showFromAccount = form.category === 'Account transfer';

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
                    onChange={handleCategoryChange}
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
            {showFromAccount && (
                <div className="form-field">
                    <label htmlFor="income-from-account">From account</label>
                    <PaymentMethodSelect
                        id="income-from-account"
                        value={form.fromPaymentMethod}
                        onChange={(fromPaymentMethod) =>
                            setForm((f) => ({ ...f, fromPaymentMethod }))
                        }
                    />
                </div>
            )}
            <div className="form-field">
                <label htmlFor="income-to-account">To account</label>
                <PaymentMethodSelect
                    id="income-to-account"
                    value={form.paymentMethod}
                    onChange={(paymentMethod) => setForm((f) => ({ ...f, paymentMethod }))}
                />
            </div>
            {showExpenseLink && (
                <div className="form-field">
                    <label htmlFor="income-expense-search">Link to expense (optional)</label>
                    {recentExpenses.length > 0 ? (
                        <div className="expense-link-picker">
                            {form.expenseId ? (
                                <div className="expense-link-selected">
                                    <span>
                                        Linked to expense #{form.expenseId}
                                        {(() => {
                                            const selected = recentExpenses.find(
                                                (exp) => String(exp.id) === form.expenseId
                                            );
                                            return selected
                                                ? ` — ${selected.description} (${selected.date}, ${formatAmount(selected.amount)})`
                                                : '';
                                        })()}
                                    </span>
                                    <button
                                        type="button"
                                        className="btn-link"
                                        onClick={() =>
                                            setForm((f) => ({ ...f, expenseId: '' }))
                                        }
                                    >
                                        Change
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="category-detail-search">
                                        <input
                                            id="income-expense-search"
                                            type="search"
                                            placeholder="Search this or last month by name, amount, date, or id…"
                                            aria-label="Search expenses to link"
                                            value={expenseSearchQuery}
                                            onChange={(e) =>
                                                setExpenseSearchQuery(e.target.value)
                                            }
                                        />
                                    </div>
                                    {filteredExpenses.length === 0 ? (
                                        <p className="muted expense-link-empty">
                                            No expenses match your search.
                                        </p>
                                    ) : (
                                        <ul className="expense-link-list" role="listbox">
                                            {filteredExpenses.map((exp) => (
                                                <li key={exp.id}>
                                                    <button
                                                        type="button"
                                                        role="option"
                                                        aria-selected={false}
                                                        className="expense-link-option"
                                                        onClick={() =>
                                                            setForm((f) => ({
                                                                ...f,
                                                                expenseId: String(exp.id),
                                                            }))
                                                        }
                                                    >
                                                        <span className="expense-link-option-main">
                                                            <span className="expense-link-option-title">
                                                                #{exp.id} — {exp.description}
                                                            </span>
                                                            <span className="expense-link-option-meta">
                                                                {exp.date}
                                                            </span>
                                                        </span>
                                                        <span className="expense-link-option-amount">
                                                            {formatAmount(exp.amount)}
                                                        </span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </>
                            )}
                        </div>
                    ) : (
                        <input
                            id="income-expense"
                            type="number"
                            min="1"
                            step="1"
                            placeholder="Expense id"
                            value={form.expenseId}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, expenseId: e.target.value }))
                            }
                        />
                    )}
                </div>
            )}
        </RecordModal>
    );

    const showToolbar = variant === 'month' || defaultDate != null;
    const emptyMessage =
        variant === 'month' ? 'No income logged this month.' : 'No income logged this day.';

    const renderAccountFlow = (entry: IncomeTransaction) => {
        const flow = formatIncomeAccountFlow(entry.paymentMethod, entry.fromPaymentMethod);
        if (!flow) return null;
        return <span className="income-entry-accounts">{flow}</span>;
    };

    return (
        <>
            {showToolbar && (
                <div className="section-header-row">
                    <button type="button" className="btn-add" onClick={openCreate}>
                        + Add
                    </button>
                </div>
            )}
            {actionError && <p className="error">{actionError}</p>}
            {entries.length === 0 ? (
                <p className="muted">{emptyMessage}</p>
            ) : (
                <>
                    <ul
                        className={
                            variant === 'month'
                                ? 'day-entry-list income-transactions-list'
                                : 'day-entry-list'
                        }
                    >
                        {pageItems.map((entry) => (
                            <li key={entry.id} className="day-entry-card">
                                <div className="day-entry-main">
                                    <span className="day-entry-title">{entry.description}</span>
                                    {variant === 'month' ? (
                                        <div className="income-entry-meta">
                                            <span className="income-entry-date">{entry.date}</span>
                                            <span>{entry.category}</span>
                                            {entry.source ? <span>{entry.source}</span> : null}
                                            {renderAccountFlow(entry)}
                                            <span className="income-entry-amount">
                                                {formatAmount(entry.amount)}
                                            </span>
                                            {entry.expenseId != null ? (
                                                <span>expense #{entry.expenseId}</span>
                                            ) : null}
                                        </div>
                                    ) : (
                                        <span className="day-entry-sub">
                                            {entry.category}
                                            {entry.source ? ` · ${entry.source}` : ''}
                                            {formatIncomeAccountFlow(
                                                entry.paymentMethod,
                                                entry.fromPaymentMethod
                                            )
                                                ? ` · ${formatIncomeAccountFlow(entry.paymentMethod, entry.fromPaymentMethod)}`
                                                : ''}{' '}
                                            · {formatAmount(entry.amount)}
                                            {entry.expenseId != null
                                                ? ` · expense #${entry.expenseId}`
                                                : ''}
                                        </span>
                                    )}
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
