import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { TaxReliefCategory, TaxReliefClaim, TaxReliefOverview, TaxReliefReceipt } from '../api';
import {
    createTaxReliefClaim,
    deleteTaxReliefClaim,
    deleteTaxReliefReceipt,
    fetchTaxReliefOverview,
    taxReliefReceiptUrl,
    updateTaxReliefClaim,
    uploadTaxReliefReceipt,
} from '../api';
import { useFormatMYR } from '../hooks/useAmountVisibility';
import { useRefreshSignal } from '../hooks/useRefreshSignal';
import ConfirmDialog from './ConfirmDialog';
import RowActions from './RowActions';

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];

type ClaimForm = {
    date: string;
    category: string;
    description: string;
    amount: string;
    notes: string;
};

function formatDate(iso: string) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
}

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function todayIsoKl(): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kuala_Lumpur',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
}

function emptyForm(year: number): ClaimForm {
    const today = todayIsoKl();
    return {
        date: today.startsWith(String(year)) ? today : `${year}-12-31`,
        category: 'lifestyle',
        description: '',
        amount: '',
        notes: '',
    };
}

function validateFiles(files: File[]): string | null {
    for (const file of files) {
        if (!ACCEPTED_TYPES.includes(file.type)) return `${file.name}: only PDF or image files are allowed.`;
        if (file.size > MAX_RECEIPT_BYTES) return `${file.name}: larger than 10 MB.`;
    }
    return null;
}

