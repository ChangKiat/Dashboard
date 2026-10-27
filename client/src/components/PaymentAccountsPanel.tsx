import { useEffect, useMemo, useRef, useState } from 'react';

import type { AccountBalanceHistory, PaymentAccount, PaymentAccountType, RebateConfig } from '../api';
import {
    createPaymentAccount,
    deletePaymentAccount,
    fetchAccountHistory,
    fetchExpenseOverview,
    updatePaymentAccount,
} from '../api';
import Sparkline from '../charts/Sparkline';
import { useAmountVisibility } from '../hooks/useAmountVisibility';
import {
    buildRebateConfig,
    emptyRebateForm,
    rebateFormFromConfig,
    type RebateFormState,
} from '../utils/rebateForm';
import { addDays, dailyValues } from '../utils/accountHistory';
import { todayInKL } from '../utils/dateRange';
import { formatCompactMYR } from '../utils/money';
import { usePaymentAccounts } from '../hooks/usePaymentAccounts';
import AccountActivityModal from './AccountActivityModal';
import AccountDetailPanel, { accountTypeLabel } from './AccountDetailPanel';
import AccountIcon from './AccountIcon';
import CreditAccountForm, { type CreditSettingsTab } from './CreditAccountForm';
import PortfolioModal from './PortfolioModal';
import RecordModal from './RecordModal';
import SummaryCard from './SummaryCard';
import { BankIcon, CardIcon, TrendUpIcon } from './icons';

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
    /** Month an account's activity opens on; also loads the categories for credit card rebates. */
    month: string;
    onChanged?: () => void;
    formatAmount: (amount: number) => string;
}

function sortByName(accounts: PaymentAccount[]) {
    return [...accounts].sort((a, b) =>
        a.name.localeCompare(b.name, 'en-MY', { sensitivity: 'base' })
    );
}

const SPARKLINE_DAYS = 90;

