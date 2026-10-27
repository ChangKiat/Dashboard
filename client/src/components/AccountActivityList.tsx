import { useMemo, useState } from 'react';

import type { AccountActivityEntry, PaymentAccountType } from '../api';

const PREVIEW_COUNT = 15;

interface Props {
    entries: AccountActivityEntry[];
    accountType: PaymentAccountType;
    formatAmount: (amount: number) => string;
}

function formatDayHeading(iso: string) {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('en-MY', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}

function entryMeta(entry: AccountActivityEntry) {
    if (entry.type === 'transfer_in') return 'Transfer in';
    if (entry.type === 'transfer_out') return 'Transfer out';
    return entry.category;
}

/** Every transaction on one account, newest day first, with the balance after each. */
export default function AccountActivityList({ entries, accountType, formatAmount }: Props) {
    const [query, setQuery] = useState('');
    const [showAll, setShowAll] = useState(false);

    const matching = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return entries;
        return entries.filter(
            (entry) =>
                entry.description.toLowerCase().includes(q) ||
                entry.category.toLowerCase().includes(q) ||
                entry.amount.toFixed(2).includes(q)
        );
    }, [entries, query]);

    const days = useMemo(() => {
        const shown = showAll ? matching : matching.slice(0, PREVIEW_COUNT);
        const grouped: { date: string; rows: AccountActivityEntry[] }[] = [];
        for (const entry of shown) {
            const last = grouped[grouped.length - 1];
            if (last && last.date === entry.date) last.rows.push(entry);
            else grouped.push({ date: entry.date, rows: [entry] });
        }
        return grouped;
    }, [matching, showAll]);

    function afterLine(entry: AccountActivityEntry) {
        if (entry.beforeBaseline) return 'Before tracking began';
        if (accountType === 'credit') {
            return entry.runningOwed != null ? `${formatAmount(entry.runningOwed)} owed` : '';
        }
        return entry.runningBalance != null ? `Balance ${formatAmount(entry.runningBalance)}` : '';
    }

    return (
        <section className="card account-activity-card" aria-labelledby="account-activity-title">
            <div className="variable-txns-header">
                <div>
                    <h3 id="account-activity-title">Activity</h3>
                    <p className="variable-expenses-sub">
                        {matching.length} {matching.length === 1 ? 'transaction' : 'transactions'}
                    </p>
                </div>
                {entries.length > 0 && (
                    <div className="variable-txns-tools">
                        <input
                            type="search"
                            placeholder="Search name, category or amount…"
                            aria-label="Search this account's transactions"
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setShowAll(false);
                            }}
                        />
                    </div>
                )}
            </div>

            {entries.length === 0 ? (
                <p className="muted">No transactions on this account yet.</p>
            ) : matching.length === 0 ? (
                <p className="muted">No transactions match your search.</p>
            ) : (
                days.map((day) => (
                    <div key={day.date} className="trip-day">
                        <p className="trip-day-heading">{formatDayHeading(day.date)}</p>
                        <ul className="variable-txn-list">
                            {day.rows.map((entry) => (
                                <li
                                    key={`${entry.type}-${entry.id}`}
                                    className={`variable-txn${entry.beforeBaseline ? ' account-txn-untracked' : ''}`}
                                >
                                    <span className="variable-txn-main">
                                        <span className="variable-txn-title" title={entry.description}>
                                            {entry.description || entry.category}
                                        </span>
                                        <span className="variable-txn-meta">{entryMeta(entry)}</span>
                                    </span>
                                    <span className="variable-txn-figures">
                                        <span
                                            className={`variable-txn-amount${
                                                entry.direction === 'in' ? ' account-activity-in' : ''
                                            }`}
                                        >
                                            {entry.direction === 'in' ? '+' : '−'}
                                            {formatAmount(entry.amount)}
                                        </span>
                                        <span className="variable-txn-net">{afterLine(entry)}</span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))
            )}

            {matching.length > PREVIEW_COUNT && (
                <button
                    type="button"
                    className="show-more-btn"
                    aria-expanded={showAll}
                    onClick={() => setShowAll((s) => !s)}
                >
                    {showAll ? 'Show fewer' : `Show all ${matching.length} transactions`}
                </button>
            )}
        </section>
    );
}
