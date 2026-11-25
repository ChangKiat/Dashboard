import { useEffect, useState } from 'react';

import type { ExpenseTransaction, TripLeg, TripWithTotals } from '../api';
import { fetchTrips } from '../api';
import CategoryIcon from './CategoryIcon';
import DetailModal from './DetailModal';

interface Props {
    tx: ExpenseTransaction;
    formatAmount: (amount: number) => string;
    onClose: () => void;
    /** Opens the edit form; omitted for entries that aren't editable here (transfer fees). */
    onEdit?: () => void;
}

const TRIP_LEG_LABELS: Record<TripLeg, string> = {
    exchange: 'Currency exchange',
    fund: 'Paid from trip fund',
    card: 'Card spend abroad',
};

function formatDate(iso: string) {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('en-MY', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

/** One transaction with every entry tied to it: reimbursements, the account transfer it made, its trip. */
export default function TransactionDetailModal({ tx, formatAmount, onClose, onEdit }: Props) {
    const [trip, setTrip] = useState<TripWithTotals | null>(null);

    useEffect(() => {
        if (tx.tripId == null) return;
        let cancelled = false;
        fetchTrips()
            .then((res) => {
                if (!cancelled) setTrip(res.entries.find((t) => t.id === tx.tripId) ?? null);
            })
            .catch(() => {
                // the trip name is optional; the id-less row still shows
            });
        return () => {
            cancelled = true;
        };
    }, [tx.tripId]);

    const gross = tx.grossAmount ?? tx.amount;
    const reimbursed = tx.reimbursed ?? 0;
    const net = tx.netAmount ?? tx.amount;
    const reimbursements = tx.reimbursements ?? [];
    const transfer = tx.linkedTransfer ?? null;
    const isTransferFee = tx.id < 0;
    const linkedCount = reimbursements.length + (transfer ? 1 : 0) + (tx.tripId != null ? 1 : 0);
    const reimbursedPct = gross > 0 ? Math.min(100, Math.round((reimbursed / gross) * 100)) : 0;

    const details: { label: string; value: string; missing?: boolean }[] = [
        { label: 'Date', value: formatDate(tx.date) },
        { label: 'Category', value: tx.category },
        {
            label: transfer || tx.toInvestmentAccount ? 'From account' : 'Payment method',
            value: tx.paymentMethod?.trim() || 'Not set',
            missing: !isTransferFee && !tx.paymentMethod?.trim(),
        },
    ];
    if (tx.toInvestmentAccount) details.push({ label: 'To account', value: tx.toInvestmentAccount });
    if (tx.fxAmount != null && tx.fxCurrency) {
        details.push({
            label: 'Foreign amount',
            value: `${tx.fxCurrency} ${tx.fxAmount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${
                tx.fxRate ? ` @ ${tx.fxRate.toPrecision(4)}` : ''
            }`,
        });
    }
    if (!isTransferFee) details.push({ label: 'Reference', value: `#${tx.id}` });

    return (
        <DetailModal title="Transaction" open onClose={onClose} className="txn-detail-modal">
            <div className="txn-detail-hero">
                <CategoryIcon category={tx.category} />
                <div className="txn-detail-hero-text">
                    <p className="txn-detail-name">{tx.description}</p>
                    <p className="txn-detail-sub">
                        {tx.category} · {formatDate(tx.date)}
                    </p>
                </div>
                <div className="txn-detail-hero-amount">
                    <span className="txn-detail-amount">{formatAmount(gross)}</span>
                    {reimbursed > 0 && <span className="txn-detail-amount-sub">you paid {formatAmount(net)}</span>}
                </div>
            </div>

            {reimbursed > 0 && (
                <div className="txn-detail-split" aria-label="Amount split">
                    <div className="txn-detail-split-bar">
                        <div className="txn-detail-split-fill" style={{ width: `${reimbursedPct}%` }} />
                    </div>
                    <div className="txn-detail-split-legend">
                        <span>
                            <i className="txn-dot txn-dot--in" /> Reimbursed {formatAmount(reimbursed)} ({reimbursedPct}%)
                        </span>
                        <span>
                            <i className="txn-dot txn-dot--net" /> Your share {formatAmount(net)}
                        </span>
                    </div>
                </div>
            )}

            <section className="txn-detail-section">
                <h5>Details</h5>
                <dl className="txn-detail-grid">
                    {details.map((d) => (
                        <div key={d.label}>
                            <dt>{d.label}</dt>
                            <dd className={d.missing ? 'variable-txn-missing' : undefined}>{d.value}</dd>
                        </div>
                    ))}
                </dl>
            </section>

            <section className="txn-detail-section">
                <h5>
                    Linked transactions <span className="txn-detail-count">{linkedCount}</span>
                </h5>
                {linkedCount === 0 ? (
                    <p className="muted txn-detail-empty">
                        Nothing is linked to this transaction. Reimbursements from a shared bill and account
                        transfers show up here.
                    </p>
                ) : (
                    <ul className="txn-linked-list">
                        {reimbursements.map((r) => (
                            <li key={`r-${r.id}`} className="txn-linked">
                                <span className="txn-linked-kind txn-linked-kind--in">Reimbursement</span>
                                <span className="txn-linked-main">
                                    <span className="txn-linked-title">{r.source || r.description || 'Reimbursement'}</span>
                                    <span className="txn-linked-meta">
                                        {[
                                            r.date ? formatDate(r.date) : null,
                                            r.paymentMethod ? `into ${r.paymentMethod}` : null,
                                            r.description && r.description !== r.source ? r.description : null,
                                        ]
                                            .filter(Boolean)
                                            .join(' · ')}
                                    </span>
                                </span>
                                <span className="txn-linked-amount txn-linked-amount--in">+{formatAmount(r.amount)}</span>
                            </li>
                        ))}
                        {transfer && (
                            <li className="txn-linked">
                                <span className="txn-linked-kind">Transfer</span>
                                <span className="txn-linked-main">
                                    <span className="txn-linked-title">
                                        {transfer.fromPaymentMethod || tx.paymentMethod || '—'} →{' '}
                                        {transfer.paymentMethod || '—'}
                                    </span>
                                    <span className="txn-linked-meta">
                                        {[
                                            formatDate(transfer.date),
                                            transfer.transferFee ? `fee ${formatAmount(transfer.transferFee)}` : null,
                                        ]
                                            .filter(Boolean)
                                            .join(' · ')}
                                    </span>
                                </span>
                                <span className="txn-linked-amount">{formatAmount(transfer.amount)}</span>
                            </li>
                        )}
                        {tx.tripId != null && (
                            <li className="txn-linked">
                                <span className="txn-linked-kind txn-linked-kind--trip">Trip</span>
                                <span className="txn-linked-main">
                                    <span className="txn-linked-title">{trip?.name ?? `Trip #${tx.tripId}`}</span>
                                    <span className="txn-linked-meta">
                                        {[
                                            tx.tripLeg ? TRIP_LEG_LABELS[tx.tripLeg] : null,
                                            trip?.startDate
                                                ? `${formatDate(trip.startDate)}${trip.endDate ? ` – ${formatDate(trip.endDate)}` : ''}`
                                                : null,
                                        ]
                                            .filter(Boolean)
                                            .join(' · ')}
                                    </span>
                                </span>
                                {trip && <span className="txn-linked-amount">{formatAmount(trip.spentMyr)} total</span>}
                            </li>
                        )}
                    </ul>
                )}
                {reimbursed > 0 && reimbursements.length > 0 && (
                    <div className="txn-linked-total">
                        <span>Net after reimbursements</span>
                        <span>
                            {formatAmount(gross)} − {formatAmount(reimbursed)} = <strong>{formatAmount(net)}</strong>
                        </span>
                    </div>
                )}
            </section>

            {isTransferFee && (
                <p className="muted txn-detail-empty">
                    This is an account-transfer fee. Edit it from the transfer on the Income tab.
                </p>
            )}

            <div className="record-modal-actions">
                <button type="button" className="btn-secondary" onClick={onClose}>
                    Close
                </button>
                {onEdit && (
                    <button type="button" className="btn-primary" onClick={onEdit}>
                        Edit transaction
                    </button>
                )}
            </div>
        </DetailModal>
    );
}