export default function TaxReliefSection() {
    const formatMYR = useFormatMYR();
    const [year, setYear] = useState(() => parseInt(todayIsoKl().slice(0, 4), 10));
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<TaxReliefOverview | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [form, setForm] = useState<ClaimForm>(() => emptyForm(year));
    const [formFiles, setFormFiles] = useState<File[]>([]);
    const [saving, setSaving] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
    const [showAllCategories, setShowAllCategories] = useState(false);
    const [receiptToDelete, setReceiptToDelete] = useState<TaxReliefReceipt | null>(null);
    const attachInputRef = useRef<HTMLInputElement>(null);
    const [attachClaimId, setAttachClaimId] = useState<number | null>(null);

    const loadData = useCallback(async () => {
        setData(await fetchTaxReliefOverview(year));
    }, [year]);

    useRefreshSignal(() =>
        loadData().catch((err) => setError(err instanceof Error ? err.message : 'Failed to refresh'))
    );

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        loadData()
            .catch((err) => {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [loadData]);

    const categoryById = useMemo(
        () => new Map((data?.categories ?? []).map((c) => [c.id, c])),
        [data?.categories]
    );

    const categoryGroups = useMemo(() => {
        const groups = new Map<string, TaxReliefCategory[]>();
        for (const c of data?.categories ?? []) {
            groups.set(c.group, [...(groups.get(c.group) ?? []), c]);
        }
        return [...groups.entries()];
    }, [data?.categories]);

    const selectedCategory = categoryById.get(form.category);

    const visibleClaims = useMemo(
        () => (data?.claims ?? []).filter((c) => !categoryFilter || c.category === categoryFilter),
        [data?.claims, categoryFilter]
    );

    const visibleCategories = useMemo(
        () => (data?.byCategory ?? []).filter((c) => showAllCategories || c.claimCount > 0),
        [data?.byCategory, showAllCategories]
    );

    const yearOptions = useMemo(() => {
        const current = parseInt(todayIsoKl().slice(0, 4), 10);
        return [...new Set([current, current - 1, ...(data?.years ?? []), year])].sort((a, b) => b - a);
    }, [data?.years, year]);

    const closeForm = () => {
        setShowForm(false);
        setEditingId(null);
        setFormFiles([]);
    };

    const openCreate = () => {
        setEditingId(null);
        setForm(emptyForm(year));
        setFormFiles([]);
        setActionError(null);
        setShowForm(true);
    };

    const openEdit = (claim: TaxReliefClaim) => {
        setEditingId(claim.id);
        setForm({
            date: claim.date,
            category: claim.category,
            description: claim.description,
            amount: String(claim.amount),
            notes: claim.notes ?? '',
        });
        setFormFiles([]);
        setActionError(null);
        setShowForm(true);
    };

    const handleSubmit = async () => {
        const amount = parseFloat(form.amount);
        if (!form.date || !form.description.trim() || !Number.isFinite(amount) || amount <= 0) {
            setActionError('Enter a date, description and amount.');
            return;
        }
        const fileError = validateFiles(formFiles);
        if (fileError) {
            setActionError(fileError);
            return;
        }

        setSaving(true);
        setActionError(null);
        try {
            const fields = {
                date: form.date,
                category: form.category,
                description: form.description.trim(),
                amount,
                notes: form.notes.trim() || null,
            };
            let claimId = editingId;
            if (claimId != null) {
                await updateTaxReliefClaim(claimId, fields);
            } else {
                claimId = (await createTaxReliefClaim(fields)).id;
            }
            for (const file of formFiles) {
                await uploadTaxReliefReceipt(claimId, file);
            }
            closeForm();
            const claimYear = parseInt(form.date.slice(0, 4), 10);
            if (claimYear !== year) setYear(claimYear);
            else await loadData();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to save claim');
            await loadData().catch(() => undefined);
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteClaim = async (claim: TaxReliefClaim) => {
        setSaving(true);
        setActionError(null);
        try {
            await deleteTaxReliefClaim(claim.id);
            if (editingId === claim.id) closeForm();
            await loadData();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to delete claim');
        } finally {
            setSaving(false);
        }
    };

    const startAttach = (claimId: number) => {
        setAttachClaimId(claimId);
        attachInputRef.current?.click();
    };

    const handleAttachFiles = async (files: File[]) => {
        const claimId = attachClaimId;
        setAttachClaimId(null);
        if (claimId == null || files.length === 0) return;
        const fileError = validateFiles(files);
        if (fileError) {
            setActionError(fileError);
            return;
        }
        setSaving(true);
        setActionError(null);
        try {
            for (const file of files) {
                await uploadTaxReliefReceipt(claimId, file);
            }
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to upload receipt');
        } finally {
            await loadData().catch(() => undefined);
            setSaving(false);
        }
    };

    const confirmDeleteReceipt = async () => {
        const receipt = receiptToDelete;
        setReceiptToDelete(null);
        if (!receipt) return;
        setSaving(true);
        setActionError(null);
        try {
            await deleteTaxReliefReceipt(receipt.id);
            await loadData();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to delete receipt');
        } finally {
            setSaving(false);
        }
    };

    const toolbar = (
        <div className="car-service-toolbar">
            <label className="tax-relief-year">
                <span className="muted">Year of assessment</span>
                <select value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))} disabled={saving}>
                    {yearOptions.map((y) => (
                        <option key={y} value={y}>
                            {y}
                        </option>
                    ))}
                </select>
            </label>
            <div className="car-service-toolbar-actions">
                <button type="button" className="btn-primary" onClick={openCreate} disabled={saving}>
                    Add claim
                </button>
            </div>
        </div>
    );

    if (loading && !data) return <section className="panel"><p className="muted">Loading tax relief…</p></section>;
    if (error || !data) {
        return (
            <section className="panel">
                {toolbar}
                <p className="error">{error ?? 'Failed to load'}</p>
            </section>
        );
    }

    const { summary } = data;

    return (
        <section className="panel car-service-section tax-relief-section">
            {toolbar}

            <div className="trips-summary-strip">
                <div className="trips-summary-item trips-summary-item--spent">
                    <span className="trips-summary-label">Relief claimable</span>
                    <span className="trips-summary-value">{formatMYR(summary.totalEligible)}</span>
                    <span className="trips-summary-sub muted">
                        incl. {formatMYR(summary.individualRelief)} individual relief
                    </span>
                </div>
                <div className="trips-summary-item">
                    <span className="trips-summary-label">Total spent</span>
                    <span className="trips-summary-value">{formatMYR(summary.totalClaimed)}</span>
                </div>
                <div className="trips-summary-item">
                    <span className="trips-summary-label">Claims</span>
                    <span className="trips-summary-value">{summary.claimCount}</span>
                </div>
                <div className="trips-summary-item">
                    <span className="trips-summary-label">Receipts</span>
                    <span className="trips-summary-value">{summary.receiptCount}</span>
                </div>
                <div className="trips-summary-item">
                    <span className="trips-summary-label">Missing receipts</span>
                    <span
                        className={`trips-summary-value${summary.missingReceiptCount > 0 ? ' tax-relief-warn' : ''}`}
                    >
                        {summary.missingReceiptCount}
                    </span>
                </div>
            </div>

            {actionError && <p className="error">{actionError}</p>}

            {showForm && (
                <div className="trips-form tax-relief-form">
                    <div className="span-full tax-relief-form-title">
                        {editingId != null ? 'Edit claim' : 'New claim'}
                    </div>
                    <label>
                        Date
                        <input
                            type="date"
                            value={form.date}
                            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                        />
                    </label>
                    <label>
                        Category
                        <select
                            value={form.category}
                            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                        >
                            {categoryGroups.map(([group, cats]) => (
                                <optgroup key={group} label={group}>
                                    {cats.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.label}
                                            {c.limit != null ? ` (max ${formatMYR(c.limit)})` : ''}
                                        </option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                    </label>
                    <label>
                        Amount (RM)
                        <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={form.amount}
                            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                        />
                    </label>
                    {selectedCategory && (
                        <p className="span-full muted tax-relief-hint">
                            {selectedCategory.hint}
                            {!selectedCategory.receipt && ' · No receipt needed'}
                        </p>
                    )}
                    <label className="span-full">
                        Description
                        <input
                            type="text"
                            value={form.description}
                            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                            placeholder="e.g. MPH Bookstore, Fitness First membership"
                        />
                    </label>
                    <label className="span-full">
                        Notes
                        <input
                            type="text"
                            value={form.notes}
                            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                            placeholder="Optional"
                        />
                    </label>
                    <label className="span-full">
                        {editingId != null ? 'Add more receipts' : 'Receipts'}
                        <input
                            type="file"
                            multiple
                            accept={ACCEPTED_TYPES.join(',')}
                            onChange={(e) => setFormFiles(Array.from(e.target.files ?? []))}
                        />
                        <span className="tax-relief-hint">PDF or image, up to 10 MB each.</span>
                    </label>
                    <div className="trips-form-actions span-full">
                        <button type="button" className="btn-secondary" onClick={closeForm} disabled={saving}>
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="btn-primary"
                            onClick={() => void handleSubmit()}
                            disabled={saving}
                        >
                            {saving ? 'Saving…' : editingId != null ? 'Save changes' : 'Add claim'}
                        </button>
                    </div>
                </div>
            )}

            <div className="tax-relief-block">
                <div className="tax-relief-block-header">
                    <h3>By category</h3>
                    <button
                        type="button"
                        className="btn-link"
                        onClick={() => setShowAllCategories((v) => !v)}
                    >
                        {showAllCategories ? 'Hide unused' : 'Show all categories'}
                    </button>
                </div>
                {visibleCategories.length === 0 ? (
                    <p className="muted">No claims for {year} yet.</p>
                ) : (
                    <div className="tax-relief-categories">
                        {visibleCategories.map((c) => {
                            const pct = c.limit ? Math.min(100, (c.claimed / c.limit) * 100) : 0;
                            const full = c.limit != null && c.claimed >= c.limit;
                            const active = categoryFilter === c.category;
                            return (
                                <button
                                    key={c.category}
                                    type="button"
                                    className={`tax-relief-category${active ? ' active' : ''}${
                                        c.claimCount === 0 ? ' unused' : ''
                                    }`}
                                    onClick={() => setCategoryFilter(active ? null : c.category)}
                                    aria-pressed={active}
                                >
                                    <span className="tax-relief-category-label">{c.label}</span>
                                    <span className="tax-relief-category-amount">
                                        {formatMYR(c.claimed)}
                                        {c.limit != null && (
                                            <span className="muted"> / {formatMYR(c.limit)}</span>
                                        )}
                                    </span>
                                    {c.limit != null && (
                                        <span className="tax-relief-bar">
                                            <span
                                                className={`tax-relief-bar-fill${full ? ' full' : ''}`}
                                                style={{ width: `${pct}%` }}
                                            />
                                        </span>
                                    )}
                                    <span className="tax-relief-category-meta muted">
                                        {full
                                            ? c.claimed > c.limit!
                                                ? `Limit reached · ${formatMYR(c.claimed - c.limit!)} over`
                                                : 'Limit reached'
                                            : c.limit != null
                                              ? `${formatMYR(c.limit - c.claimed)} left`
                                              : categoryById.get(c.category)?.hint}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="tax-relief-block">
                <div className="tax-relief-block-header">
                    <h3>
                        Claims
                        {categoryFilter && (
                            <span className="muted"> · {categoryById.get(categoryFilter)?.label}</span>
                        )}
                    </h3>
                    {categoryFilter && (
                        <button type="button" className="btn-link" onClick={() => setCategoryFilter(null)}>
                            Clear filter
                        </button>
                    )}
                </div>
                {visibleClaims.length === 0 ? (
                    <p className="muted">Nothing here yet. Use Add claim to record a purchase and its receipt.</p>
                ) : (
                    <div className="trips-table-wrap">
                        <table className="data-table trips-expenses-table tax-relief-table">
                            <thead>
                                <tr>
                                    <th className="tax-relief-col-date">Date</th>
                                    <th>Item</th>
                                    <th className="trips-col-num tax-relief-col-amount">Amount</th>
                                    <th className="tax-relief-col-receipts">Receipts</th>
                                    <th className="actions-col" />
                                </tr>
                            </thead>
                            <tbody>
                                {visibleClaims.map((claim) => (
                                    <tr key={claim.id}>
                                        <td>{formatDate(claim.date)}</td>
                                        <td>
                                            <div>{claim.description}</div>
                                            <div className="muted tax-relief-sub">
                                                {categoryById.get(claim.category)?.label ?? claim.category}
                                                {claim.notes ? ` · ${claim.notes}` : ''}
                                            </div>
                                        </td>
                                        <td className="trips-col-num">{formatMYR(claim.amount)}</td>
                                        <td>
                                            <div className="tax-relief-receipts">
                                                {claim.receipts.map((r) => (
                                                    <span key={r.id} className="tax-relief-receipt">
                                                        <a
                                                            href={taxReliefReceiptUrl(r.id)}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            title={`${r.fileName} · ${formatBytes(r.sizeBytes)}`}
                                                        >
                                                            {r.fileName}
                                                        </a>
                                                        <button
                                                            type="button"
                                                            className="tax-relief-receipt-remove"
                                                            aria-label={`Remove ${r.fileName}`}
                                                            onClick={() => setReceiptToDelete(r)}
                                                            disabled={saving}
                                                        >
                                                            ×
                                                        </button>
                                                    </span>
                                                ))}
                                                {claim.receipts.length === 0 &&
                                                    (categoryById.get(claim.category)?.receipt === false ? (
                                                        <span className="muted tax-relief-sub">Not needed</span>
                                                    ) : (
                                                        <span className="tax-relief-missing">Missing</span>
                                                    ))}
                                                <button
                                                    type="button"
                                                    className="btn-link"
                                                    onClick={() => startAttach(claim.id)}
                                                    disabled={saving}
                                                >
                                                    + Attach
                                                </button>
                                            </div>
                                        </td>
                                        <td className="actions-col">
                                            <RowActions
                                                onEdit={() => openEdit(claim)}
                                                onDelete={() => void handleDeleteClaim(claim)}
                                                deleteLabel={claim.description}
                                                confirmMessage={`"${claim.description}" and its ${claim.receipts.length} receipt(s) will be permanently removed.`}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <p className="muted tax-relief-footnote">
                Limits follow LHDN individual reliefs for YA {Math.min(Math.max(year, 2025), 2026)}. Check the
                latest Budget before filing; keep receipts for 7 years.
            </p>

            <input
                ref={attachInputRef}
                type="file"
                multiple
                accept={ACCEPTED_TYPES.join(',')}
                hidden
                onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = '';
                    void handleAttachFiles(files);
                }}
            />

            <ConfirmDialog
                open={receiptToDelete != null}
                title="Remove receipt?"
                message={`"${receiptToDelete?.fileName ?? ''}" will be permanently removed.`}
                confirmLabel="Remove"
                onConfirm={() => void confirmDeleteReceipt()}
                onCancel={() => setReceiptToDelete(null)}
            />
        </section>
    );
}
