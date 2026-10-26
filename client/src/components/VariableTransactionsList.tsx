import { forwardRef, useEffect, useMemo, useState } from 'react';

import type { ExpenseTransaction } from '../api';

const PREVIEW_COUNT = 15;

interface Props {
    transactions: ExpenseTransaction[];
    /** The category being shown, or null for every variable expense. */
    category: string | null;
    onClear: () => void;
    formatAmount: (amount: number) => string;
    /** "this month" or "in Aug – Oct 2026". */
    periodText: string;
}

function formatDayHeading(iso: string) {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('en-MY', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}

/** Variable expenses for the period, newest day first, under the category cards. */
const VariableTransactionsList = forwardRef<HTMLElement, Props>(function VariableTransactionsList(
    { transactions, category, onClear, formatAmount, periodText },
    ref
) {
    const [query, setQuery] = useState('');
    const [showAll, setShowAll] = useState(false);

    useEffect(() => {
        setQuery('');
        setShowAll(false);
    }, [category]);

    const matching = useMemo(() => {
        const q = query.trim().toLowerCase();
        const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
        if (!q) return sorted;
        return sorted.filter(
            (tx) =>
                tx.description.toLowerCase().includes(q) ||
                tx.category.toLowerCase().includes(q) ||
                (tx.paymentMethod ?? '').toLowerCase().includes(q)
        );
    }, [transactions, query]);

    const days = useMemo(() => {
        const shown = showAll ? matching : matching.slice(0, PREVIEW_COUNT);
        const grouped: { date: string; rows: ExpenseTransaction[] }[] = [];
        for (const tx of shown) {
            const last = grouped[grouped.length - 1];
            if (last && last.date === tx.date) last.rows.push(tx);
            else grouped.push({ date: tx.date, rows: [tx] });
        }
        return grouped;
    }, [matching, showAll]);

    const total = matching.reduce((sum, tx) => sum + (tx.netAmount ?? tx.amount), 0);

    return (
        <section ref={ref} className="variable-txns" aria-labelledby="variable-txns-title">
            <div className="variable-txns-header">
                <div>
                    <h3 id="variable-txns-title">{category ?? 'All variable expenses'}</h3>
                    <p className="variable-expenses-sub">
                        {matching.length} {matching.length === 1 ? 'transaction' : 'transactions'} {periodText}
                        {matching.length > 0 && ` · ${formatAmount(total)}`}
                    </p>
                </div>
                <div className="variable-txns-tools">
                    <input
                        type="search"
                        placeholder="Search name or account…"
                        aria-label="Search transactions"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setShowAll(false);
                        }}
                    />
                    {category && (
                        <button type="button" className="btn-secondary" onClick={onClear}>
                            All categories
                        </button>
                    )}
                </div>
            </div>

            {transactions.length === 0 ? (
                <p className="muted">No transactions {periodText}.</p>
            ) : matching.length === 0 ? (
                <p className="muted">No transactions match your search.</p>
            ) : (
                days.map((day) => (
                    <div key={day.date} className="trip-day">
                        <p className="trip-day-heading">{formatDayHeading(day.date)}</p>
                        <ul className="variable-txn-list">
                            {day.rows.map((tx) => (
                                <li key={tx.id} className="variable-txn">
                                    <span className="variable-txn-main">
                                        <span className="variable-txn-title" title={tx.description}>
                                            {tx.description}
                                        </span>
                                        <span className="variable-txn-meta">
                                            {category ? '' : tx.category}
                                            {!category && tx.paymentMethod ? ' · ' : ''}
                                            {tx.paymentMethod ?? ''}
                                        </span>
                                    </span>
                                    <span className="variable-txn-figures">
                                        <span className="variable-txn-amount">
                                            {formatAmount(tx.grossAmount ?? tx.amount)}
                                        </span>
                                        {(tx.reimbursed ?? 0) > 0 && (
                                            <span className="variable-txn-net">
                                                net {formatAmount(tx.netAmount ?? tx.amount)} · reimbursed{' '}
                                                {formatAmount(tx.reimbursed ?? 0)}
                                            </span>
                                        )}
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
});

export default VariableTransactionsList;
