import { useEffect, useMemo, useState } from 'react';

import type { AccountActivityEntry, PaymentAccount } from '../api';
import { fetchAccountActivity } from '../api';
import { usePagination } from '../hooks/usePagination';
import {
    accountPeriodToDateRange,
    formatPeriodLabel,
    isDateInRange,
} from '../utils/statementPeriod';
import TablePagination from './TablePagination';

interface Props {
    account: PaymentAccount | null;
    month: string;
    formatAmount: (amount: number) => string;
    onClose: () => void;
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

export default function AccountActivityModal({ account, month, formatAmount, onClose }: Props) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [accountData, setAccountData] = useState<PaymentAccount | null>(null);
    const [entries, setEntries] = useState<AccountActivityEntry[]>([]);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (!account) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        setSearchQuery('');
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

    return (
        <div className="record-modal-backdrop" onClick={onClose}>
            <div className="record-modal account-activity-modal" onClick={(e) => e.stopPropagation()}>
                <h4>{account.name}</h4>
                {accountData && (
                    <div className="account-activity-summary">
                        {accountData.accountType === 'credit' ? (
                            <>
                                <span>
                                    Limit: {formatAmount(accountData.creditLimit ?? 0)}
                                </span>
                                <span>
                                    Used: {formatAmount(accountData.amountOwed ?? 0)}
                                </span>
                                <span
                                    className={
                                        (accountData.availableCredit ?? 0) < 0
                                            ? 'account-balance-negative'
                                            : 'account-balance-positive'
                                    }
                                >
                                    Available: {formatAmount(accountData.availableCredit ?? 0)}
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
                                Balance: {formatAmount(accountData.balance ?? 0)}
                            </span>
                        )}
                    </div>
                )}
                {periodAccount && month && (
                    <div className="account-activity-period">
                        <span className="account-activity-period-range">
                            {formatPeriodLabel(periodAccount, month)}
                        </span>
                        <span className="muted account-activity-period-hint">
                            Follows month in header
                        </span>
                    </div>
                )}
                {!loading && !error && periodEntries.length > 0 && (
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
                {hasPreBaseline && accountData && (
                    <p className="muted account-activity-baseline-note">
                        Older transactions shown for history; balance starts from{' '}
                        {accountData.balanceBaselineDate}.
                    </p>
                )}
                <div className="record-modal-body account-activity-body">
                    {loading && <p className="muted">Loading activity…</p>}
                    {error && <p className="error">{error}</p>}
                    {!loading && !error && entries.length === 0 && (
                        <p className="muted">No transactions linked to this account yet.</p>
                    )}
                    {!loading && !error && entries.length > 0 && periodEntries.length === 0 && (
                        <p className="muted">No transactions in this period.</p>
                    )}
                    {!loading && !error && periodEntries.length > 0 && (
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
                    {!loading && !error && filteredEntries.length > 0 && (
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
