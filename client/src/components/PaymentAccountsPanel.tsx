import { useMemo, useState } from 'react';

import type { PaymentAccount, PaymentAccountType } from '../api';
import {
    createPaymentAccount,
    deletePaymentAccount,
    updatePaymentAccount,
} from '../api';
import { usePaymentAccounts } from '../hooks/usePaymentAccounts';
import AccountActivityModal from './AccountActivityModal';
import RecordModal from './RecordModal';
import RowActions from './RowActions';

type ModalMode = 'closed' | 'create' | 'edit';

interface Props {
    onChanged?: () => void;
    formatAmount: (amount: number) => string;
}

function sortByName(accounts: PaymentAccount[]) {
    return [...accounts].sort((a, b) =>
        a.name.localeCompare(b.name, 'en-MY', { sensitivity: 'base' })
    );
}

interface ColumnProps {
    title: string;
    accountType: PaymentAccountType;
    accounts: PaymentAccount[];
    formatAmount: (amount: number) => string;
    onAdd: (accountType: PaymentAccountType) => void;
    onEdit: (account: PaymentAccount) => void;
    onDelete: (account: PaymentAccount) => void;
    onView: (account: PaymentAccount) => void;
}

function PaymentAccountColumn({
    title,
    accountType,
    accounts,
    formatAmount,
    onAdd,
    onEdit,
    onDelete,
    onView,
}: ColumnProps) {
    return (
        <div className="payment-accounts-column">
            <div className="payment-accounts-column-header">
                <h4>{title}</h4>
                <button type="button" className="btn-add" onClick={() => onAdd(accountType)}>
                    + Add
                </button>
            </div>
            {accounts.length === 0 ? (
                <p className="muted">No accounts yet.</p>
            ) : (
                <ul className="payment-accounts-list">
                    {accounts.map((account) => (
                        <li key={account.id} className="payment-account-card">
                            <button
                                type="button"
                                className="payment-account-card-main"
                                onClick={() => onView(account)}
                            >
                                <span className="payment-account-name">{account.name}</span>
                                {account.accountType === 'credit' ? (
                                    <div className="payment-account-stats">
                                        <span className="payment-account-stat">
                                            Limit {formatAmount(account.creditLimit ?? 0)}
                                        </span>
                                        <span className="payment-account-stat">
                                            Used {formatAmount(account.amountOwed ?? 0)}
                                        </span>
                                        <span
                                            className={`payment-account-stat payment-account-balance ${
                                                (account.availableCredit ?? 0) < 0
                                                    ? 'negative'
                                                    : 'positive'
                                            }`}
                                        >
                                            Avail {formatAmount(account.availableCredit ?? 0)}
                                        </span>
                                    </div>
                                ) : (
                                    <span
                                        className={`payment-account-balance ${
                                            (account.balance ?? 0) < 0 ? 'negative' : 'positive'
                                        }`}
                                    >
                                        {formatAmount(account.balance ?? 0)}
                                    </span>
                                )}
                            </button>
                            <RowActions
                                onEdit={() => onEdit(account)}
                                onDelete={() => onDelete(account)}
                                deleteLabel={`"${account.name}"`}
                            />
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default function PaymentAccountsPanel({ onChanged, formatAmount }: Props) {
    const { accounts, refresh } = usePaymentAccounts();
    const [modalMode, setModalMode] = useState<ModalMode>('closed');
    const [viewingAccount, setViewingAccount] = useState<PaymentAccount | null>(null);
    const [editingEntry, setEditingEntry] = useState<PaymentAccount | null>(null);
    const [form, setForm] = useState({
        name: '',
        accountType: 'account' as PaymentAccountType,
        initialBalance: '',
        creditLimit: '',
    });
    const [saving, setSaving] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const debitAccounts = useMemo(
        () => sortByName(accounts.filter((a) => a.accountType === 'account')),
        [accounts]
    );
    const creditAccounts = useMemo(
        () => sortByName(accounts.filter((a) => a.accountType === 'credit')),
        [accounts]
    );

    const handleChanged = async () => {
        await refresh();
        onChanged?.();
    };

    const openCreate = (accountType: PaymentAccountType) => {
        setModalMode('create');
        setEditingEntry(null);
        setForm({ name: '', accountType, initialBalance: '0', creditLimit: '' });
        setModalError(null);
    };

    const openEdit = (row: PaymentAccount) => {
        setModalMode('edit');
        setEditingEntry(row);
        setForm({
            name: row.name,
            accountType: row.accountType,
            initialBalance: String(row.initialBalance ?? 0),
            creditLimit: row.creditLimit != null ? String(row.creditLimit) : '',
        });
        setModalError(null);
    };

    const closeModal = () => {
        setModalMode('closed');
        setEditingEntry(null);
        setModalError(null);
    };

    const parseNonNegative = (value: string): number | 'invalid' => {
        const trimmed = value.trim();
        if (!trimmed) return 0;
        const n = parseFloat(trimmed);
        if (!Number.isFinite(n) || n < 0) return 'invalid';
        return n;
    };

    const handleSave = async () => {
        if (!form.name.trim()) {
            setModalError('Account name is required.');
            return;
        }
        setSaving(true);
        setModalError(null);
        try {
            const payload: {
                name: string;
                accountType: PaymentAccountType;
                initialBalance?: number;
                creditLimit?: number;
            } = {
                name: form.name.trim(),
                accountType: form.accountType,
            };

            if (form.accountType === 'credit') {
                const limit = parseNonNegative(form.creditLimit);
                if (limit === 'invalid') {
                    setModalError('Credit limit must be a non-negative number.');
                    setSaving(false);
                    return;
                }
                payload.creditLimit = limit;
            } else {
                const initial = parseNonNegative(form.initialBalance);
                if (initial === 'invalid') {
                    setModalError('Initial balance must be a non-negative number.');
                    setSaving(false);
                    return;
                }
                payload.initialBalance = initial;
            }

            if (modalMode === 'create') {
                await createPaymentAccount(payload);
            } else if (editingEntry) {
                await updatePaymentAccount(editingEntry.id, payload);
            }
            closeModal();
            await handleChanged();
        } catch (err) {
            setModalError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (row: PaymentAccount) => {
        setActionError(null);
        try {
            await deletePaymentAccount(row.id);
            await handleChanged();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to delete');
        }
    };

    return (
        <div className="income-section-card payment-accounts-panel">
            <h3>Payment accounts</h3>
            {actionError && <p className="error">{actionError}</p>}
            <div className="payment-accounts-split">
                <PaymentAccountColumn
                    title="Accounts"
                    accountType="account"
                    accounts={debitAccounts}
                    formatAmount={formatAmount}
                    onAdd={openCreate}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    onView={setViewingAccount}
                />
                <PaymentAccountColumn
                    title="Credit accounts"
                    accountType="credit"
                    accounts={creditAccounts}
                    formatAmount={formatAmount}
                    onAdd={openCreate}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    onView={setViewingAccount}
                />
            </div>
            <RecordModal
                title={modalMode === 'create' ? 'Add payment account' : 'Edit payment account'}
                open={modalMode !== 'closed'}
                saving={saving}
                error={modalError}
                onClose={closeModal}
                onSave={handleSave}
            >
                <div className="form-field">
                    <label htmlFor="pa-name">Name</label>
                    <input
                        id="pa-name"
                        type="text"
                        placeholder="e.g. TnG, CIMB Visa"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />
                </div>
                {form.accountType === 'account' ? (
                    <div className="form-field">
                        <label htmlFor="pa-initial">Current balance (RM)</label>
                        <input
                            id="pa-initial"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={form.initialBalance}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, initialBalance: e.target.value }))
                            }
                        />
                        <span className="muted form-hint">
                            Saving this value resets the account balance baseline to today.
                        </span>
                    </div>
                ) : (
                    <div className="form-field">
                        <label htmlFor="pa-limit">Credit limit (RM)</label>
                        <input
                            id="pa-limit"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="e.g. 5000"
                            value={form.creditLimit}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, creditLimit: e.target.value }))
                            }
                        />
                    </div>
                )}
                {modalMode === 'edit' && (
                    <div className="form-field">
                        <label htmlFor="pa-type">Type</label>
                        <select
                            id="pa-type"
                            value={form.accountType}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    accountType: e.target.value as PaymentAccountType,
                                }))
                            }
                        >
                            <option value="account">Account</option>
                            <option value="credit">Credit</option>
                        </select>
                    </div>
                )}
            </RecordModal>
            <AccountActivityModal
                account={viewingAccount}
                formatAmount={formatAmount}
                onClose={() => setViewingAccount(null)}
            />
        </div>
    );
}
