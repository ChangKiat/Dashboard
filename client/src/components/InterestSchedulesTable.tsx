import { useMemo, useState } from 'react';

import type { InterestScheduleConfig, InterestFrequency } from '../api';
import {
    createInterestSchedule,
    deleteInterestSchedule,
    updateInterestSchedule,
} from '../api';
import { usePagination } from '../hooks/usePagination';
import PaymentMethodSelect from './PaymentMethodSelect';
import RecordModal from './RecordModal';
import RowActions from './RowActions';
import TablePagination from './TablePagination';

type ModalMode = 'closed' | 'create' | 'edit';

function formatFrequency(row: InterestScheduleConfig): string {
    if (row.frequency === 'daily') return 'Daily';
    return `Monthly (day ${row.dayOfMonth ?? '—'})`;
}

function formatRateOrFixed(row: InterestScheduleConfig, formatAmount: (n: number) => string): string {
    if (row.fixedAmount != null && row.fixedAmount > 0) {
        return `${formatAmount(row.fixedAmount)} fixed`;
    }
    if (row.annualRatePct != null && row.annualRatePct > 0) {
        return `${row.annualRatePct}% p.a.`;
    }
    return '—';
}

interface Props {
    rows: InterestScheduleConfig[];
    formatAmount: (amount: number) => string;
    onChanged: () => void;
}

