import { useEffect, useMemo, useState } from 'react';

import type { ExpenseTransaction } from '../api';
import { usePagination } from '../hooks/usePagination';
import {
    BUDGET_STATUS_LABELS,
    getBudgetStatus,
    getBudgetUsagePct,
} from '../utils/budgetStatus';
import DetailModal from './DetailModal';
import TablePagination from './TablePagination';

const PAGE_SIZE = 5;

interface Props {
    category: string;
    monthlyBudget: number;
    spending: number;
    transactions: ExpenseTransaction[];
    formatAmount: (amount: number) => string;
    onClose: () => void;
}

function DetailField({ label, value }: { label: string; value: string }) {
    return (
        <div className="detail-field">
            <dt>{label}</dt>
            <dd>{value}</dd>
        </div>
    );
}

export default function VariableCategoryDetailModal({
    category,
    monthlyBudget,
    spending,
    transactions,
    formatAmount,
    onClose,
}: Props) {
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        setSearchQuery('');
    }, [category]);

    const status = getBudgetStatus(spending, monthlyBudget);
    const usagePct = getBudgetUsagePct(spending, monthlyBudget);
    const remaining = monthlyBudget - spending;
    const statusLabel = BUDGET_STATUS_LABELS[status];

    const sortedTransactions = useMemo(
        () => [...transactions].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id),
        [transactions]
    );

    const filteredTransactions = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return sortedTransactions;
        return sortedTransactions.filter((tx) => tx.description.toLowerCase().includes(q));
    }, [sortedTransactions, searchQuery]);

    const { page, setPage, pageItems, totalPages, totalItems } = usePagination(
        filteredTransactions,
        { pageSize: PAGE_SIZE }
    );

    return (
        <DetailModal title={category} open onClose={onClose}>
            <div className={`category-detail-summary budget-row budget-row--${status}`}>
                <dl className="detail-field-list category-detail-summary-grid">
                    <DetailField label="Budget" value={formatAmount(monthlyBudget)} />
                    <DetailField label="Spent" value={formatAmount(spending)} />
                    <DetailField
                        label="Remaining"
                        value={formatAmount(Math.max(0, remaining))}
                    />
                    <DetailField label="Usage" value={`${usagePct}%`} />
                </dl>
                {statusLabel && (
                    <span className={`budget-badge budget-badge--${status}`}>{statusLabel}</span>
                )}
            </div>
            <h5 className="category-detail-transactions-heading">Transactions this month</h5>
            {transactions.length > 0 && (
                <div className="category-detail-search">
                    <input
                        type="search"
                        placeholder="Search by name…"
                        aria-label="Search transactions"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            )}
            {transactions.length === 0 ? (
                <p className="muted">No transactions this month.</p>
            ) : filteredTransactions.length === 0 ? (
                <p className="muted">No transactions match your search.</p>
            ) : (
                <>
                    <ul className="category-detail-transactions">
                        {pageItems.map((tx) => (
                            <li key={tx.id} className="category-detail-transaction">
                                <div className="category-detail-transaction-main">
                                    <span className="category-detail-transaction-desc">
                                        {tx.description}
                                    </span>
                                    <span className="category-detail-transaction-date">{tx.date}</span>
                                </div>
                                <span className="category-detail-transaction-amount">
                                    {formatAmount(tx.amount)}
                                </span>
                            </li>
                        ))}
                    </ul>
                    <TablePagination
                        page={page}
                        totalPages={totalPages}
                        totalItems={totalItems}
                        onPageChange={setPage}
                    />
                </>
            )}
        </DetailModal>
    );
}
