import { useMemo, useState } from 'react';

import type { FixedExpenseConfig } from '../api';
import { createFixedExpense, deleteFixedExpense, updateFixedExpense } from '../api';
import { usePagination } from '../hooks/usePagination';
import { usePaymentAccounts } from '../hooks/usePaymentAccounts';
import { isInvestmentCategory, isOtherCategory, requiresAccountTransfer, resolveOtherAccountFields } from '../utils/expenseCategories';
import { frequencyLabel, monthlyCost, nextDueDate } from '../utils/recurring';
import ExpenseCategorySelect from './ExpenseCategorySelect';
import PaymentMethodSelect from './PaymentMethodSelect';
import RecordModal from './RecordModal';
import RowActions from './RowActions';
import TablePagination from './TablePagination';

type ModalMode = 'closed' | 'create' | 'edit';

const EMPTY_FORM = {
    description: '',
    category: '',
    paymentMethod: '',
    toInvestmentAccount: '',
    instrumentId: '',
    amount: '',
    dayOfMonth: '1',
    frequencyMonths: '1',
};

function formatShortDate(iso: string) {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('en-MY', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

function destinationLabel(row: FixedExpenseConfig): string {
    if (row.toInvestmentAccount && row.instrumentName) {
        return `${row.toInvestmentAccount} · ${row.instrumentName}`;
    }
    return row.toInvestmentAccount ?? '';
}

interface Props {
    rows: FixedExpenseConfig[];
    variableCategories: string[];
    formatAmount: (amount: number) => string;
    onChanged: () => void;
    today: string;
    /** Hours of work an amount takes, or null when there's no salary to divide by. */
    workTime: (amount: number) => string | null;
}

const AVATAR_COLORS = [
    'var(--series-red)',
    'var(--series-blue)',
    'var(--series-green)',
    'var(--series-purple)',
    'var(--series-orange)',
    'var(--series-teal)',
    'var(--series-pink)',
    'var(--series-amber)',
];

/** The same colour every time for a category. */
function categoryColor(category: string) {
    let hash = 0;
    for (const ch of category) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export default function FixedExpensesTable({
    rows,
    variableCategories,
    formatAmount,
    onChanged,
    today,
    workTime,
}: Props) {
    const { accounts } = usePaymentAccounts();
    const investmentAccounts = useMemo(
        () =>
            [...accounts]
                .filter((a) => a.accountType === 'investment')
                .sort((a, b) => a.name.localeCompare(b.name, 'en-MY', { sensitivity: 'base' })),
        [accounts]
    );

    const [categoryFilter, setCategoryFilter] = useState('');
    const [paymentFilter, setPaymentFilter] = useState('');
    const [modalMode, setModalMode] = useState<ModalMode>('closed');
    const [editingEntry, setEditingEntry] = useState<FixedExpenseConfig | null>(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const categoryOptions = useMemo(
        () =>
            [...new Set(rows.map((r) => r.category))].sort((a, b) =>
                a.localeCompare(b, 'en-MY', { sensitivity: 'base' })
            ),
        [rows]
    );

    const paymentOptions = useMemo(
        () =>
            [
                ...new Set(
                    rows
                        .map((r) => r.paymentMethod)
                        .filter((m): m is string => Boolean(m))
                ),
            ].sort((a, b) => a.localeCompare(b, 'en-MY', { sensitivity: 'base' })),
        [rows]
    );

    const hasUnsetPaymentMethod = useMemo(
        () => rows.some((r) => !r.paymentMethod),
        [rows]
    );

    const filteredRows = useMemo(() => {
        return rows.filter((r) => {
            if (categoryFilter && r.category !== categoryFilter) return false;
            if (paymentFilter === '__none__') return !r.paymentMethod;
            if (paymentFilter && r.paymentMethod !== paymentFilter) return false;
            return true;
        });
    }, [rows, categoryFilter, paymentFilter]);

    // Biggest monthly cost first.
    const sortedRows = useMemo(
        () =>
            [...filteredRows].sort(
                (a, b) =>
                    monthlyCost(b) - monthlyCost(a) ||
                    a.description.localeCompare(b.description, 'en-MY', { sensitivity: 'base' })
            ),
        [filteredRows]
    );
    const { page, setPage, pageItems, totalPages, totalItems } = usePagination(sortedRows);

    const showTransferDestination = requiresAccountTransfer(form.category);
    const investment = isInvestmentCategory(form.category);

    const openCreate = () => {
        setModalMode('create');
        setEditingEntry(null);
        setForm(EMPTY_FORM);
        setModalError(null);
    };

    const openEdit = (row: FixedExpenseConfig) => {
        setModalMode('edit');
        setEditingEntry(row);
        setForm({
            description: row.description,
            category: row.category,
            paymentMethod: row.paymentMethod ?? '',
            toInvestmentAccount: row.toInvestmentAccount ?? '',
            instrumentId: row.instrumentId != null ? String(row.instrumentId) : '',
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

        const rawFrom = form.paymentMethod.trim() || null;
        const rawTo = form.toInvestmentAccount.trim() || null;
        const parsedInstrumentId = parseInt(form.instrumentId, 10);
        const instrumentId =
            investment && Number.isInteger(parsedInstrumentId) && parsedInstrumentId > 0
                ? parsedInstrumentId
                : null;

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

        setSaving(true);
        setModalError(null);
        try {
            const payload = {
                description: form.description.trim(),
                category: form.category.trim(),
                amount,
                dayOfMonth,
                frequencyMonths,
                paymentMethod,
                toInvestmentAccount: hasFundingTransfer ? toInvestmentAccount : null,
                instrumentId,
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

    const destinationValue = (() => {
        if (form.instrumentId) return `i:${form.instrumentId}`;
        if (!form.toInvestmentAccount) return '';
        const account = investmentAccounts.find((a) => a.name === form.toInvestmentAccount);
        return account ? `a:${account.id}` : '';
    })();

    return (
        <div className="card expenses-fixed-expenses">
            <div className="section-header-row">
                <div>
                    <h3>Active</h3>
                    <p className="recurring-sub">Sorted by what each costs a month</p>
                </div>
                <div className="fixed-expense-filters">
                    <select
                        aria-label="Filter by category"
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                    >
                        <option value="">All categories</option>
                        {categoryOptions.map((category) => (
                            <option key={category} value={category}>
                                {category}
                            </option>
                        ))}
                    </select>
                    <select
                        aria-label="Filter by payment method"
                        value={paymentFilter}
                        onChange={(e) => setPaymentFilter(e.target.value)}
                    >
                        <option value="">All payment methods</option>
                        {paymentOptions.map((method) => (
                            <option key={method} value={method}>
                                {method}
                            </option>
                        ))}
                        {hasUnsetPaymentMethod && (
                            <option value="__none__">No payment method</option>
                        )}
                    </select>
                </div>
                <button type="button" className="btn-add" onClick={openCreate}>
                    + Add
                </button>
            </div>
            {actionError && <p className="error">{actionError}</p>}
            {rows.length === 0 ? (
                <p className="muted">No recurring bills yet.</p>
            ) : sortedRows.length === 0 ? (
                <p className="muted">Nothing matches these filters.</p>
            ) : (
                <ul className="recurring-list">
                    {pageItems.map((row) => {
                        const next = nextDueDate(row, today);
                        const destination = destinationLabel(row);
                        const yearly = monthlyCost(row) * 12;
                        const work = workTime(yearly);
                        return (
                            <li key={row.id} className="recurring-row">
                                <span
                                    className="recurring-avatar"
                                    style={{ background: categoryColor(row.category) }}
                                    aria-hidden="true"
                                >
                                    {row.description.trim().charAt(0).toUpperCase()}
                                </span>
                                <span className="recurring-main">
                                    <span className="recurring-name">{row.description}</span>
                                    <span className="recurring-meta">
                                        {frequencyLabel(row.frequencyMonths)}
                                        {next && ` · next ${formatShortDate(next)}`}
                                        {row.paymentMethod && ` · ${row.paymentMethod}`}
                                        {destination && ` → ${destination}`}
                                        <span className="recurring-tag">{row.category}</span>
                                    </span>
                                </span>
                                <span className="recurring-figures">
                                    <span className="recurring-amount">{formatAmount(row.amount)}</span>
                                    <span className="recurring-sub">
                                        {work ? `${work} of work a year` : `${formatAmount(yearly)} a year`}
                                    </span>
                                </span>
                                <RowActions
                                    onEdit={() => openEdit(row)}
                                    onDelete={() => handleDelete(row)}
                                    deleteLabel={`"${row.description}"`}
                                />
                            </li>
                        );
                    })}
                </ul>
            )}
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
                        onChange={(category) =>
                            setForm((f) => ({
                                ...f,
                                category,
                                toInvestmentAccount: requiresAccountTransfer(category)
                                    ? f.toInvestmentAccount
                                    : '',
                                instrumentId: isInvestmentCategory(category) ? f.instrumentId : '',
                            }))
                        }
                    />
                </div>
                <div className="form-field">
                    <label htmlFor="fx-payment-method">
                        {investment
                            ? 'From account'
                            : showTransferDestination
                              ? 'From account (optional)'
                              : 'Payment method'}
                    </label>
                    <PaymentMethodSelect
                        id="fx-payment-method"
                        value={form.paymentMethod}
                        onChange={(paymentMethod) => setForm((f) => ({ ...f, paymentMethod }))}
                        excludeTypes={['investment']}
                    />
                </div>
                {showTransferDestination && investment && (
                    <div className="form-field">
                        <label htmlFor="fx-to-investment">To investment account</label>
                        <select
                            id="fx-to-investment"
                            value={destinationValue}
                            onChange={(e) => {
                                const value = e.target.value;
                                if (value.startsWith('i:')) {
                                    const id = parseInt(value.slice(2), 10);
                                    const parent = investmentAccounts.find((account) =>
                                        (account.holdings ?? []).some((holding) => holding.id === id)
                                    );
                                    setForm((f) => ({
                                        ...f,
                                        instrumentId: String(id),
                                        toInvestmentAccount: parent?.name ?? '',
                                    }));
                                    return;
                                }
                                if (value.startsWith('a:')) {
                                    const id = parseInt(value.slice(2), 10);
                                    const account = investmentAccounts.find((a) => a.id === id);
                                    setForm((f) => ({
                                        ...f,
                                        instrumentId: '',
                                        toInvestmentAccount: account?.name ?? '',
                                    }));
                                    return;
                                }
                                setForm((f) => ({
                                    ...f,
                                    instrumentId: '',
                                    toInvestmentAccount: '',
                                }));
                            }}
                        >
                            <option value="">—</option>
                            {investmentAccounts.map((account) => {
                                const funds = (account.holdings ?? []).filter(
                                    (holding) => holding.kind === 'fund'
                                );
                                return (
                                    <optgroup key={account.id} label={account.name}>
                                        <option value={`a:${account.id}`}>{account.name}</option>
                                        {funds.map((holding) => (
                                            <option key={holding.id} value={`i:${holding.id}`}>
                                                {account.name} · {holding.name}
                                            </option>
                                        ))}
                                    </optgroup>
                                );
                            })}
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
                        <label htmlFor="fx-to-account">To account (optional)</label>
                        <PaymentMethodSelect
                            id="fx-to-account"
                            value={form.toInvestmentAccount}
                            onChange={(toInvestmentAccount) =>
                                setForm((f) => ({ ...f, toInvestmentAccount }))
                            }
                        />
                    </div>
                )}
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
