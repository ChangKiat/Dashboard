import { useEffect, useMemo, useState } from 'react';

import type {
    HoldingPosition,
    InstrumentKind,
    PaymentAccount,
    PortfolioSummary,
} from '../api';
import {
    accrueFdInterest,
    createInstrument,
    deleteInstrument,
    fetchPortfolio,
    recordPortfolioBuy,
    recordPortfolioDividend,
    recordPortfolioInterest,
    recordPortfolioPriceMark,
    recordPortfolioSell,
} from '../api';
import { usePaymentAccounts } from '../hooks/usePaymentAccounts';
import {
    estimateRakutenTradeFee,
    formatFeeAmount,
    isRakutenSecurityType,
    monthToDateBuyGross,
    roundMoney,
    tradeFeeFromEvent,
    type RakutenSecurityType,
} from '../utils/rakutenTradeFees';
import RecordModal from './RecordModal';

interface Props {
    account: PaymentAccount | null;
    formatAmount: (amount: number) => string;
    onClose: () => void;
    onChanged?: () => void;
    onOpenCashActivity?: (account: PaymentAccount) => void;
}

type FormMode =
    | 'closed'
    | 'add-instrument'
    | 'buy'
    | 'sell'
    | 'dividend'
    | 'interest'
    | 'price'
    | 'accrue';

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

function kindLabel(kind: InstrumentKind): string {
    switch (kind) {
        case 'equity':
            return 'Stock';
        case 'fund':
            return 'Fund';
        case 'fd':
            return 'FD';
        default:
            return 'Other';
    }
}

function parseFeeInput(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const n = parseFloat(trimmed);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
}

