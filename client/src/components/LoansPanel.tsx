import { useMemo, useState } from 'react';

import type { FixedExpenseConfig, LoanMethod } from '../api';
import { createFixedExpense, deleteFixedExpense, updateFixedExpense } from '../api';
import {
    computeInstallmentSplit,
    parseLoanMethod,
    suggestedInstallmentAmount,
} from '../utils/loanInstallment';
import PaymentMethodSelect from './PaymentMethodSelect';
import RecordModal from './RecordModal';
import RowActions from './RowActions';

type ModalMode = 'closed' | 'create' | 'edit';

const EMPTY_FORM = {
    description: '',
    paymentMethod: '',
    amount: '',
    dayOfMonth: '1',
    loanMethod: 'reducing' as LoanMethod | '',
    originalPrincipal: '',
    remainingPrincipal: '',
    annualRatePct: '',
    tenureMonths: '',
    loanStartDate: '',
};

function methodLabel(method: string | null | undefined): string {
    if (method === 'reducing') return 'Reducing';
    if (method === 'flat') return 'Flat';
    if (method === 'included') return 'Included';
    return '—';
}

function nextSplit(row: FixedExpenseConfig) {
    const method = parseLoanMethod(row.loanMethod);
    if (!method) return null;
    return computeInstallmentSplit({
        method,
        installment: row.amount,
        remaining: row.remainingPrincipal ?? 0,
        originalPrincipal: row.originalPrincipal ?? 0,
        annualRatePct: row.annualRatePct ?? 0,
        tenureMonths: row.tenureMonths ?? 0,
    });
}

export type LoansPanelMode = 'manage' | 'view';

interface Props {
    rows: FixedExpenseConfig[];
    formatAmount: (amount: number) => string;
    mode?: LoansPanelMode;
    onChanged?: () => void;
}

