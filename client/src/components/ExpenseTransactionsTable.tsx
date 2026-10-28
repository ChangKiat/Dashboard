import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ExpenseTransaction, TripWithTotals } from '../api';
import { deleteExpenseTransaction, fetchTrips } from '../api';
import { usePagination } from '../hooks/usePagination';
import { normalizeDescription } from '../utils/fixedExpenses';
import ExpenseRecordModal from './ExpenseRecordModal';
import RowActions from './RowActions';
import TablePagination from './TablePagination';

const DAY_PAGE_SIZE = 5;

/** null: closed. entry null: adding a transaction. */
type ModalState = { entry: ExpenseTransaction | null } | null;

interface Props {
    entries: ExpenseTransaction[];
    variableCategories: string[];
    fixedDescriptions?: string[];
    formatAmount: (amount: number) => string;
    onChanged: () => void;
    defaultDate?: string;
    searchQuery?: string;
}

function expenseEntryMatchesQuery(entry: ExpenseTransaction, query: string): boolean {
    if (entry.description.toLowerCase().includes(query)) return true;
    if (entry.category.toLowerCase().includes(query)) return true;
    if (entry.paymentMethod?.toLowerCase().includes(query)) return true;
    if (entry.toInvestmentAccount?.toLowerCase().includes(query)) return true;
    if (String(entry.amount).includes(query)) return true;
    if (entry.amount.toFixed(2).includes(query)) return true;
    return false;
}

export default function ExpenseTransactionsTable({
    entries,
    variableCategories,
    fixedDescriptions = [],
    formatAmount,
    onChanged,
    defaultDate,
    searchQuery = '',
}: Props) {
    const fixedDescriptionSet = useMemo(
        () => new Set(fixedDescriptions.map(normalizeDescription)),
        [fixedDescriptions]
    );

    const [trips, setTrips] = useState<TripWithTotals[]>([]);
    const tripNameById = useMemo(() => new Map(trips.map((t) => [t.id, t.name])), [trips]);

    const loadTrips = useCallback(async () => {
        try {
            const res = await fetchTrips();
            setTrips(res.entries);
        } catch {
            // trip tags are optional; the list still works without them
        }
    }, []);

    useEffect(() => {
        void loadTrips();
    }, [loadTrips]);

    const [modal, setModal] = useState<ModalState>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const filteredEntries = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return entries;
        return entries.filter((entry) => expenseEntryMatchesQuery(entry, q));
    }, [entries, searchQuery]);

    const { page, setPage, pageItems, totalPages, totalItems } = usePagination(filteredEntries, {
        pageSize: DAY_PAGE_SIZE,
    });

    // Trips are reloaded on open so a trip created since shows up as a tag after saving.
    const openModal = (entry: ExpenseTransaction | null) => {
        setModal({ entry });
        void loadTrips();
    };

    const handleDelete = async (entry: ExpenseTransaction) => {
        setActionError(null);
        try {
            await deleteExpenseTransaction(entry.id);
            onChanged();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to delete');
        }
    };

    const formatEntryAmount = (entry: ExpenseTransaction) => {
        const reimbursed = entry.reimbursed ?? 0;
        const netAmount = entry.netAmount ?? entry.amount;
        if (reimbursed > 0) {
            return `${formatAmount(netAmount)} (gross ${formatAmount(entry.grossAmount ?? entry.amount)}, reimbursed ${formatAmount(reimbursed)})`;
        }
        return formatAmount(entry.amount);
    };

    return (
        <>
            {defaultDate != null && (
                <div className="section-header-row">
                    <button type="button" className="btn-add" onClick={() => openModal(null)}>
                        + Add
                    </button>
                </div>
            )}
            {actionError && <p className="error">{actionError}</p>}
            {entries.length === 0 ? (
                <p className="muted">No transactions logged this day.</p>
            ) : (
                <>
                    {filteredEntries.length === 0 && (
                        <p className="muted">No transactions match your search.</p>
                    )}
                    <ul className="day-entry-list">
                        {pageItems.map((entry) => (
                            <li key={entry.id} className="day-entry-card">
                                <div className="day-entry-main">
                                    <span className="day-entry-title">
                                        {entry.description}
                                        {fixedDescriptionSet.has(normalizeDescription(entry.description)) && (
                                            <span className="fixed-tag" title="Counted as a fixed expense">
                                                Fixed
                                            </span>
                                        )}
                                        {entry.tripId != null && tripNameById.has(entry.tripId) && (
                                            <span className="trip-tag" title="Grouped in this trip">
                                                {tripNameById.get(entry.tripId)}
                                            </span>
                                        )}
                                    </span>
                                    <span className="day-entry-sub">
                                        {entry.category}
                                        {entry.paymentMethod ? ` · ${entry.paymentMethod}` : ''}
                                        {entry.toInvestmentAccount
                                            ? ` → ${entry.toInvestmentAccount}`
                                            : ''}
                                        {' · '}
                                        {formatEntryAmount(entry)}
                                    </span>
                                </div>
                                <RowActions
                                    onEdit={() => openModal(entry)}
                                    onDelete={() => handleDelete(entry)}
                                    deleteLabel="this transaction"
                                />
                            </li>
                        ))}
                    </ul>
                    {totalPages > 1 && (
                        <TablePagination
                            page={page}
                            totalPages={totalPages}
                            totalItems={totalItems}
                            onPageChange={setPage}
                        />
                    )}
                </>
            )}
            {modal && (
                <ExpenseRecordModal
                    entry={modal.entry}
                    defaultDate={defaultDate}
                    variableCategories={variableCategories}
                    usedCategories={entries.map((e) => e.category)}
                    onClose={() => setModal(null)}
                    onSaved={onChanged}
                />
            )}
        </>
    );
}
