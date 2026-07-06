import { useMemo, useState } from 'react';

import type { PaymentAccount, PaymentAccountType } from '../api';
import {
    createPaymentAccount,
    deletePaymentAccount,
    updatePaymentAccount,
} from '../api';
import { usePaymentAccounts } from '../hooks/usePaymentAccounts';
import RecordModal from './RecordModal';
import RowActions from './RowActions';

type ModalMode = 'closed' | 'create' | 'edit';

interface Props {
    onChanged?: () => void;
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
    onAdd: (accountType: PaymentAccountType) => void;
    onEdit: (account: PaymentAccount) => void;
    onDelete: (account: PaymentAccount) => void;
}

function PaymentAccountColumn({
    title,
    accountType,
    accounts,
    onAdd,
    onEdit,
    onDelete,
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
                        <li key={account.id} className="payment-account-item">
                            <span className="payment-account-name">{account.name}</span>
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

export default function PaymentAccountsPanel({ onChanged }: Props) {
    const { accounts, refresh } = usePaymentAccounts();
    const [modalMode, setModalMode] = useState<ModalMode>('closed');
    const [editingEntry, setEditingEntry] = useState<PaymentAccount | null>(null);
    const [form, setForm] = useState({ name: '', accountType: 'account' as PaymentAccountType });
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
        setForm({ name: '', accountType });
        setModalError(null);
    };

    const openEdit = (row: PaymentAccount) => {
        setModalMode('edit');
        setEditingEntry(row);
        setForm({ name: row.name, accountType: row.accountType });
        setModalError(null);
    };

    const closeModal = () => {
        setModalMode('closed');
        setEditingEntry(null);
        setModalError(null);
    };

    const handleSave = async () => {
        if (!form.name.trim()) {
            setModalError('Account name is required.');
            return;
        }
        setSaving(true);
        setModalError(null);
        try {
            const payload = {
                name: form.name.trim(),
                accountType: form.accountType,
            };
            if (modalMode === 'create') {
                await createPaymentAccount(payload);
            } else if (editingEntry) {
                await updatePaymentAccount(editingEntry.id, {
                    name: payload.name,
                    accountType: payload.accountType,
                });
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
                    onAdd={openCreate}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                />
                <PaymentAccountColumn
                    title="Credit accounts"
                    accountType="credit"
                    accounts={creditAccounts}
                    onAdd={openCreate}
                    onEdit={openEdit}
                    onDelete={handleDelete}
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
        </div>
    );
}