export default function LoansPanel({ rows, formatAmount, mode = 'manage', onChanged }: Props) {
    const isView = mode === 'view';
    const [modalMode, setModalMode] = useState<ModalMode>('closed');
    const [editingEntry, setEditingEntry] = useState<FixedExpenseConfig | null>(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const sortedRows = useMemo(
        () =>
            [...rows].sort((a, b) =>
                a.description.localeCompare(b.description, 'en-MY', { sensitivity: 'base' })
            ),
        [rows]
    );

    const loanMethod = parseLoanMethod(form.loanMethod);
    const isIncluded = loanMethod === 'included';
    const originalPrincipal = parseFloat(form.originalPrincipal);
    const remainingPrincipal = parseFloat(
        form.remainingPrincipal === '' ? form.originalPrincipal : form.remainingPrincipal
    );
    const annualRatePct = parseFloat(form.annualRatePct);
    const tenureMonths = parseInt(form.tenureMonths, 10);
    const parsedAmount = parseFloat(form.amount);
    const suggestedAmount =
        loanMethod && !isIncluded
            ? suggestedInstallmentAmount({
                  method: loanMethod,
                  originalPrincipal,
                  annualRatePct,
                  tenureMonths,
              })
            : null;
    const installmentAmount =
        Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : suggestedAmount;
    const loanPreview =
        loanMethod && !isIncluded && installmentAmount
            ? computeInstallmentSplit({
                  method: loanMethod,
                  installment: installmentAmount,
                  remaining: remainingPrincipal,
                  originalPrincipal,
                  annualRatePct,
                  tenureMonths,
              })
            : null;

    const openCreate = () => {
        setModalMode('create');
        setEditingEntry(null);
        setForm(EMPTY_FORM);
        setModalError(null);
    };

    const openEdit = (row: FixedExpenseConfig) => {
        setModalMode('edit');
        setEditingEntry(row);
        setForm({
            description: row.description,
            paymentMethod: row.paymentMethod ?? '',
            amount: String(row.amount),
            dayOfMonth: String(row.dayOfMonth),
            loanMethod: parseLoanMethod(row.loanMethod) ?? 'reducing',
            originalPrincipal: row.originalPrincipal != null ? String(row.originalPrincipal) : '',
            remainingPrincipal: row.remainingPrincipal != null ? String(row.remainingPrincipal) : '',
            annualRatePct: row.annualRatePct != null ? String(row.annualRatePct) : '',
            tenureMonths: row.tenureMonths != null ? String(row.tenureMonths) : '',
            loanStartDate: row.loanStartDate ?? '',
        });
        setModalError(null);
    };

    const closeModal = () => {
        setModalMode('closed');
        setEditingEntry(null);
        setModalError(null);
    };

    const handleSave = async () => {
        const dayOfMonth = parseInt(form.dayOfMonth, 10);
        let amount = parseFloat(form.amount);
        if (!form.description.trim() || !loanMethod) {
            setModalError('Fill in name and interest method.');
            return;
        }
        if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
            setModalError('Fill in a valid payment day.');
            return;
        }

        let original = originalPrincipal;
        let remaining = remainingPrincipal;
        let rate: number | null = annualRatePct;
        let tenure: number | null = tenureMonths;
        let startDate: string | null = form.loanStartDate.trim() || null;

        if (isIncluded) {
            remaining = parseFloat(form.remainingPrincipal);
            if (!Number.isFinite(remaining) || remaining < 0) {
                setModalError('Fill in remaining principal.');
                return;
            }
            original = remaining;
            rate = null;
            tenure = null;
            startDate = null;
            if (!Number.isFinite(amount) || amount <= 0) {
                setModalError('Enter an installment amount.');
                return;
            }
        } else if (
            !Number.isFinite(original) ||
            original <= 0 ||
            !Number.isFinite(remaining) ||
            remaining < 0 ||
            !Number.isFinite(annualRatePct) ||
            annualRatePct < 0 ||
            !Number.isInteger(tenureMonths) ||
            tenureMonths <= 0
        ) {
            setModalError('Fill in principal, remaining, rate, tenure, and payment day.');
            return;
        } else if (!Number.isFinite(amount) || amount <= 0) {
            if (suggestedAmount == null || suggestedAmount <= 0) {
                setModalError('Enter an installment amount, or fill principal, rate, and tenure.');
                return;
            }
            amount = suggestedAmount;
        }

        setSaving(true);
        setModalError(null);
        try {
            const payload = {
                description: form.description.trim(),
                category: 'Loan',
                amount,
                dayOfMonth,
                frequencyMonths: 1,
                paymentMethod: form.paymentMethod.trim() || null,
                loanMethod,
                originalPrincipal: original,
                remainingPrincipal: remaining,
                annualRatePct: rate,
                tenureMonths: tenure,
                loanStartDate: startDate,
            };
            if (modalMode === 'create') {
                await createFixedExpense({
                    ...payload,
                    startMonth: new Date().getMonth() + 1,
                });
            } else if (editingEntry) {
                await updateFixedExpense(editingEntry.id, payload);
            }
            closeModal();
            onChanged?.();
        } catch (err) {
            setModalError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (row: FixedExpenseConfig) => {
        setActionError(null);
        try {
            await deleteFixedExpense(row.id);
            onChanged?.();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to delete');
        }
    };

    return (
        <div className="card payment-accounts-panel">
            {isView ? (
                <h3>Loans</h3>
            ) : (
                <div className="section-header-row">
                    <h3>Loan interest</h3>
                    <button type="button" className="btn-add" onClick={openCreate}>
                        + Add
                    </button>
                </div>
            )}
            {actionError && <p className="error">{actionError}</p>}
            {sortedRows.length === 0 ? (
                <p className="muted">No loans yet.</p>
            ) : (
                <ul className="payment-accounts-list">
                    {sortedRows.map((row) => {
                        const remaining = row.remainingPrincipal ?? 0;
                        const split = nextSplit(row);
                        return (
                            <li key={row.id} className="payment-account-card">
                                <div className="payment-account-card-main">
                                    <span className="payment-account-name">{row.description}</span>
                                    {row.remainingPrincipal != null ? (
                                        <span
                                            className={`payment-account-balance ${
                                                remaining > 0 ? 'negative' : 'positive'
                                            }`}
                                        >
                                            {formatAmount(remaining)}
                                        </span>
                                    ) : (
                                        <span className="muted">Set remaining principal</span>
                                    )}
                                    <div className="payment-account-stats">
                                        <span className="payment-account-stat">
                                            {formatAmount(row.amount)} / mo
                                        </span>
                                        <span className="payment-account-stat">
                                            {row.loanMethod === 'included'
                                                ? 'Included'
                                                : `${row.annualRatePct ?? 0}% p.a. · ${methodLabel(row.loanMethod)}`}
                                        </span>
                                        {row.paymentMethod && (
                                            <span className="payment-account-stat">
                                                via {row.paymentMethod}
                                            </span>
                                        )}
                                        {split && row.loanMethod === 'included' && (
                                            <span className="payment-account-stat">
                                                Next: principal {formatAmount(split.principal)}
                                            </span>
                                        )}
                                        {split && row.loanMethod !== 'included' && (
                                            <span className="payment-account-stat">
                                                Next: interest {formatAmount(split.interest)} ·
                                                principal {formatAmount(split.principal)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {!isView && (
                                    <RowActions
                                        onEdit={() => openEdit(row)}
                                        onDelete={() => handleDelete(row)}
                                        deleteLabel={`"${row.description}"`}
                                    />
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
            {!isView && (
            <RecordModal
                title={modalMode === 'create' ? 'Add loan' : 'Edit loan'}
                open={modalMode !== 'closed'}
                saving={saving}
                error={modalError}
                onClose={closeModal}
                onSave={handleSave}
                className="loan-form-modal"
                closeOnBackdrop={false}
            >
                <div className="loan-form-grid">
                    <div className="form-field span-full">
                        <label htmlFor="loan-description">Name</label>
                        <input
                            id="loan-description"
                            type="text"
                            placeholder="e.g. PTPTN, Car loan"
                            value={form.description}
                            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                        />
                    </div>
                    <div className="form-field">
                        <label htmlFor="loan-payment-method">Paid from</label>
                        <PaymentMethodSelect
                            id="loan-payment-method"
                            value={form.paymentMethod}
                            onChange={(paymentMethod) => setForm((f) => ({ ...f, paymentMethod }))}
                            excludeTypes={['investment']}
                        />
                    </div>
                    <div className="form-field">
                        <label htmlFor="loan-method">Interest method</label>
                        <select
                            id="loan-method"
                            value={form.loanMethod}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, loanMethod: e.target.value as LoanMethod }))
                            }
                        >
                            <option value="reducing">Reducing balance</option>
                            <option value="flat">Flat rate</option>
                            <option value="included">Interest included</option>
                        </select>
                    </div>
                    {!isIncluded && (
                    <div className="form-field">
                        <label htmlFor="loan-original">Original principal</label>
                        <input
                            id="loan-original"
                            type="number"
                            min="0"
                            step="0.01"
                            value={form.originalPrincipal}
                            onChange={(e) => {
                                const originalPrincipalValue = e.target.value;
                                setForm((f) => ({
                                    ...f,
                                    originalPrincipal: originalPrincipalValue,
                                    remainingPrincipal:
                                        f.remainingPrincipal === '' ||
                                        f.remainingPrincipal === f.originalPrincipal
                                            ? originalPrincipalValue
                                            : f.remainingPrincipal,
                                }));
                            }}
                        />
                    </div>
                    )}
                    <div className="form-field">
                        <label htmlFor="loan-remaining">Remaining principal</label>
                        <input
                            id="loan-remaining"
                            type="number"
                            min="0"
                            step="0.01"
                            value={form.remainingPrincipal}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, remainingPrincipal: e.target.value }))
                            }
                        />
                    </div>
                    {!isIncluded && (
                    <>
                    <div className="form-field">
                        <label htmlFor="loan-rate">Annual rate %</label>
                        <input
                            id="loan-rate"
                            type="number"
                            min="0"
                            step="0.01"
                            value={form.annualRatePct}
                            onChange={(e) => setForm((f) => ({ ...f, annualRatePct: e.target.value }))}
                        />
                    </div>
                    <div className="form-field">
                        <label htmlFor="loan-tenure">Tenure (months)</label>
                        <input
                            id="loan-tenure"
                            type="number"
                            min="1"
                            step="1"
                            value={form.tenureMonths}
                            onChange={(e) => setForm((f) => ({ ...f, tenureMonths: e.target.value }))}
                        />
                    </div>
                    </>
                    )}
                    <div className="form-field">
                        <label htmlFor="loan-amount">Monthly installment</label>
                        <input
                            id="loan-amount"
                            type="number"
                            min="0"
                            step="0.01"
                            value={form.amount}
                            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                        />
                        {suggestedAmount != null && form.amount === '' && (
                            <span className="muted form-hint">
                                Suggested installment {formatAmount(suggestedAmount)}
                            </span>
                        )}
                    </div>
                    <div className="form-field">
                        <label htmlFor="loan-day">Day of month</label>
                        <input
                            id="loan-day"
                            type="number"
                            min="1"
                            max="31"
                            value={form.dayOfMonth}
                            onChange={(e) => setForm((f) => ({ ...f, dayOfMonth: e.target.value }))}
                        />
                    </div>
                    {!isIncluded && (
                    <div className="form-field span-full">
                        <label htmlFor="loan-start">Start date (optional)</label>
                        <input
                            id="loan-start"
                            type="date"
                            value={form.loanStartDate}
                            onChange={(e) => setForm((f) => ({ ...f, loanStartDate: e.target.value }))}
                        />
                    </div>
                    )}
                    {loanPreview && (
                        <p className="muted form-hint span-full">
                            This payment: interest {formatAmount(loanPreview.interest)} · principal{' '}
                            {formatAmount(loanPreview.principal)} · left{' '}
                            {formatAmount(loanPreview.remainingAfter)}
                        </p>
                    )}
                </div>
            </RecordModal>
            )}
        </div>
    );
}