function plural(count: number, word: string) {
    return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** What a row shows: balance, amount owed on a card, or an investment's value. */
function rowAmount(account: PaymentAccount): number {
    if (account.accountType === 'credit') return account.amountOwed ?? 0;
    if (account.accountType === 'investment') return account.nav ?? account.balance ?? 0;
    return account.balance ?? 0;
}

/** The last 90 days, through any future-dated entry, so the dot matches the amount beside it. */
function sparklineValues(history: AccountBalanceHistory | undefined, today: string): number[] | null {
    if (!history || history.points.length === 0) return null;
    const lastPoint = history.points[history.points.length - 1].date;
    const end = lastPoint > today ? lastPoint : today;
    return dailyValues(history.points, addDays(end, 1 - SPARKLINE_DAYS), end).map((p) => p.value);
}

interface GroupProps {
    title: string;
    accountType: PaymentAccountType;
    accounts: PaymentAccount[];
    history: Map<number, AccountBalanceHistory>;
    selectedId: number | null;
    formatAmount: (amount: number) => string;
    onAdd: (accountType: PaymentAccountType) => void;
    onSelect: (account: PaymentAccount) => void;
}

function AccountGroup({
    title,
    accountType,
    accounts,
    history,
    selectedId,
    formatAmount,
    onAdd,
    onSelect,
}: GroupProps) {
    const today = todayInKL();
    const isCredit = accountType === 'credit';
    const total = accounts.reduce((sum, account) => sum + rowAmount(account), 0);

    return (
        <section className="card account-group" aria-label={title}>
            <div className="account-group-header">
                <h3>{title}</h3>
                <span className="account-group-total">
                    {formatAmount(total)}
                    {isCredit && <small> owed</small>}
                </span>
                <button type="button" className="btn-add" onClick={() => onAdd(accountType)}>
                    + Add
                </button>
            </div>
            {accounts.length === 0 ? (
                <p className="muted">No accounts yet.</p>
            ) : (
                <ul className="account-rows">
                    {accounts.map((account) => {
                        const amount = rowAmount(account);
                        const spark = sparklineValues(history.get(account.id), today);
                        const gain = account.unrealizedGain ?? 0;
                        const selected = account.id === selectedId;
                        return (
                            <li key={account.id}>
                                <button
                                    type="button"
                                    className={`account-row${selected ? ' selected' : ''}`}
                                    aria-pressed={selected}
                                    onClick={() => onSelect(account)}
                                >
                                    <AccountIcon name={account.name} accountType={account.accountType} />
                                    <span className="account-row-name">
                                        <strong>{account.name}</strong>
                                        <span>{accountTypeLabel(account)}</span>
                                    </span>
                                    {spark ? (
                                        <Sparkline values={spark} tone={isCredit ? 'owed' : 'balance'} />
                                    ) : (
                                        <span className="sparkline" aria-hidden="true" />
                                    )}
                                    <span
                                        className={`account-row-amount${
                                            !isCredit && amount < 0 ? ' negative' : ''
                                        }`}
                                    >
                                        {formatAmount(amount)}
                                        {isCredit && <small>owed</small>}
                                        {accountType === 'investment' && (
                                            <small className={gain < 0 ? 'account-activity-out' : 'account-activity-in'}>
                                                {gain < 0 ? '−' : '+'}
                                                {formatAmount(Math.abs(gain))}
                                            </small>
                                        )}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

/**
 * Accounts grouped by type with totals and a 90-day trend; the picked one shows its balance over
 * time and every transaction. Add, edit and delete live here too.
 */
export default function PaymentAccountsPanel({ month, onChanged, formatAmount }: Props) {
    const { accounts, loading: accountsLoading, refresh } = usePaymentAccounts();
    const { hidden } = useAmountVisibility();
    const [history, setHistory] = useState<Map<number, AccountBalanceHistory>>(new Map());
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const detailRef = useRef<HTMLDivElement>(null);
    const [modalMode, setModalMode] = useState<ModalMode>('closed');
    const [viewingAccount, setViewingAccount] = useState<PaymentAccount | null>(null);
    const [portfolioAccount, setPortfolioAccount] = useState<PaymentAccount | null>(null);
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

    // Reloads whenever the accounts do (after a save, or the header's Refresh).
    useEffect(() => {
        if (accounts.length === 0) return;
        let cancelled = false;
        fetchAccountHistory()
            .then((res) => {
                if (!cancelled) setHistory(new Map(res.entries.map((h) => [h.id, h])));
            })
            .catch(() => {
                /* rows still show, just without trend lines */
            });
        return () => {
            cancelled = true;
        };
    }, [accounts]);

    const ordered = [...debitAccounts, ...creditAccounts, ...investmentAccounts];
    const selected = ordered.find((a) => a.id === selectedId) ?? ordered[0] ?? null;

    const totals = useMemo(() => {
        let assets = 0;
        let owed = 0;
        let available = 0;
        for (const account of accounts) {
            if (account.accountType === 'credit') {
                owed += account.amountOwed ?? 0;
                available += account.availableCredit ?? 0;
            } else {
                assets += rowAmount(account);
            }
        }
        return { assets, owed, available, net: assets - owed };
    }, [accounts]);

    const formatAxis = (value: number) => (hidden ? '••' : formatCompactMYR(value));

    const selectAccount = (account: PaymentAccount) => {
        setSelectedId(account.id);
        // One column on narrower screens: bring the details into view.
        if (window.matchMedia('(max-width: 1279px)').matches) {
            requestAnimationFrame(() =>
                detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            );
        }
    };

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

    const loadingFirstTime = accountsLoading && accounts.length === 0;
    const groupProps = {
        history,
        selectedId: selected?.id ?? null,
        formatAmount,
        onAdd: openCreate,
        onSelect: selectAccount,
    };

    return (
        <div className="accounts-page">
            {actionError && <p className="error">{actionError}</p>}
            <div className="accounts-summary-grid">
                <SummaryCard
                    tone="income"
                    icon={<BankIcon size={26} />}
                    label="Assets"
                    value={loadingFirstTime ? '…' : formatAmount(totals.assets)}
                    sub={`${plural(debitAccounts.length, 'account')} and ${plural(
                        investmentAccounts.length,
                        'investment'
                    )}`}
                />
                <SummaryCard
                    tone="spend"
                    icon={<CardIcon size={26} />}
                    label="Owed on cards"
                    value={loadingFirstTime ? '…' : formatAmount(totals.owed)}
                    sub={`${plural(creditAccounts.length, 'credit card')} · ${formatAmount(
                        totals.available
                    )} available`}
                />
                <SummaryCard
                    tone="net"
                    icon={<TrendUpIcon size={26} />}
                    label="Net worth"
                    value={loadingFirstTime ? '…' : formatAmount(totals.net)}
                    variant={totals.net < 0 ? 'danger' : 'default'}
                    sub="What you have, minus what you owe on cards"
                />
            </div>

            <div className="accounts-layout">
                <div className="accounts-groups">
                    <AccountGroup title="Accounts" accountType="account" accounts={debitAccounts} {...groupProps} />
                    <AccountGroup
                        title="Credit cards"
                        accountType="credit"
                        accounts={creditAccounts}
                        {...groupProps}
                    />
                    <AccountGroup
                        title="Investments"
                        accountType="investment"
                        accounts={investmentAccounts}
                        {...groupProps}
                    />
                </div>
                {selected ? (
                    <AccountDetailPanel
                        ref={detailRef}
                        account={selected}
                        history={history.get(selected.id)}
                        formatAmount={formatAmount}
                        formatAxis={formatAxis}
                        onEdit={() => openEdit(selected)}
                        onDelete={() => void handleDelete(selected)}
                        onOpenStatement={() => setViewingAccount(selected)}
                        onOpenPortfolio={() => setPortfolioAccount(selected)}
                    />
                ) : (
                    <section className="card account-detail">
                        <p className="muted">
                            {loadingFirstTime ? 'Loading accounts…' : 'Add an account to see its balance and activity here.'}
                        </p>
                    </section>
                )}
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
                                        ? 'e.g. Rakuten, EPF'
                                        : 'e.g. TnG, CIMB Visa'
                                }
                                value={form.name}
                                onChange={(e) =>
                                    setForm((f) => ({ ...f, name: e.target.value }))
                                }
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
            <PortfolioModal
                account={portfolioAccount}
                formatAmount={formatAmount}
                onClose={() => setPortfolioAccount(null)}
                onChanged={handleChanged}
                onOpenCashActivity={(acc) => {
                    setPortfolioAccount(null);
                    setViewingAccount(acc);
                }}
            />
            <AccountActivityModal
                account={viewingAccount}
                month={month}
                formatAmount={formatAmount}
                onClose={() => setViewingAccount(null)}
                onChanged={handleChanged}
            />
        </div>
    );
}