export default function PortfolioModal({
    account,
    formatAmount,
    onClose,
    onChanged,
    onOpenCashActivity,
}: Props) {
    const { accounts } = usePaymentAccounts();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [summary, setSummary] = useState<PortfolioSummary | null>(null);
    const [formMode, setFormMode] = useState<FormMode>('closed');
    const [selected, setSelected] = useState<HoldingPosition | null>(null);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [feeDirty, setFeeDirty] = useState(false);

    const [instrumentForm, setInstrumentForm] = useState({
        kind: 'equity' as InstrumentKind,
        name: '',
        symbol: '',
        lastPrice: '',
    });

    const [tradeForm, setTradeForm] = useState({
        date: today(),
        quantity: '',
        unitPrice: '',
        amount: '',
        notes: '',
        fee: '',
        securityType: 'ordinary' as RakutenSecurityType,
        fromPaymentMethod: '',
        toPaymentMethod: '',
        syncCash: true,
    });

    const paymentMethodOptions = useMemo(
        () =>
            [...accounts]
                .filter((a) => a.active)
                .sort((a, b) => a.name.localeCompare(b.name, 'en-MY', { sensitivity: 'base' })),
        [accounts]
    );

    const tradePreview = useMemo(() => {
        if (formMode !== 'buy' && formMode !== 'sell') return null;
        const quantity = parseFloat(tradeForm.quantity);
        const unitPrice = parseFloat(tradeForm.unitPrice);
        if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
            return null;
        }
        const gross = roundMoney(quantity * unitPrice);
        const estimate = estimateRakutenTradeFee({
            side: formMode,
            gross,
            monthToDateBuyGross: monthToDateBuyGross(summary?.events ?? [], tradeForm.date),
            securityType: tradeForm.securityType,
            tradeDate: tradeForm.date,
        });
        const parsedFee = parseFeeInput(feeDirty ? tradeForm.fee : formatFeeAmount(estimate.total));
        if (parsedFee == null) return { gross, estimate, fee: null as number | null, cashDelta: null, cashLeft: null };
        const fee = parsedFee;
        const cashDelta = formMode === 'buy' ? roundMoney(gross + fee) : roundMoney(gross - fee);
        const syncName = formMode === 'buy' ? tradeForm.fromPaymentMethod : tradeForm.toPaymentMethod;
        const affectsThisCash = Boolean(account && syncName && syncName === account.name);
        const cashLeft =
            affectsThisCash && summary
                ? roundMoney(
                      summary.cashBalance + (formMode === 'buy' ? -cashDelta : cashDelta)
                  )
                : null;
        return { gross, estimate, fee, cashDelta, cashLeft };
    }, [
        account,
        feeDirty,
        formMode,
        summary,
        tradeForm.date,
        tradeForm.fee,
        tradeForm.fromPaymentMethod,
        tradeForm.quantity,
        tradeForm.securityType,
        tradeForm.toPaymentMethod,
        tradeForm.unitPrice,
    ]);

    const reload = async () => {
        if (!account) return;
        setLoading(true);
        setError(null);
        try {
            const data = await fetchPortfolio(account.id);
            setSummary(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load portfolio');
            setSummary(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!account) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        setFormMode('closed');
        setSelected(null);
        fetchPortfolio(account.id)
            .then((data) => {
                if (!cancelled) setSummary(data);
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load portfolio');
                    setSummary(null);
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [account]);

    if (!account) return null;

    const openAddInstrument = () => {
        setSelected(null);
        setInstrumentForm({
            kind: 'equity',
            name: '',
            symbol: '',
            lastPrice: '',
        });
        setFormError(null);
        setFormMode('add-instrument');
    };

    const openTrade = (mode: Exclude<FormMode, 'closed' | 'add-instrument'>, holding: HoldingPosition) => {
        setSelected(holding);
        setTradeForm({
            date: today(),
            quantity: '',
            unitPrice: holding.lastPrice != null ? String(holding.lastPrice) : '',
            amount: '',
            notes: '',
            fee: '',
            securityType: 'ordinary',
            fromPaymentMethod: account.name,
            toPaymentMethod: account.name,
            syncCash: true,
        });
        setFeeDirty(false);
        setFormError(null);
        setFormMode(mode);
    };

    const closeForm = () => {
        setFormMode('closed');
        setSelected(null);
        setFormError(null);
    };

    const parsePositive = (value: string): number | null => {
        const n = parseFloat(value);
        if (!Number.isFinite(n) || n <= 0) return null;
        return n;
    };

    const handleSaveForm = async () => {
        setSaving(true);
        setFormError(null);
        try {
            if (formMode === 'add-instrument') {
                if (!instrumentForm.name.trim()) {
                    setFormError('Name is required.');
                    setSaving(false);
                    return;
                }
                const payload: Parameters<typeof createInstrument>[0] = {
                    paymentAccountId: account.id,
                    kind: instrumentForm.kind,
                    name: instrumentForm.name.trim(),
                    symbol: instrumentForm.symbol.trim() || null,
                };
                if (instrumentForm.lastPrice.trim()) {
                    const price = parseFloat(instrumentForm.lastPrice);
                    if (!Number.isFinite(price) || price < 0) {
                        setFormError('Invalid last price.');
                        setSaving(false);
                        return;
                    }
                    payload.lastPrice = price;
                }
                await createInstrument(payload);
            } else if (selected) {
                const id = selected.instrument.id;
                if (formMode === 'buy') {
                    const quantity = parsePositive(tradeForm.quantity);
                    const unitPrice = parseFloat(tradeForm.unitPrice);
                    if (quantity == null || !Number.isFinite(unitPrice) || unitPrice < 0) {
                        setFormError('Quantity and unit price are required.');
                        setSaving(false);
                        return;
                    }
                    const fee = parseFeeInput(
                        feeDirty
                            ? tradeForm.fee
                            : tradePreview
                              ? formatFeeAmount(tradePreview.estimate.total)
                              : '0'
                    );
                    if (fee == null) {
                        setFormError('Service charges must be zero or more.');
                        setSaving(false);
                        return;
                    }
                    await recordPortfolioBuy({
                        instrumentId: id,
                        date: tradeForm.date,
                        quantity,
                        unitPrice,
                        fee,
                        notes: tradeForm.notes.trim() || null,
                        fromPaymentMethod: tradeForm.fromPaymentMethod || null,
                    });
                } else if (formMode === 'sell') {
                    const quantity = parsePositive(tradeForm.quantity);
                    const unitPrice = parseFloat(tradeForm.unitPrice);
                    if (quantity == null || !Number.isFinite(unitPrice) || unitPrice < 0) {
                        setFormError('Quantity and unit price are required.');
                        setSaving(false);
                        return;
                    }
                    const fee = parseFeeInput(
                        feeDirty
                            ? tradeForm.fee
                            : tradePreview
                              ? formatFeeAmount(tradePreview.estimate.total)
                              : '0'
                    );
                    if (fee == null) {
                        setFormError('Service charges must be zero or more.');
                        setSaving(false);
                        return;
                    }
                    if (fee > roundMoney(quantity * unitPrice)) {
                        setFormError('Service charges cannot exceed sale proceeds.');
                        setSaving(false);
                        return;
                    }
                    await recordPortfolioSell({
                        instrumentId: id,
                        date: tradeForm.date,
                        quantity,
                        unitPrice,
                        fee,
                        notes: tradeForm.notes.trim() || null,
                        toPaymentMethod: tradeForm.toPaymentMethod || null,
                    });
                } else if (formMode === 'dividend') {
                    const amount = parsePositive(tradeForm.amount);
                    if (amount == null) {
                        setFormError('Amount is required.');
                        setSaving(false);
                        return;
                    }
                    await recordPortfolioDividend({
                        instrumentId: id,
                        date: tradeForm.date,
                        amount,
                        notes: tradeForm.notes.trim() || null,
                        toPaymentMethod: tradeForm.toPaymentMethod || null,
                    });
                } else if (formMode === 'interest') {
                    const amount = parsePositive(tradeForm.amount);
                    if (amount == null) {
                        setFormError('Amount is required.');
                        setSaving(false);
                        return;
                    }
                    await recordPortfolioInterest({
                        instrumentId: id,
                        date: tradeForm.date,
                        amount,
                        notes: tradeForm.notes.trim() || null,
                        toPaymentMethod: tradeForm.toPaymentMethod || null,
                        syncCash: tradeForm.syncCash,
                    });
                } else if (formMode === 'price') {
                    const unitPrice = parseFloat(tradeForm.unitPrice);
                    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
                        setFormError('Price is required.');
                        setSaving(false);
                        return;
                    }
                    await recordPortfolioPriceMark({
                        instrumentId: id,
                        date: tradeForm.date,
                        unitPrice,
                        notes: tradeForm.notes.trim() || null,
                    });
                } else if (formMode === 'accrue') {
                    await accrueFdInterest(id, {
                        toDate: tradeForm.date,
                        amountOverride: tradeForm.amount.trim()
                            ? parsePositive(tradeForm.amount) ?? undefined
                            : undefined,
                        toPaymentMethod: tradeForm.toPaymentMethod || null,
                        syncCash: tradeForm.syncCash,
                    });
                }
            }
            closeForm();
            await reload();
            onChanged?.();
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteInstrument = async (holding: HoldingPosition) => {
        if (!window.confirm(`Remove "${holding.instrument.name}" from this portfolio?`)) return;
        try {
            await deleteInstrument(holding.instrument.id);
            await reload();
            onChanged?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete');
        }
    };

    const formTitle = (() => {
        switch (formMode) {
            case 'add-instrument':
                return 'Add instrument';
            case 'buy':
                return `Buy — ${selected?.instrument.name ?? ''}`;
            case 'sell':
                return `Sell — ${selected?.instrument.name ?? ''}`;
            case 'dividend':
                return `Dividend — ${selected?.instrument.name ?? ''}`;
            case 'interest':
                return `Interest — ${selected?.instrument.name ?? ''}`;
            case 'price':
                return `Set price — ${selected?.instrument.name ?? ''}`;
            case 'accrue':
                return `Accrue FD interest — ${selected?.instrument.name ?? ''}`;
            default:
                return '';
        }
    })();

    return (
        <>
            <div className="record-modal-backdrop" onClick={onClose}>
                <div
                    className="record-modal account-activity-modal portfolio-modal"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="account-activity-header">
                        <div className="account-activity-header-top">
                            <h4>{account.name} — Portfolio</h4>
                            <div className="portfolio-header-actions">
                                <button type="button" className="btn-add" onClick={openAddInstrument}>
                                    + Instrument
                                </button>
                                {onOpenCashActivity && (
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        onClick={() => onOpenCashActivity(account)}
                                    >
                                        Cash activity
                                    </button>
                                )}
                            </div>
                        </div>
                        {summary && (
                            <div className="account-activity-summary portfolio-summary-chips">
                                <span>Cash {formatAmount(summary.cashBalance)}</span>
                                <span className="account-activity-sep">·</span>
                                <span>Holdings {formatAmount(summary.totalMarketValue)}</span>
                                <span className="account-activity-sep">·</span>
                                <span
                                    className={
                                        summary.nav < 0
                                            ? 'account-balance-negative'
                                            : 'account-balance-positive'
                                    }
                                >
                                    NAV {formatAmount(summary.nav)}
                                </span>
                                <span className="account-activity-sep">·</span>
                                <span>
                                    Unreal.{' '}
                                    <strong
                                        className={
                                            summary.totalUnrealizedGain >= 0
                                                ? 'account-activity-in'
                                                : 'account-activity-out'
                                        }
                                    >
                                        {formatAmount(summary.totalUnrealizedGain)}
                                    </strong>
                                </span>
                                <span className="account-activity-sep">·</span>
                                <span>
                                    Realized{' '}
                                    <strong
                                        className={
                                            summary.totalRealizedGain >= 0
                                                ? 'account-activity-in'
                                                : 'account-activity-out'
                                        }
                                    >
                                        {formatAmount(summary.totalRealizedGain)}
                                    </strong>
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="record-modal-body account-activity-body">
                        {loading && <p className="muted">Loading portfolio…</p>}
                        {error && <p className="error">{error}</p>}
                        {!loading && !error && summary && summary.holdings.length === 0 && (
                            <p className="muted">No instruments yet. Add a stock or fund.</p>
                        )}
                        {!loading && !error && summary && summary.holdings.length > 0 && (
                            <table className="data-table portfolio-holdings-table">
                                <thead>
                                    <tr>
                                        <th>Instrument</th>
                                        <th>Qty / principal</th>
                                        <th>Cost</th>
                                        <th>Value</th>
                                        <th>P&amp;L</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {summary.holdings.map((holding) => {
                                        const inst = holding.instrument;
                                        const isFd = inst.kind === 'fd';
                                        return (
                                            <tr key={inst.id}>
                                                <td>
                                                    <div className="portfolio-instrument-name">
                                                        {inst.symbol
                                                            ? `${inst.symbol} — ${inst.name}`
                                                            : inst.name}
                                                    </div>
                                                    <div className="muted portfolio-instrument-meta">
                                                        {kindLabel(inst.kind)}
                                                        {isFd && inst.annualRatePct != null
                                                            ? ` · ${inst.annualRatePct}% p.a.`
                                                            : ''}
                                                        {!isFd && holding.lastPrice != null
                                                            ? ` · @ ${holding.lastPrice}`
                                                            : ''}
                                                    </div>
                                                </td>
                                                <td>
                                                    {isFd
                                                        ? formatAmount(inst.principal ?? 0)
                                                        : holding.quantity}
                                                </td>
                                                <td>{formatAmount(holding.costBasis)}</td>
                                                <td>{formatAmount(holding.marketValue)}</td>
                                                <td
                                                    className={
                                                        holding.unrealizedGain >= 0
                                                            ? 'account-activity-in'
                                                            : 'account-activity-out'
                                                    }
                                                >
                                                    {isFd
                                                        ? '—'
                                                        : formatAmount(holding.unrealizedGain)}
                                                </td>
                                                <td>
                                                    <div className="portfolio-row-actions">
                                                        {isFd ? (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    className="btn-link"
                                                                    onClick={() =>
                                                                        openTrade('interest', holding)
                                                                    }
                                                                >
                                                                    Interest
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="btn-link"
                                                                    onClick={() =>
                                                                        openTrade('accrue', holding)
                                                                    }
                                                                >
                                                                    Accrue
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    className="btn-link"
                                                                    onClick={() =>
                                                                        openTrade('buy', holding)
                                                                    }
                                                                >
                                                                    Buy
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="btn-link"
                                                                    onClick={() =>
                                                                        openTrade('sell', holding)
                                                                    }
                                                                >
                                                                    Sell
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="btn-link"
                                                                    onClick={() =>
                                                                        openTrade('dividend', holding)
                                                                    }
                                                                >
                                                                    Div
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="btn-link"
                                                                    onClick={() =>
                                                                        openTrade('price', holding)
                                                                    }
                                                                >
                                                                    Price
                                                                </button>
                                                            </>
                                                        )}
                                                        <button
                                                            type="button"
                                                            className="btn-link danger"
                                                            onClick={() =>
                                                                handleDeleteInstrument(holding)
                                                            }
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}

                        {!loading && !error && summary && summary.events.length > 0 && (
                            <>
                                <h5 className="portfolio-events-heading">Recent events</h5>
                                <table className="data-table account-activity-table">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Type</th>
                                            <th>Detail</th>
                                            <th>Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {summary.events.slice(0, 20).map((event) => {
                                            const holding = summary.holdings.find(
                                                (h) => h.instrument.id === event.instrumentId
                                            );
                                            const label =
                                                holding?.instrument.symbol ||
                                                holding?.instrument.name ||
                                                `#${event.instrumentId}`;
                                            const detailParts: string[] = [label];
                                            if (event.quantity != null) {
                                                detailParts.push(`qty ${event.quantity}`);
                                            }
                                            if (event.unitPrice != null) {
                                                detailParts.push(`@ ${event.unitPrice}`);
                                            }
                                            const fee = tradeFeeFromEvent(event);
                                            if (fee != null) {
                                                detailParts.push(`fee ${formatAmount(fee)}`);
                                            }
                                            if (event.realizedGain != null) {
                                                detailParts.push(
                                                    `realized ${formatAmount(event.realizedGain)}`
                                                );
                                            }
                                            return (
                                                <tr key={event.id}>
                                                    <td>{event.date}</td>
                                                    <td>{event.eventType}</td>
                                                    <td>{detailParts.join(' · ')}</td>
                                                    <td>
                                                        {event.amount != null
                                                            ? formatAmount(event.amount)
                                                            : '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </>
                        )}
                    </div>

                    <div className="account-activity-footer">
                        <button type="button" className="btn-secondary" onClick={onClose}>
                            Close
                        </button>
                    </div>
                </div>
            </div>

            <RecordModal
                title={formTitle}
                open={formMode !== 'closed'}
                saving={saving}
                error={formError}
                onClose={closeForm}
                onSave={handleSaveForm}
                className="portfolio-form-modal"
            >
                {formMode === 'add-instrument' && (
                    <>
                        <div className="form-field">
                            <label htmlFor="pf-kind">Type</label>
                            <select
                                id="pf-kind"
                                value={instrumentForm.kind}
                                onChange={(e) =>
                                    setInstrumentForm((f) => ({
                                        ...f,
                                        kind: e.target.value as InstrumentKind,
                                    }))
                                }
                            >
                                <option value="equity">Stock</option>
                                <option value="fund">Fund / unit trust</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                        <div className="form-field">
                            <label htmlFor="pf-name">Name</label>
                            <input
                                id="pf-name"
                                type="text"
                                value={instrumentForm.name}
                                onChange={(e) =>
                                    setInstrumentForm((f) => ({ ...f, name: e.target.value }))
                                }
                                placeholder="e.g. Maybank, ASB"
                            />
                        </div>
                        <div className="form-field">
                            <label htmlFor="pf-symbol">Symbol (optional)</label>
                            <input
                                id="pf-symbol"
                                type="text"
                                value={instrumentForm.symbol}
                                onChange={(e) =>
                                    setInstrumentForm((f) => ({
                                        ...f,
                                        symbol: e.target.value,
                                    }))
                                }
                                placeholder="e.g. 1155"
                            />
                        </div>
                        <div className="form-field">
                            <label htmlFor="pf-last">Last price (optional)</label>
                            <input
                                id="pf-last"
                                type="number"
                                min="0"
                                step="0.01"
                                value={instrumentForm.lastPrice}
                                onChange={(e) =>
                                    setInstrumentForm((f) => ({
                                        ...f,
                                        lastPrice: e.target.value,
                                    }))
                                }
                            />
                        </div>
                    </>
                )}

                {(formMode === 'buy' || formMode === 'sell') && (
                    <>
                        {summary && (
                            <p className="portfolio-trade-cash">
                                Cash in {account.name} {formatAmount(summary.cashBalance)}
                            </p>
                        )}
                        <div className="form-field">
                            <label htmlFor="pf-date">Date</label>
                            <input
                                id="pf-date"
                                type="date"
                                value={tradeForm.date}
                                onChange={(e) =>
                                    setTradeForm((f) => ({ ...f, date: e.target.value }))
                                }
                            />
                        </div>
                        <div className="form-field">
                            <label htmlFor="pf-qty">Quantity</label>
                            <input
                                id="pf-qty"
                                type="number"
                                min="0"
                                step="any"
                                value={tradeForm.quantity}
                                onChange={(e) =>
                                    setTradeForm((f) => ({ ...f, quantity: e.target.value }))
                                }
                            />
                        </div>
                        <div className="form-field">
                            <label htmlFor="pf-price">Unit price</label>
                            <input
                                id="pf-price"
                                type="number"
                                min="0"
                                step="any"
                                value={tradeForm.unitPrice}
                                onChange={(e) =>
                                    setTradeForm((f) => ({ ...f, unitPrice: e.target.value }))
                                }
                            />
                        </div>
                        <div className="form-field">
                            <label htmlFor="pf-security">Security type</label>
                            <select
                                id="pf-security"
                                value={tradeForm.securityType}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    if (!isRakutenSecurityType(value)) return;
                                    setTradeForm((f) => ({ ...f, securityType: value }));
                                }}
                            >
                                <option value="ordinary">Ordinary share</option>
                                <option value="reit_warrant">REIT / Warrant</option>
                                <option value="etf">ETF</option>
                            </select>
                        </div>
                        <div className="form-field">
                            <div className="form-field-label-row">
                                <label htmlFor="pf-fee">Service charges</label>
                                {feeDirty && (
                                    <button
                                        type="button"
                                        className="btn-link"
                                        onClick={() => {
                                            setFeeDirty(false);
                                            setTradeForm((f) => ({ ...f, fee: '' }));
                                        }}
                                    >
                                        Reset to estimate
                                    </button>
                                )}
                            </div>
                            <input
                                id="pf-fee"
                                type="number"
                                min="0"
                                step="0.01"
                                value={
                                    feeDirty
                                        ? tradeForm.fee
                                        : tradePreview
                                          ? formatFeeAmount(tradePreview.estimate.total)
                                          : ''
                                }
                                onChange={(e) => {
                                    setFeeDirty(true);
                                    setTradeForm((f) => ({ ...f, fee: e.target.value }));
                                }}
                            />
                            <span className="portfolio-trade-hint">
                                Rakuten estimate — edit if the contract differs
                            </span>
                        </div>
                        {tradePreview && tradePreview.fee != null && (
                            <div className="portfolio-trade-breakdown">
                                <div className="portfolio-trade-breakdown-row">
                                    <span>{formMode === 'buy' ? 'Shares' : 'Gross'}</span>
                                    <span>{formatAmount(tradePreview.gross)}</span>
                                </div>
                                <div className="portfolio-trade-breakdown-row">
                                    <span>Service charges</span>
                                    <span>{formatAmount(tradePreview.fee)}</span>
                                </div>
                                <div className="portfolio-trade-breakdown-row total">
                                    <span>
                                        {formMode === 'buy' ? 'Total deducted' : 'Net proceeds'}
                                    </span>
                                    <span>{formatAmount(tradePreview.cashDelta ?? 0)}</span>
                                </div>
                                {tradePreview.cashLeft != null && (
                                    <div
                                        className={
                                            tradePreview.cashLeft < 0
                                                ? 'portfolio-trade-breakdown-row account-balance-negative'
                                                : 'portfolio-trade-breakdown-row'
                                        }
                                    >
                                        <span>Cash left</span>
                                        <span>{formatAmount(tradePreview.cashLeft)}</span>
                                    </div>
                                )}
                                {formMode === 'buy' &&
                                    tradePreview.cashLeft != null &&
                                    tradePreview.cashLeft < 0 && (
                                        <p className="portfolio-trade-hint account-balance-negative">
                                            This buy uses more cash than {account.name} currently
                                            has.
                                        </p>
                                    )}
                                {formMode === 'sell' &&
                                    tradePreview.cashDelta != null &&
                                    tradePreview.cashDelta < 0 && (
                                        <p className="portfolio-trade-hint account-balance-negative">
                                            Service charges exceed the sale proceeds.
                                        </p>
                                    )}
                            </div>
                        )}
                        {formMode === 'buy' && (
                            <div className="form-field">
                                <label htmlFor="pf-from">Deduct cash from</label>
                                <select
                                    id="pf-from"
                                    value={tradeForm.fromPaymentMethod}
                                    onChange={(e) =>
                                        setTradeForm((f) => ({
                                            ...f,
                                            fromPaymentMethod: e.target.value,
                                        }))
                                    }
                                >
                                    <option value="">Do not deduct cash</option>
                                    {paymentMethodOptions.map((a) => (
                                        <option key={a.id} value={a.name}>
                                            {a.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        {formMode === 'sell' && (
                            <div className="form-field">
                                <label htmlFor="pf-to">Credit proceeds to</label>
                                <select
                                    id="pf-to"
                                    value={tradeForm.toPaymentMethod}
                                    onChange={(e) =>
                                        setTradeForm((f) => ({
                                            ...f,
                                            toPaymentMethod: e.target.value,
                                        }))
                                    }
                                >
                                    <option value="">Do not credit cash</option>
                                    {paymentMethodOptions.map((a) => (
                                        <option key={a.id} value={a.name}>
                                            {a.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div className="form-field">
                            <label htmlFor="pf-notes">Notes</label>
                            <input
                                id="pf-notes"
                                type="text"
                                value={tradeForm.notes}
                                onChange={(e) =>
                                    setTradeForm((f) => ({ ...f, notes: e.target.value }))
                                }
                            />
                        </div>
                    </>
                )}

                {(formMode === 'dividend' || formMode === 'interest' || formMode === 'accrue') && (
                    <>
                        <div className="form-field">
                            <label htmlFor="pf-d-date">
                                {formMode === 'accrue' ? 'Accrue to date' : 'Date'}
                            </label>
                            <input
                                id="pf-d-date"
                                type="date"
                                value={tradeForm.date}
                                onChange={(e) =>
                                    setTradeForm((f) => ({ ...f, date: e.target.value }))
                                }
                            />
                        </div>
                        {formMode !== 'accrue' && (
                            <div className="form-field">
                                <label htmlFor="pf-d-amt">Amount (RM)</label>
                                <input
                                    id="pf-d-amt"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={tradeForm.amount}
                                    onChange={(e) =>
                                        setTradeForm((f) => ({ ...f, amount: e.target.value }))
                                    }
                                />
                            </div>
                        )}
                        {formMode === 'accrue' && (
                            <div className="form-field">
                                <label htmlFor="pf-d-override">Amount override (optional)</label>
                                <input
                                    id="pf-d-override"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={tradeForm.amount}
                                    onChange={(e) =>
                                        setTradeForm((f) => ({ ...f, amount: e.target.value }))
                                    }
                                    placeholder="Leave blank to compute from rate"
                                />
                            </div>
                        )}
                        <div className="form-field">
                            <label htmlFor="pf-d-to">Credit to</label>
                            <select
                                id="pf-d-to"
                                value={tradeForm.toPaymentMethod}
                                onChange={(e) =>
                                    setTradeForm((f) => ({
                                        ...f,
                                        toPaymentMethod: e.target.value,
                                    }))
                                }
                            >
                                {paymentMethodOptions.map((a) => (
                                    <option key={a.id} value={a.name}>
                                        {a.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {(formMode === 'interest' || formMode === 'accrue') && (
                            <div className="form-field form-field-checkbox">
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={tradeForm.syncCash}
                                        onChange={(e) =>
                                            setTradeForm((f) => ({
                                                ...f,
                                                syncCash: e.target.checked,
                                            }))
                                        }
                                    />{' '}
                                    Sync cash (create income)
                                </label>
                            </div>
                        )}
                    </>
                )}

                {formMode === 'price' && (
                    <>
                        <div className="form-field">
                            <label htmlFor="pf-p-date">Date</label>
                            <input
                                id="pf-p-date"
                                type="date"
                                value={tradeForm.date}
                                onChange={(e) =>
                                    setTradeForm((f) => ({ ...f, date: e.target.value }))
                                }
                            />
                        </div>
                        <div className="form-field">
                            <label htmlFor="pf-p-price">Unit price</label>
                            <input
                                id="pf-p-price"
                                type="number"
                                min="0"
                                step="0.01"
                                value={tradeForm.unitPrice}
                                onChange={(e) =>
                                    setTradeForm((f) => ({ ...f, unitPrice: e.target.value }))
                                }
                            />
                        </div>
                    </>
                )}
            </RecordModal>
        </>
    );
}