export default function InterestSchedulesTable({ rows, formatAmount, onChanged }: Props) {
    const [accountFilter, setAccountFilter] = useState('');
    const [modalMode, setModalMode] = useState<ModalMode>('closed');
    const [editingEntry, setEditingEntry] = useState<InterestScheduleConfig | null>(null);
    const [form, setForm] = useState({
        description: '',
        paymentMethod: '',
        frequency: 'daily' as InterestFrequency,
        dayOfMonth: '1',
        annualRatePct: '',
        fixedAmount: '',
    });
    const [saving, setSaving] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const accountOptions = useMemo(
        () =>
            [...new Set(rows.map((r) => r.paymentMethod))].sort((a, b) =>
                a.localeCompare(b, 'en-MY', { sensitivity: 'base' })
            ),
        [rows]
    );

    const filteredRows = useMemo(() => {
        if (!accountFilter) return rows;
        return rows.filter((r) => r.paymentMethod === accountFilter);
    }, [rows, accountFilter]);

    const sortedRows = useMemo(
        () =>
            [...filteredRows].sort((a, b) =>
                a.description.localeCompare(b.description, 'en-MY', { sensitivity: 'base' })
            ),
        [filteredRows]
    );
    const { page, setPage, pageItems, totalPages, totalItems } = usePagination(sortedRows);

    const openCreate = () => {
        setModalMode('create');
        setEditingEntry(null);
        setForm({
            description: '',
            paymentMethod: '',
            frequency: 'daily',
            dayOfMonth: '1',
            annualRatePct: '',
            fixedAmount: '',
        });
        setModalError(null);
    };

    const openEdit = (row: InterestScheduleConfig) => {
        setModalMode('edit');
        setEditingEntry(row);
        setForm({
            description: row.description,
            paymentMethod: row.paymentMethod,
            frequency: row.frequency,
            dayOfMonth: String(row.dayOfMonth ?? 1),
            annualRatePct: row.annualRatePct != null ? String(row.annualRatePct) : '',
            fixedAmount: row.fixedAmount != null ? String(row.fixedAmount) : '',
        });
        setModalError(null);
    };

    const closeModal = () => {
        setModalMode('closed');
        setEditingEntry(null);
        setModalError(null);
    };

    const handleSave = async () => {
        const annualRatePct = form.annualRatePct.trim()
            ? parseFloat(form.annualRatePct)
            : null;
        const fixedAmount = form.fixedAmount.trim() ? parseFloat(form.fixedAmount) : null;
        const dayOfMonth = parseInt(form.dayOfMonth, 10);

        const hasRate = annualRatePct != null && Number.isFinite(annualRatePct) && annualRatePct > 0;
        const hasFixed = fixedAmount != null && Number.isFinite(fixedAmount) && fixedAmount > 0;

        if (
            !form.description.trim() ||
            !form.paymentMethod.trim() ||
            (!hasRate && !hasFixed)
        ) {
            setModalError('Description, account, and rate or fixed amount are required.');
            return;
        }

        if (form.frequency === 'monthly') {
            if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
                setModalError('Day of month must be 1–31 for monthly schedules.');
                return;
            }
        }

        setSaving(true);
        setModalError(null);
        try {
            const payload = {
                description: form.description.trim(),
                paymentMethod: form.paymentMethod.trim(),
                frequency: form.frequency,
                dayOfMonth: form.frequency === 'monthly' ? dayOfMonth : null,
                annualRatePct: hasRate ? annualRatePct : null,
                fixedAmount: hasFixed ? fixedAmount : null,
                currency: 'MYR',
            };
            if (modalMode === 'create') {
                await createInterestSchedule(payload);
            } else if (editingEntry) {
                await updateInterestSchedule(editingEntry.id, payload);
            }
            closeModal();
            onChanged();
        } catch (err) {
            setModalError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (row: InterestScheduleConfig) => {
        setActionError(null);
        try {
            await deleteInterestSchedule(row.id);
            onChanged();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to delete');
        }
    };

    return (
        <div className="card expenses-interest-schedules">
            <div className="section-header-row">
                <h3>Interest schedules</h3>
                <div className="fixed-expense-filters">
                    <select
                        aria-label="Filter by account"
                        value={accountFilter}
                        onChange={(e) => setAccountFilter(e.target.value)}
                    >
                        <option value="">All accounts</option>
                        {accountOptions.map((account) => (
                            <option key={account} value={account}>
                                {account}
                            </option>
                        ))}
                    </select>
                </div>
                <button type="button" className="btn-add" onClick={openCreate}>
                    + Add
                </button>
            </div>
            {actionError && <p className="error">{actionError}</p>}
            <div className="table-scroll">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Description</th>
                            <th>Account</th>
                            <th>Frequency</th>
                            <th>Rate / Fixed</th>
                            <th className="actions-col">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="muted">
                                    No interest schedules configured
                                </td>
                            </tr>
                        ) : sortedRows.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="muted">
                                    No schedules match this filter
                                </td>
                            </tr>
                        ) : (
                            pageItems.map((row) => (
                                <tr key={row.id}>
                                    <td>{row.description}</td>
                                    <td>{row.paymentMethod}</td>
                                    <td>{formatFrequency(row)}</td>
                                    <td>{formatRateOrFixed(row, formatAmount)}</td>
                                    <td>
                                        <RowActions
                                            onEdit={() => openEdit(row)}
                                            onDelete={() => handleDelete(row)}
                                            deleteLabel={`"${row.description}"`}
                                        />
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            <TablePagination
                page={page}
                totalPages={totalPages}
                totalItems={totalItems}
                onPageChange={setPage}
            />
            <RecordModal
                title={modalMode === 'create' ? 'Add interest schedule' : 'Edit interest schedule'}
                open={modalMode !== 'closed'}
                saving={saving}
                error={modalError}
                onClose={closeModal}
                onSave={handleSave}
            >
                <div className="form-field">
                    <label htmlFor="is-description">Description</label>
                    <input
                        id="is-description"
                        type="text"
                        value={form.description}
                        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                        placeholder="e.g. TnG GO+ interest"
                    />
                </div>
                <div className="form-field">
                    <label htmlFor="is-account">Account</label>
                    <PaymentMethodSelect
                        id="is-account"
                        value={form.paymentMethod}
                        excludeTypes={['credit', 'investment']}
                        emptyLabel="Select account"
                        onChange={(paymentMethod) => setForm((f) => ({ ...f, paymentMethod }))}
                    />
                </div>
                <div className="form-field">
                    <label htmlFor="is-frequency">Frequency</label>
                    <select
                        id="is-frequency"
                        value={form.frequency}
                        onChange={(e) =>
                            setForm((f) => ({
                                ...f,
                                frequency: e.target.value as InterestFrequency,
                            }))
                        }
                    >
                        <option value="daily">Daily</option>
                        <option value="monthly">Monthly</option>
                    </select>
                </div>
                {form.frequency === 'monthly' && (
                    <div className="form-field">
                        <label htmlFor="is-day">Day of month</label>
                        <input
                            id="is-day"
                            type="number"
                            min={1}
                            max={31}
                            value={form.dayOfMonth}
                            onChange={(e) => setForm((f) => ({ ...f, dayOfMonth: e.target.value }))}
                        />
                    </div>
                )}
                <div className="form-field">
                    <label htmlFor="is-rate">Annual rate (%)</label>
                    <input
                        id="is-rate"
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.annualRatePct}
                        onChange={(e) => setForm((f) => ({ ...f, annualRatePct: e.target.value }))}
                        placeholder="e.g. 3.5"
                    />
                </div>
                <div className="form-field">
                    <label htmlFor="is-fixed">Fixed amount override (optional)</label>
                    <input
                        id="is-fixed"
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.fixedAmount}
                        onChange={(e) => setForm((f) => ({ ...f, fixedAmount: e.target.value }))}
                        placeholder="Leave blank to use rate × balance"
                    />
                </div>
            </RecordModal>
        </div>
    );
}
