import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AccountActivityEntry, HoldingPosition, PaymentAccount } from '../api';
import {
    accrueFdInterest,
    createInstrument,
    deleteInstrument,
    fetchAccountActivity,
    fetchPortfolio,
} from '../api';
import { usePagination } from '../hooks/usePagination';
import {
    accountPeriodToDateRange,
    formatPeriodLabel,
    isDateInRange,
} from '../utils/statementPeriod';
import ConfirmDialog from './ConfirmDialog';
import RebateSummary from './RebateSummary';
import TablePagination from './TablePagination';

interface Props {
    account: PaymentAccount | null;
    month: string;
    formatAmount: (amount: number) => string;
    onClose: () => void;
    onChanged?: () => void;
}

type ActivityTab = 'activity' | 'cashback' | 'fd';

function today(): string {
    const t = new Date();
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, '0');
    const d = String(t.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function tenureLabel(start: string | null, maturity: string | null): string {
    if (!maturity) return start ? `From ${start}` : '';
    if (!start) return `Matures ${maturity}`;
    const [sy, sm] = start.split('-').map(Number);
    const [ey, em] = maturity.split('-').map(Number);
    const months = (ey - sy) * 12 + (em - sm);
    if (!Number.isFinite(months) || months <= 0) return `Matures ${maturity}`;
    return `${months} mo · matures ${maturity}`;
}

function formatTypeLabel(type: AccountActivityEntry['type']): string {
    switch (type) {
        case 'expense':
            return 'Expense';
        case 'income':
            return 'Income';
        case 'transfer_in':
            return 'Transfer in';
        case 'transfer_out':
            return 'Transfer out';
    }
}

function entryMatchesQuery(entry: AccountActivityEntry, query: string): boolean {
    if (entry.description.toLowerCase().includes(query)) return true;
    if (entry.category.toLowerCase().includes(query)) return true;
    if (String(entry.amount).includes(query)) return true;
    if (entry.amount.toFixed(2).includes(query)) return true;
    return false;
}

const emptyFdForm = () => ({
    name: '',
    principal: '',
    annualRatePct: '',
    tenureMonths: '',
    startDate: today(),
});

export default function AccountActivityModal({
    account,
    month,
    formatAmount,
    onClose,
    onChanged,
}: Props) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [accountData, setAccountData] = useState<PaymentAccount | null>(null);
    const [entries, setEntries] = useState<AccountActivityEntry[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<ActivityTab>('activity');
    const [fdHoldings, setFdHoldings] = useState<HoldingPosition[]>([]);
    const [fdForm, setFdForm] = useState(emptyFdForm);
    const [fdSaving, setFdSaving] = useState(false);
    const [fdError, setFdError] = useState<string | null>(null);
    const [closingFd, setClosingFd] = useState<HoldingPosition | null>(null);

    const fdEnabled = account?.accountType === 'account';

    const reload = useCallback(async () => {
        if (!account) return;
        const [activity, portfolio] = await Promise.all([
            fetchAccountActivity(account.id),
            fdEnabled ? fetchPortfolio(account.id).catch(() => null) : Promise.resolve(null),
        ]);
        setAccountData(activity.account);
        setEntries(activity.entries);
        setFdHoldings(
            portfolio?.holdings.filter((h) => h.instrument.kind === 'fd') ?? []
        );
    }, [account, fdEnabled]);

    useEffect(() => {
        if (!account) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        setSearchQuery('');
        setActiveTab('activity');
        setFdForm(emptyFdForm());
        setFdError(null);
        setClosingFd(null);
        reload()
            .catch((err) => {
                if (cancelled) return;
                setError(err instanceof Error ? err.message : 'Failed to load activity');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [account, reload]);

    const periodAccount = accountData ?? account;
    const rebateEnabled =
        accountData?.accountType === 'credit' && accountData.rebateConfig?.enabled === true;
    const showTabs = rebateEnabled || fdEnabled;

    const periodRange = useMemo(() => {
        if (!periodAccount || !month) return null;
        return accountPeriodToDateRange(periodAccount, month);
    }, [periodAccount, month]);

    const periodEntries = useMemo(() => {
        if (!periodRange) return entries;
        return entries.filter((entry) => isDateInRange(entry.date, periodRange));
    }, [entries, periodRange]);

    const periodTotals = useMemo(() => {
        let totalOut = 0;
        let totalIn = 0;
        for (const entry of periodEntries) {
            if (entry.direction === 'out') totalOut += entry.amount;
            else totalIn += entry.amount;
        }
        return { totalOut, totalIn, net: totalIn - totalOut };
    }, [periodEntries]);

    const hasPreBaseline = useMemo(
        () => periodEntries.some((entry) => entry.beforeBaseline),
        [periodEntries]
    );

    const filteredEntries = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return periodEntries;
        return periodEntries.filter((entry) => entryMatchesQuery(entry, q));
    }, [periodEntries, searchQuery]);

    const { page, setPage, pageItems, totalPages, totalItems } = usePagination(filteredEntries, {
        pageSize: 8,
    });

    useEffect(() => {
        setPage(1);
    }, [month, searchQuery, setPage]);

    const handleAllocateFd = async () => {
        if (!account) return;
        const principal = parseFloat(fdForm.principal);
        const rate = parseFloat(fdForm.annualRatePct);
        const tenureMonths = parseInt(fdForm.tenureMonths, 10);
        if (!Number.isFinite(principal) || principal <= 0) {
            setFdError('Amount must be positive.');
            return;
        }
        if (!Number.isFinite(rate) || rate < 0) {
            setFdError('Annual rate is required.');
            return;
        }
        if (!Number.isInteger(tenureMonths) || tenureMonths <= 0) {
            setFdError('Tenure months must be a positive integer.');
            return;
        }
        if (!fdForm.startDate) {
            setFdError('Start date is required.');
            return;
        }
        setFdSaving(true);
        setFdError(null);
        try {
            await createInstrument({
                paymentAccountId: account.id,
                kind: 'fd',
                name: fdForm.name.trim() || `${account.name} FD`,
                principal,
                annualRatePct: rate,
                startDate: fdForm.startDate,
                tenureMonths,
            });
            setFdForm(emptyFdForm());
            await reload();
            onChanged?.();
        } catch (err) {
            setFdError(err instanceof Error ? err.message : 'Failed to allocate FD');
        } finally {
            setFdSaving(false);
        }
    };

    const handleAccrueFd = async (holding: HoldingPosition) => {
        setFdError(null);
        try {
            await accrueFdInterest(holding.instrument.id, { toDate: today() });
            await reload();
            onChanged?.();
        } catch (err) {
            setFdError(err instanceof Error ? err.message : 'Failed to accrue interest');
        }
    };

    const handleCloseFd = async () => {
        if (!closingFd) return;
        setFdError(null);
        try {
            await deleteInstrument(closingFd.instrument.id);
            setClosingFd(null);
            await reload();
            onChanged?.();
        } catch (err) {
            setFdError(err instanceof Error ? err.message : 'Failed to close FD');
            setClosingFd(null);
        }
    };

    if (!account) return null;

    const showActivityContent = (!showTabs || activeTab === 'activity');
    const fdLocked = accountData?.fdLocked ?? 0;
    const available = accountData?.available ?? (accountData?.balance ?? 0) - fdLocked;

    return (
        <div className="record-modal-backdrop" onClick={onClose}>
            <div className="record-modal account-activity-modal" onClick={(e) => e.stopPropagation()}>
                <div className="account-activity-header">
                    <div className="account-activity-header-top">
                        <h4>{account.name}</h4>
                        {showTabs && (
                            <div className="account-activity-tabs">
                                <button
                                    type="button"
                                    className={`section-tab${activeTab === 'activity' ? ' active' : ''}`}
                                    onClick={() => setActiveTab('activity')}
                                >
                                    Activity
                                </button>
                                {fdEnabled && (
                                    <button
                                        type="button"
                                        className={`section-tab${activeTab === 'fd' ? ' active' : ''}`}
                                        onClick={() => setActiveTab('fd')}
                                    >
                                        FD
                                    </button>
                                )}
                                {rebateEnabled && (
                                    <button
                                        type="button"
                                        className={`section-tab${activeTab === 'cashback' ? ' active' : ''}`}
                                        onClick={() => setActiveTab('cashback')}
                                    >
                                        Cashback
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                    {accountData && (
                        <div className="account-activity-summary">
                            {accountData.accountType === 'credit' ? (
                                <>
                                    <span>Limit {formatAmount(accountData.creditLimit ?? 0)}</span>
                                    <span className="account-activity-sep">·</span>
                                    <span>Used {formatAmount(accountData.amountOwed ?? 0)}</span>
                                    <span className="account-activity-sep">·</span>
                                    <span
                                        className={
                                            (accountData.availableCredit ?? 0) < 0
                                                ? 'account-balance-negative'
                                                : 'account-balance-positive'
                                        }
                                    >
                                        Avail {formatAmount(accountData.availableCredit ?? 0)}
                                    </span>
                                </>
                            ) : (
                                <>
                                    <span
                                        className={
                                            (accountData.balance ?? 0) < 0
                                                ? 'account-balance-negative'
                                                : 'account-balance-positive'
                                        }
                                    >
                                        Balance {formatAmount(accountData.balance ?? 0)}
                                    </span>
                                    {fdLocked > 0 && (
                                        <>
                                            <span className="account-activity-sep">·</span>
                                            <span
                                                className={
                                                    available < 0
                                                        ? 'account-balance-negative'
                                                        : 'account-balance-positive'
                                                }
                                            >
                                                Avail {formatAmount(available)}
                                            </span>
                                            <span className="account-activity-sep">·</span>
                                            <span>FD {formatAmount(fdLocked)}</span>
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                    {periodAccount && month && showActivityContent && (
                        <p className="account-activity-period-range">
                            {formatPeriodLabel(periodAccount, month)}
                        </p>
                    )}
                </div>
                {showActivityContent && !loading && !error && periodEntries.length > 0 && (
                    <div className="account-activity-period-summary">
                        <span>
                            Charges: <strong>{formatAmount(periodTotals.totalOut)}</strong>
                        </span>
                        <span>
                            Credits: <strong>{formatAmount(periodTotals.totalIn)}</strong>
                        </span>
                        <span>
                            Net:{' '}
                            <strong
                                className={
                                    periodTotals.net >= 0
                                        ? 'account-activity-in'
                                        : 'account-activity-out'
                                }
                            >
                                {periodTotals.net >= 0 ? '+' : '−'}
                                {formatAmount(Math.abs(periodTotals.net))}
                            </strong>
                        </span>
                    </div>
                )}
                {showActivityContent &&
                    hasPreBaseline &&
                    accountData &&
                    accountData.accountType !== 'credit' && (
                        <p className="muted account-activity-baseline-note">
                            Older transactions shown for history; balance starts from{' '}
                            {accountData.balanceBaselineDate}.
                        </p>
                    )}
                <div className="record-modal-body account-activity-body">
                    {loading && <p className="muted">Loading activity…</p>}
                    {error && <p className="error">{error}</p>}
                    {!loading && !error && rebateEnabled && activeTab === 'cashback' && (
                        <RebateSummary
                            accountId={accountData!.id}
                            month={month}
                            formatAmount={formatAmount}
                        />
                    )}
                    {!loading && !error && fdEnabled && activeTab === 'fd' && (
                        <div className="account-fd-panel">
                            <p className="muted account-fd-avail">
                                Available to lock {formatAmount(available)}
                            </p>
                            <div className="account-fd-form">
                                <div className="form-field">
                                    <label htmlFor="fd-amount">Amount (RM)</label>
                                    <input
                                        id="fd-amount"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={fdForm.principal}
                                        onChange={(e) =>
                                            setFdForm((f) => ({ ...f, principal: e.target.value }))
                                        }
                                    />
                                </div>
                                <div className="form-field">
                                    <label htmlFor="fd-rate">Annual rate (%)</label>
                                    <input
                                        id="fd-rate"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={fdForm.annualRatePct}
                                        onChange={(e) =>
                                            setFdForm((f) => ({ ...f, annualRatePct: e.target.value }))
                                        }
                                    />
                                </div>
                                <div className="form-field">
                                    <label htmlFor="fd-months">Months</label>
                                    <input
                                        id="fd-months"
                                        type="number"
                                        min="1"
                                        step="1"
                                        value={fdForm.tenureMonths}
                                        onChange={(e) =>
                                            setFdForm((f) => ({ ...f, tenureMonths: e.target.value }))
                                        }
                                    />
                                </div>
                                <div className="form-field">
                                    <label htmlFor="fd-start">Start date</label>
                                    <input
                                        id="fd-start"
                                        type="date"
                                        value={fdForm.startDate}
                                        onChange={(e) =>
                                            setFdForm((f) => ({ ...f, startDate: e.target.value }))
                                        }
                                    />
                                </div>
                                <div className="form-field">
                                    <label htmlFor="fd-name">Name (optional)</label>
                                    <input
                                        id="fd-name"
                                        type="text"
                                        placeholder={`${account.name} FD`}
                                        value={fdForm.name}
                                        onChange={(e) =>
                                            setFdForm((f) => ({ ...f, name: e.target.value }))
                                        }
                                    />
                                </div>
                            </div>
                            {fdError && <p className="error">{fdError}</p>}
                            <button
                                type="button"
                                className="btn-primary"
                                disabled={fdSaving}
                                onClick={() => void handleAllocateFd()}
                            >
                                {fdSaving ? 'Allocating…' : 'Allocate FD'}
                            </button>
                            {fdHoldings.length === 0 ? (
                                <p className="muted">No FDs on this account yet.</p>
                            ) : (
                                <table className="data-table account-fd-table">
                                    <thead>
                                        <tr>
                                            <th>FD</th>
                                            <th className="num">Principal</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {fdHoldings.map((holding) => {
                                            const inst = holding.instrument;
                                            return (
                                                <tr key={inst.id}>
                                                    <td>
                                                        <div className="portfolio-instrument-name">
                                                            {inst.name}
                                                        </div>
                                                        <div className="muted portfolio-instrument-meta">
                                                            {inst.annualRatePct != null
                                                                ? `${inst.annualRatePct}% p.a.`
                                                                : ''}
                                                            {inst.annualRatePct != null ? ' · ' : ''}
                                                            {tenureLabel(inst.startDate, inst.maturityDate)}
                                                        </div>
                                                    </td>
                                                    <td className="num">
                                                        {formatAmount(inst.principal ?? 0)}
                                                    </td>
                                                    <td>
                                                        <div className="portfolio-row-actions">
                                                            <button
                                                                type="button"
                                                                className="btn-link"
                                                                onClick={() =>
                                                                    void handleAccrueFd(holding)
                                                                }
                                                            >
                                                                Accrue
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="btn-link"
                                                                onClick={() => setClosingFd(holding)}
                                                            >
                                                                Close
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                    {showActivityContent && !loading && !error && entries.length === 0 && (
                        <p className="muted">No transactions linked to this account yet.</p>
                    )}
                    {showActivityContent && !loading && !error && entries.length > 0 && periodEntries.length === 0 && (
                        <p className="muted">No transactions in this period.</p>
                    )}
                    {showActivityContent && !loading && !error && periodEntries.length > 0 && (
                        <>
                            <div className="category-detail-search">
                                <input
                                    type="search"
                                    placeholder="Search description or amount…"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    aria-label="Search transactions"
                                />
                            </div>
                            {filteredEntries.length === 0 ? (
                                <p className="muted">No transactions match your search.</p>
                            ) : (
                                <table className="data-table account-activity-table">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Type</th>
                                            <th>Description</th>
                                            <th>Category</th>
                                            <th className="num">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pageItems.map((entry) => (
                                            <tr
                                                key={`${entry.type}-${entry.id}-${entry.direction}`}
                                                className={[
                                                    entry.type === 'income' && 'account-activity-income-row',
                                                    entry.beforeBaseline && 'account-activity-before-baseline',
                                                ]
                                                    .filter(Boolean)
                                                    .join(' ') || undefined}
                                            >
                                                <td>{entry.date}</td>
                                                <td>{formatTypeLabel(entry.type)}</td>
                                                <td>
                                                    <span className="account-activity-desc">
                                                        {entry.description}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className="account-activity-category">
                                                        {entry.category}
                                                    </span>
                                                    {entry.beforeBaseline && (
                                                        <span className="muted account-activity-category-note">
                                                            Before balance set
                                                        </span>
                                                    )}
                                                </td>
                                                <td
                                                    className={`num ${
                                                        entry.direction === 'in'
                                                            ? 'account-activity-in'
                                                            : 'account-activity-out'
                                                    }`}
                                                >
                                                    {entry.direction === 'in' ? '+' : '−'}
                                                    {formatAmount(entry.amount)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </>
                    )}
                </div>
                <div className="account-activity-footer">
                    {showActivityContent && !loading && !error && filteredEntries.length > 0 && (
                        <TablePagination
                            page={page}
                            totalPages={totalPages}
                            totalItems={totalItems}
                            onPageChange={setPage}
                        />
                    )}
                    <button type="button" className="btn-secondary" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
            <div onClick={(e) => e.stopPropagation()}>
                <ConfirmDialog
                    open={closingFd != null}
                    title="Close FD"
                    message={
                        closingFd
                            ? `Unlock ${formatAmount(closingFd.instrument.principal ?? 0)} from "${closingFd.instrument.name}"?`
                            : ''
                    }
                    confirmLabel="Close FD"
                    onConfirm={() => void handleCloseFd()}
                    onCancel={() => setClosingFd(null)}
                />
            </div>
        </div>
    );
}
