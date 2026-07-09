import { useEffect, useState } from 'react';

import type { AccountActivityEntry, PaymentAccount } from '../api';
import { fetchAccountActivity } from '../api';

interface Props {
    account: PaymentAccount | null;
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

export default function AccountActivityModal({ account, formatAmount, onClose }: Props) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [accountData, setAccountData] = useState<PaymentAccount | null>(null);
    const [entries, setEntries] = useState<AccountActivityEntry[]>([]);

    useEffect(() => {
        if (!account) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
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
                <div className="record-modal-body account-activity-body">
                    {loading && <p className="muted">Loading activity…</p>}
                    {error && <p className="error">{error}</p>}
                    {!loading && !error && entries.length === 0 && (
                        <p className="muted">No transactions linked to this account yet.</p>
                    )}
                    {!loading && !error && entries.length > 0 && (
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
                                {entries.map((entry) => (
                                    <tr key={`${entry.type}-${entry.id}-${entry.direction}`}>
                                        <td>{entry.date}</td>
                                        <td>{formatTypeLabel(entry.type)}</td>
                                        <td>
                                            <span className="account-activity-desc">{entry.description}</span>
                                            <span className="muted account-activity-category">
                                                {entry.category}
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
                                            {accountData?.accountType === 'credit'
                                                ? formatAmount(entry.runningOwed ?? 0)
                                                : formatAmount(entry.runningBalance ?? 0)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                <div className="record-modal-actions">
                    <button type="button" className="btn-secondary" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
