import { useEffect, useMemo, useState } from 'react';

import type { PaymentAccount, PaymentAccountType, RebateConfig } from '../api';
import {
    createPaymentAccount,
    deletePaymentAccount,
    fetchExpenseOverview,
    updatePaymentAccount,
} from '../api';
import {
    buildRebateConfig,
    emptyRebateForm,
    rebateFormFromConfig,
    type RebateFormState,
} from '../utils/rebateForm';
import { usePaymentAccounts } from '../hooks/usePaymentAccounts';
import AccountActivityModal from './AccountActivityModal';
import CreditAccountForm, { type CreditSettingsTab } from './CreditAccountForm';
import RecordModal from './RecordModal';
import RowActions from './RowActions';

const DEFAULT_EXPENSE_CATEGORIES = [
    'Drink',
    'Entertainment',
    'Food',
    'Shopping',
    'Transport',
    'Loan',
    'Investment',
    'Insurance',
    'Utility',
    'Other',
];

type ModalMode = 'closed' | 'create' | 'edit';

interface Props {
    month: string;
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

export default function PaymentAccountsPanel({ month, onChanged, formatAmount }: Props) {
    const { accounts, refresh } = usePaymentAccounts();
    const [modalMode, setModalMode] = useState<ModalMode>('closed');
    const [viewingAccount, setViewingAccount] = useState<PaymentAccount | null>(null);
    const [editingEntry, setEditingEntry] = useState<PaymentAccount | null>(null);
    const [form, setForm] = useState({
        name: '',
        accountType: 'account' as PaymentAccountType,
        initialBalance: '',
        creditLimit: '',
        statementDay: '',
    });
    const [saving, setSaving] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    /** Live balance shown when edit opened; used to avoid resetting baseline on name-only saves. */
    const [openedBalance, setOpenedBalance] = useState<number | null>(null);
    const [rebateForm, setRebateForm] = useState<RebateFormState>(emptyRebateForm);
    const [creditTab, setCreditTab] = useState<CreditSettingsTab>('account');
    const [expenseCategories, setExpenseCategories] = useState<string[]>(DEFAULT_EXPENSE_CATEGORIES);

    useEffect(() => {
        fetchExpenseOverview(month)
            .then((res) => {
                const cats = res.variable.map((v) => v.category);
                if (cats.length > 0) setExpenseCategories(cats);
            })
            .catch(() => {
                /* keep defaults */
            });
    }, [month]);

    const debitAccounts = useMemo(
        () => sortByName(accounts.filter((a) => a.accountType === 'account')),
        [accounts]
    );
    const creditAccounts = useMemo(
        () => sortByName(accounts.filter((a) => a.accountType === 'credit')),
        [accounts]
    );
    const investmentAccounts = useMemo(
        () => sortByName(accounts.filter((a) => a.accountType === 'investment')),
        [accounts]
    );

    const handleChanged = async () => {
        await refresh();
        onChanged?.();
    };

    const openCreate = (accountType: PaymentAccountType) => {
        setModalMode('create');
        setEditingEntry(null);
        setOpenedBalance(null);
        setForm({ name: '', accountType, initialBalance: '0', creditLimit: '', statementDay: '' });
        setRebateForm(emptyRebateForm());
        setCreditTab('account');
        setModalError(null);
    };

    const openEdit = (row: PaymentAccount) => {
        setModalMode('edit');
        setEditingEntry(row);
        if (row.accountType === 'credit') {
            setOpenedBalance(null);
            setForm({
                name: row.name,
                accountType: row.accountType,
                initialBalance: '0',
                creditLimit: row.creditLimit != null ? row.creditLimit.toFixed(2) : '',
                statementDay: row.statementDay != null ? String(row.statementDay) : '',
            });
        } else {
            const liveValue = row.balance ?? row.initialBalance ?? 0;
            setOpenedBalance(liveValue);
            setForm({
                name: row.name,
                accountType: row.accountType,
                initialBalance: liveValue.toFixed(2),
                creditLimit: '',
                statementDay: '',
            });
        }
        setRebateForm(rebateFormFromConfig(row.rebateConfig));
        setCreditTab('account');
        setModalError(null);
    };

    const closeModal = () => {
        setModalMode('closed');
        setEditingEntry(null);
        setOpenedBalance(null);
        setModalError(null);
        setCreditTab('account');
        setRebateForm(emptyRebateForm());
    };

    const parseNonNegative = (value: string): number | 'invalid' => {
        const trimmed = value.trim();
        if (!trimmed) return 0;
        const n = parseFloat(trimmed);
        if (!Number.isFinite(n) || n < 0) return 'invalid';
        return Math.round(n * 100) / 100;
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
                statementDay?: number | null;
                rebateConfig?: RebateConfig | null;
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

                const statementDayRaw = form.statementDay.trim();
                if (statementDayRaw) {
                    const day = parseInt(statementDayRaw, 10);
                    if (!Number.isInteger(day) || day < 1 || day > 31) {
                        setModalError('Statement day must be an integer from 1 to 31.');
                        setSaving(false);
                        return;
                    }
                    payload.statementDay = day;
                } else if (modalMode === 'edit') {
                    payload.statementDay = null;
                }

                const rebateConfig = buildRebateConfig(rebateForm);
                if (rebateForm.enabled && !rebateConfig) {
                    setModalError('Invalid cashback settings.');
                    setSaving(false);
                    return;
                }
                payload.rebateConfig = rebateConfig;
            } else {
                const balanceValue = parseNonNegative(form.initialBalance);
                if (balanceValue === 'invalid') {
                    setModalError('Current balance must be a non-negative number.');
                    setSaving(false);
                    return;
                }
                const balanceChanged =
                    modalMode === 'create' ||
                    openedBalance == null ||
                    Math.round(balanceValue * 100) !== Math.round(openedBalance * 100);
                if (balanceChanged) {
                    payload.initialBalance = balanceValue;
                }
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
                <PaymentAccountColumn
                    title="Investments"
                    accountType="investment"
                    accounts={investmentAccounts}
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
                className={form.accountType === 'credit' ? 'payment-account-modal' : undefined}
            >
                {form.accountType === 'credit' ? (
                    <CreditAccountForm
                        form={form}
                        setForm={setForm}
                        rebateForm={rebateForm}
                        setRebateForm={setRebateForm}
                        creditTab={creditTab}
                        setCreditTab={setCreditTab}
                        expenseCategories={expenseCategories}
                        modalMode={modalMode === 'edit' ? 'edit' : 'create'}
                    />
                ) : (
                    <>
                        <div className="form-field">
                            <label htmlFor="pa-name">Name</label>
                            <input
                                id="pa-name"
                                type="text"
                                placeholder={
                                    form.accountType === 'investment'
                                        ? 'e.g. EPF, ASB, Brokerage'
                                        : 'e.g. TnG, CIMB Visa'
                                }
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                            />
                        </div>
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
                                    <option value="investment">Investment</option>
                                </select>
                            </div>
                        )}
                    </>
                )}
            </RecordModal>
            <AccountActivityModal
                account={viewingAccount}
                month={month}
                formatAmount={formatAmount}
                onClose={() => setViewingAccount(null)}
            />
        </div>
    );
}
