import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { TaxReliefCategory, TaxReliefClaim, TaxReliefOverview, TaxReliefReceipt } from '../api';
import type { TaxReliefDocument, TaxReliefDocumentKind } from '../api';
import {
    createTaxReliefClaim,
    deleteTaxReliefClaim,
    deleteTaxReliefDocument,
    deleteTaxReliefReceipt,
    fetchTaxReliefOverview,
    fetchTaxReliefDocuments,
    taxReliefDocumentUrl,
    taxReliefReceiptUrl,
    updateTaxReliefClaim,
    uploadTaxReliefReceipt,
    uploadTaxReliefDocument,
} from '../api';
import { useFormatMYR } from '../hooks/useAmountVisibility';
import { useRefreshSignal } from '../hooks/useRefreshSignal';
import ConfirmDialog from './ConfirmDialog';
import { ReceiptIcon, ShieldIcon, WalletIcon } from './icons';
import RecordModal from './RecordModal';
import RowActions from './RowActions';
import SummaryCard from './SummaryCard';
import './TaxReliefSection.css';

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

const DOCUMENT_KINDS = [
    { id: 'ea', label: 'EA Form' },
    { id: 'lhdn', label: 'Official LHDN PDF' },
] as const;

function TaxReliefDocuments({ year }: { year: number }) {
    const [documents, setDocuments] = useState<TaxReliefDocument[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<TaxReliefDocumentKind | 'delete' | null>(null);
    const [documentToDelete, setDocumentToDelete] = useState<TaxReliefDocument | null>(null);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let active = true;
        fetchTaxReliefDocuments(year).then((files) => {
            if (active) setDocuments(files);
        }).catch((err: Error) => {
            if (active) setError(err.message);
        });
        return () => { active = false; };
    }, [year, attempt]);

    async function upload(kind: TaxReliefDocumentKind, file: File) {
        setError(null);
        if (file.size > MAX_RECEIPT_BYTES) {
            setError('Choose a PDF up to 10 MB.');
            return;
        }
        setBusy(kind);
        try {
            const document = await uploadTaxReliefDocument(year, kind, file);
            setDocuments((files) => [...(files ?? []), document]);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to upload PDF');
        } finally {
            setBusy(null);
        }
    }

    async function remove(document: TaxReliefDocument) {
        setDocumentToDelete(null);
        setError(null);
        setBusy('delete');
        try {
            await deleteTaxReliefDocument(year, document.id);
            setDocuments((files) => files?.filter((file) => file.id !== document.id) ?? null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete PDF');
        } finally {
            setBusy(null);
        }
    }

    return (
        <section className="card tax-documents" aria-labelledby="tax-documents-title">
            <div className="tax-card-header">
                <div>
                    <h3 id="tax-documents-title">Tax documents for {year}</h3>
                    <p className="budgets-card-sub">PDF · Up to 10 MB per file</p>
                </div>
            </div>
            {error && (
                <div className="tax-document-card tax-document-header">
                    <p className="error" role="alert">{error}</p>
                    {!documents && (
                        <button type="button" className="btn-secondary" onClick={() => {
                            setError(null);
                            setAttempt((previous) => previous + 1);
                        }}>Retry</button>
                    )}
                </div>
            )}
            {!documents && !error && <p className="muted" role="status">Loading tax documents…</p>}
            {documents && (
                <div className="tax-documents-grid">
                    {DOCUMENT_KINDS.map(({ id, label }) => {
                        const files = documents.filter((file) => file.kind === id);
                        return (
                            <div className="tax-document-card" key={id}>
                                <div className="tax-document-header">
                                    <h4>{label}</h4>
                                    <label className="tax-document-upload">
                                        <input type="file" accept=".pdf,application/pdf" disabled={busy !== null}
                                            aria-label={`Upload ${label}`} onChange={(event) => {
                                                const file = event.currentTarget.files?.[0];
                                                event.currentTarget.value = '';
                                                if (file) void upload(id, file);
                                            }} />
                                        <span className="btn-secondary">{busy === id ? 'Uploading…' : 'Upload PDF'}</span>
                                    </label>
                                </div>
                                {files.length === 0 ? <p className="muted">No PDFs uploaded</p> : (
                                    <ul className="tax-document-list">
                                        {files.map((file) => (
                                            <li key={file.id}>
                                                <a href={taxReliefDocumentUrl(year, file.id)} title={file.fileName}
                                                    aria-label={`Download ${file.fileName}`}>{file.fileName}</a>
                                                <button type="button" className="tax-relief-receipt-remove"
                                                    disabled={busy !== null} aria-label={`Delete ${file.fileName}`}
                                                    onClick={() => setDocumentToDelete(file)}>Delete</button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            {documentToDelete && (
                <ConfirmDialog open title="Delete tax document?"
                    message={`Remove ${documentToDelete.fileName} from assessment year ${year}?`}
                    onConfirm={() => void remove(documentToDelete)} onCancel={() => setDocumentToDelete(null)} />
            )}
        </section>
    );
}

export default function TaxReliefSection() {
    const formatMYR = useFormatMYR();
    const [year, setYear] = useState(() => parseInt(todayIsoKl().slice(0, 4), 10));
    const selectedYear = useRef(year);
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
    const [missingOnly, setMissingOnly] = useState(false);
    const [query, setQuery] = useState('');
    const [receiptToDelete, setReceiptToDelete] = useState<TaxReliefReceipt | null>(null);
    const attachInputRef = useRef<HTMLInputElement>(null);
    const [attachClaimId, setAttachClaimId] = useState<number | null>(null);

    const loadData = useCallback(async () => {
        const overview = await fetchTaxReliefOverview(year);
        if (selectedYear.current === year) setData(overview);
    }, [year]);

    useRefreshSignal(() =>
        loadData().catch((err) => {
            if (selectedYear.current === year) setError(err instanceof Error ? err.message : 'Failed to refresh');
        })
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

    const isMissingReceipt = useCallback(
        (claim: TaxReliefClaim) => claim.receipts.length === 0 && categoryById.get(claim.category)?.receipt !== false,
        [categoryById]
    );

    const visibleClaims = useMemo(() => {
        const term = query.trim().toLowerCase();
        return (data?.claims ?? []).filter(
            (c) =>
                (!categoryFilter || c.category === categoryFilter) &&
                (!missingOnly || isMissingReceipt(c)) &&
                [c.description, c.notes, categoryById.get(c.category)?.label, formatDate(c.date)].some((value) =>
                    value?.toLowerCase().includes(term)
                )
        );
    }, [data?.claims, categoryFilter, missingOnly, query, categoryById, isMissingReceipt]);

    const visibleCategories = useMemo(
        () => (data?.byCategory ?? []).filter((c) => showAllCategories || c.claimCount > 0),
        [data?.byCategory, showAllCategories]
    );

    const yearOptions = useMemo(() => {
        const current = parseInt(todayIsoKl().slice(0, 4), 10);
        const calendarYears = Array.from({ length: current - 2023 + 1 }, (_, index) => current - index);
        const savedYears = (data?.years ?? []).filter((savedYear) => savedYear >= 2023);
        return [...new Set([...calendarYears, ...savedYears, year])].sort((a, b) => b - a);
    }, [data?.years, year]);

    const closeForm = () => {
        setShowForm(false);
        setEditingId(null);
        setFormFiles([]);
    };

    const clearFilters = () => {
        setCategoryFilter(null);
        setMissingOnly(false);
        setQuery('');
    };

    const selectYear = (next: number) => {
        if (next === year) return;
        closeForm();
        setActionError(null);
        clearFilters();
        setLoading(true);
        selectedYear.current = next;
        setYear(next);
    };

    const openCreate = () => {
        setEditingId(null);
        setForm({ ...emptyForm(year), ...(categoryFilter ? { category: categoryFilter } : {}) });
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
        if (saving) return;
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
        let claimId = editingId;
        try {
            const fields = {
                date: form.date,
                category: form.category,
                description: form.description.trim(),
                amount,
                notes: form.notes.trim() || null,
            };
            if (claimId != null) {
                await updateTaxReliefClaim(claimId, fields);
            } else {
                claimId = (await createTaxReliefClaim(fields)).id;
            }
            for (const file of formFiles) {
                await uploadTaxReliefReceipt(claimId, file);
                // A retry after a failed upload must not send this one again.
                setFormFiles((files) => files.filter((other) => other !== file));
            }
            closeForm();
            clearFilters();
            const claimYear = parseInt(form.date.slice(0, 4), 10);
            if (claimYear !== year) {
                selectedYear.current = claimYear;
                setYear(claimYear);
            } else await loadData();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to save claim');
            // The claim may already be saved: edit it on the next try instead of adding it twice.
            if (claimId != null) setEditingId(claimId);
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
        <div className="page-toolbar">
            <div className="page-toolbar-group">
                <span className="muted tax-year-label">Year of assessment</span>
                <div className="pill-group" role="group" aria-label="Year of assessment">
                    {[...yearOptions].reverse().map((y) => (
                        <button
                            key={y}
                            type="button"
                            className={y === year ? 'pill-group-btn active' : 'pill-group-btn'}
                            aria-pressed={y === year}
                            disabled={saving || loading}
                            onClick={() => selectYear(y)}
                        >
                            {y}
                        </button>
                    ))}
                </div>
            </div>
            <div className="page-toolbar-group">
                <button type="button" className="btn-primary" onClick={openCreate} disabled={saving || loading || !data}>
                    + Add claim
                </button>
            </div>
        </div>
    );

    if (loading && !data) return <section className="panel">{toolbar}<p className="muted">Loading tax relief…</p></section>;
    if (error || !data) {
        return (
            <section className="panel">
                {toolbar}
                <p className="error" role="alert">
                    {error ?? 'Failed to load'}{' '}
                    <button
                        type="button"
                        className="btn-link"
                        onClick={() => {
                            setError(null);
                            void loadData().catch((err: Error) => setError(err.message));
                        }}
                    >
                        Retry
                    </button>
                </p>
            </section>
        );
    }

    if (loading || data.year !== year) return <section className="panel">{toolbar}<p className="muted">Loading tax relief…</p></section>;

    const { summary } = data;
    const missing = summary.missingReceiptCount;
    const filtered = Boolean(categoryFilter || missingOnly || query.trim());

    // How much of the picked category's limit is still free, not counting the claim being edited.
    let limitNote: string | null = null;
    if (selectedCategory?.limit != null && form.date.startsWith(String(year))) {
        const claimed = data.byCategory.find((c) => c.category === form.category)?.claimed ?? 0;
        const original = data.claims.find((c) => c.id === editingId);
        const left = selectedCategory.limit - claimed + (original?.category === form.category ? original.amount : 0);
        limitNote =
            left > 0
                ? `${formatMYR(left)} of ${formatMYR(selectedCategory.limit)} still claimable`
                : `The ${formatMYR(selectedCategory.limit)} limit is already reached`;
    }

    return (
        <section className="panel">
            {toolbar}
            <div className="expenses-layout">
                {year !== 2025 && year !== 2026 && (
                    <p className="muted tax-note">Relief estimates use the {year < 2025 ? 2025 : 2026} rules for reference.</p>
                )}

                <div className="budgets-summary-grid">
                    <SummaryCard
                        tone="income"
                        icon={<ShieldIcon size={26} />}
                        label="Relief claimable"
                        value={formatMYR(summary.totalEligible)}
                        sub={`Includes ${formatMYR(summary.individualRelief)} individual relief`}
                    />
                    <SummaryCard
                        tone="spend"
                        icon={<WalletIcon size={26} />}
                        label="Total spent"
                        value={formatMYR(summary.totalClaimed)}
                        sub={`${summary.claimCount} ${summary.claimCount === 1 ? 'claim' : 'claims'}`}
                    />
                    <SummaryCard
                        tone="net"
                        icon={<ReceiptIcon size={26} />}
                        label="Missing receipts"
                        value={String(missing)}
                        variant={missing > 0 ? 'warning' : 'default'}
                        sub={`${summary.receiptCount} attached${missing > 0 ? ' · Add the rest before filing' : ''}`}
                    />
                </div>

                {actionError && !showForm && <p className="error" role="alert">{actionError}</p>}

                <section className="card" aria-labelledby="tax-claims-title">
                    <div className="variable-txns-header">
                        <div>
                            <h3 id="tax-claims-title">
                                {categoryFilter ? `Claims · ${categoryById.get(categoryFilter)?.label}` : 'Claims'}
                            </h3>
                            <p className="budgets-card-sub">
                                {visibleClaims.length} {visibleClaims.length === 1 ? 'claim' : 'claims'} ·{' '}
                                {formatMYR(visibleClaims.reduce((total, c) => total + c.amount, 0))}
                            </p>
                        </div>
                        {data.claims.length > 0 && (
                            <div className="variable-txns-tools">
                                {(missing > 0 || missingOnly) && (
                                    <button
                                        type="button"
                                        className={missingOnly ? 'btn-primary' : 'btn-secondary'}
                                        aria-pressed={missingOnly}
                                        onClick={() => setMissingOnly((v) => !v)}
                                    >
                                        Missing receipts ({missing})
                                    </button>
                                )}
                                {filtered && (
                                    <button type="button" className="btn-link" onClick={clearFilters}>
                                        Clear filters
                                    </button>
                                )}
                                <input
                                    type="search"
                                    aria-label="Search claims"
                                    placeholder="Search claims"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                />
                            </div>
                        )}
                    </div>

                    {visibleClaims.length === 0 ? (
                        <div className="tax-empty">
                            <p className="muted">
                                {data.claims.length === 0
                                    ? `No claims for ${year} yet. Add a purchase and attach its receipt.`
                                    : 'No claims match this filter.'}
                            </p>
                            <button type="button" className="btn-secondary" onClick={openCreate} disabled={saving}>
                                + Add claim
                            </button>
                        </div>
                    ) : (
                        <ul className="variable-txn-list">
                            {visibleClaims.map((claim) => (
                                <li key={claim.id} className="tax-claim">
                                    <span
                                        aria-hidden="true"
                                        className={`category-icon category-icon--sm category-icon--${isMissingReceipt(claim) ? 'amber' : 'teal'}`}
                                    >
                                        <ReceiptIcon size={16} />
                                    </span>
                                    <div className="tax-claim-main">
                                        <span className="tax-claim-title">{claim.description}</span>
                                        <span className="tax-claim-meta">
                                            {formatDate(claim.date)} · {categoryById.get(claim.category)?.label ?? claim.category}
                                            {claim.notes ? ` · ${claim.notes}` : ''}
                                        </span>
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
                                                (isMissingReceipt(claim) ? (
                                                    <span className="budget-badge budget-badge--warning">Receipt missing</span>
                                                ) : (
                                                    <span className="tax-claim-meta">No receipt needed</span>
                                                ))}
                                            <button
                                                type="button"
                                                className="btn-add"
                                                aria-label={`Attach a receipt to ${claim.description}`}
                                                onClick={() => startAttach(claim.id)}
                                                disabled={saving}
                                            >
                                                + Attach
                                            </button>
                                        </div>
                                    </div>
                                    <span className="variable-txn-amount tax-claim-amount">{formatMYR(claim.amount)}</span>
                                    <RowActions
                                        onEdit={() => openEdit(claim)}
                                        onDelete={() => void handleDeleteClaim(claim)}
                                        deleteLabel={claim.description}
                                        confirmTitle="Delete claim?"
                                        confirmMessage={`"${claim.description}" and its ${claim.receipts.length} receipt(s) will be permanently removed.`}
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section className="card" aria-labelledby="tax-categories-title">
                    <div className="tax-card-header">
                        <div>
                            <h3 id="tax-categories-title">Relief by category</h3>
                            <p className="budgets-card-sub">Select a category to see only its claims.</p>
                        </div>
                        <button type="button" className="btn-link" onClick={() => setShowAllCategories((v) => !v)}>
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
                                            {c.limit != null && <span className="muted"> / {formatMYR(c.limit)}</span>}
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
                </section>

                <TaxReliefDocuments key={year} year={year} />

                <p className="muted tax-note">
                    Limits follow LHDN individual reliefs for YA {Math.min(Math.max(year, 2025), 2026)}. Check the
                    latest Budget before filing; keep receipts for 7 years.
                </p>
            </div>

            <RecordModal
                title={editingId != null ? 'Edit claim' : 'Add claim'}
                open={showForm}
                saving={saving}
                error={actionError}
                onClose={closeForm}
                onSave={() => void handleSubmit()}
            >
                <form
                    className="tax-form"
                    noValidate
                    onSubmit={(e) => {
                        e.preventDefault();
                        void handleSubmit();
                    }}
                >
                    <div className="form-field">
                        <label htmlFor="tax-category">Category</label>
                        <select
                            id="tax-category"
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
                        {selectedCategory && (
                            <span className="muted form-hint">
                                {selectedCategory.hint}
                                {!selectedCategory.receipt && ' · No receipt needed'}
                            </span>
                        )}
                        {limitNote && <span className="form-hint tax-limit-note">{limitNote}</span>}
                    </div>
                    <div className="form-field">
                        <label htmlFor="tax-description">Description</label>
                        <input
                            id="tax-description"
                            autoFocus
                            type="text"
                            value={form.description}
                            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                            placeholder="e.g. MPH Bookstore, Fitness First membership"
                        />
                    </div>
                    <div className="tax-form-row">
                        <div className="form-field">
                            <label htmlFor="tax-date">Date</label>
                            <input
                                id="tax-date"
                                type="date"
                                value={form.date}
                                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                            />
                        </div>
                        <div className="form-field">
                            <label htmlFor="tax-amount">Amount (RM)</label>
                            <input
                                id="tax-amount"
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step={0.01}
                                value={form.amount}
                                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                            />
                        </div>
                    </div>
                    <div className="form-field">
                        <label htmlFor="tax-notes">Notes</label>
                        <input
                            id="tax-notes"
                            type="text"
                            value={form.notes}
                            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                            placeholder="Optional"
                        />
                    </div>
                    <div className="form-field">
                        <label htmlFor="tax-receipts">{editingId != null ? 'Add more receipts' : 'Receipts'}</label>
                        <input
                            id="tax-receipts"
                            type="file"
                            multiple
                            disabled={saving}
                            accept={ACCEPTED_TYPES.join(',')}
                            onChange={(e) => setFormFiles(Array.from(e.target.files ?? []))}
                        />
                        <span className="muted form-hint">PDF or image, up to 10 MB each.</span>
                    </div>
                    {/* Lets Enter save from any field. */}
                    <button type="submit" hidden />
                </form>
            </RecordModal>

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
