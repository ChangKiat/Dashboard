import { useEffect, useMemo, useState } from 'react';

import type { AccountActivityEntry, PaymentAccount } from '../api';
import { fetchAccountActivity } from '../api';
import { usePagination } from '../hooks/usePagination';
import {
    accountPeriodToDateRange,
    formatPeriodLabel,
    isDateInRange,
} from '../utils/statementPeriod';
import RebateSummary from './RebateSummary';
import TablePagination from './TablePagination';

interface Props {
    account: PaymentAccount | null;
    month: string;
    formatAmount: (amount: number) => string;
    onClose: () => void;
}

type ActivityTab = 'activity' | 'cashback';

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

export default function AccountActivityModal({ account, month, formatAmount, onClose }: Props) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [accountData, setAccountData] = useState<PaymentAccount | null>(null);
    const [entries, setEntries] = useState<AccountActivityEntry[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<ActivityTab>('activity');

    useEffect(() => {
        if (!account) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        setSearchQuery('');
        setActiveTab('activity');
        fetchAccountActivity(account.id)
            .then((res) => {
                if (cancelled) return;
                setAccountData(res.account);
                setEntries(res.entries);
            })
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
    }, [account]);

    const periodAccount = accountData ?? account;
    const rebateEnabled =
        accountData?.accountType === 'credit' && accountData.rebateConfig?.enabled === true;

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
        pageSize: 5,
    });

    useEffect(() => {
        setPage(1);
    }, [month, searchQuery, setPage]);

    if (!account) return null;

    const showActivityContent = !rebateEnabled || activeTab === 'activity';

    return (
        <div className="record-modal-backdrop" onClick={onClose}>
            <div className="record-modal account-activity-modal" onClick={(e) => e.stopPropagation()}>
                <div className="account-activity-header">
                    <div className="account-activity-header-top">
                        <h4>{account.name}</h4>
                        {rebateEnabled && (
                            <div className="account-activity-tabs">
                                <button
                                    type="button"
                                    className={`section-tab${activeTab === 'activity' ? ' active' : ''}`}
                                    onClick={() => setActiveTab('activity')}
                                >
                                    Activity
                                </button>
                                <button
                                    type="button"
                                    className={`section-tab${activeTab === 'cashback' ? ' active' : ''}`}
                                    onClick={() => setActiveTab('cashback')}
                                >
                                    Cashback
                                </button>
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
                                <span
                                    className={
                                        (accountData.balance ?? 0) < 0
                                            ? 'account-balance-negative'
                                            : 'account-balance-positive'
                                    }
                                >
                                    Balance {formatAmount(accountData.balance ?? 0)}
                                </span>
                            )}
                        </div>
                    )}
                    {periodAccount && month && (
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
                                            <th className="num">Amount</th>
                                            <th className="num">Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pageItems.map((entry) => (
                                            <tr
                                                key={`${entry.type}-${entry.id}-${entry.direction}`}
                                                className={
                                                    entry.beforeBaseline
                                                        ? 'account-activity-before-baseline'
                                                        : undefined
                                                }
                                            >
                                                <td>{entry.date}</td>
                                                <td>{formatTypeLabel(entry.type)}</td>
                                                <td>
                                                    <span className="account-activity-desc">
                                                        {entry.description}
                                                    </span>
                                                    <span className="muted account-activity-category">
                                                        {entry.beforeBaseline
                                                            ? `${entry.category} · Before balance set`
                                                            : entry.category}
                                                    </span>
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
                                                <td className="num">
                                                    {entry.beforeBaseline
                                                        ? '—'
                                                        : accountData?.accountType === 'credit'
                                                          ? formatAmount(entry.runningOwed ?? 0)
                                                          : formatAmount(
                                                                entry.runningBalance ?? 0
                                                            )}
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
        </div>
    );
}
