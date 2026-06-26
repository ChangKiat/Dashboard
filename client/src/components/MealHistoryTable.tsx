import { useCallback, useEffect, useMemo, useState } from 'react';

import type { MealEntry } from '../api';
import { createMeal, deleteMeal, updateMeal } from '../api';
import { usePagination } from '../hooks/usePagination';
import {
    formatCell,
    parseOptionalNumber,
    parseRequiredNumber,
} from '../utils/tableFormat';
import HealthEntryDetailModal from './HealthEntryDetailModal';
import RecordModal from './RecordModal';
import RowActions from './RowActions';
import TablePagination from './TablePagination';

type ModalMode = 'closed' | 'create' | 'edit';

interface Props {
    entries: MealEntry[];
    onChanged: () => void;
    compact?: boolean;
    defaultDate?: string;
}

const UNCATEGORIZED_FILTER = '__uncategorized__';

function formatMealSummary(entry: MealEntry): string {
    const cal = entry.calories != null ? `${entry.calories} kcal` : '— kcal';
    return `${cal} · ${entry.proteinG}g protein`;
}

export default function MealHistoryTable({
    entries,
    onChanged,
    compact = false,
    defaultDate,
}: Props) {
    const [mealTypeFilter, setMealTypeFilter] = useState('all');
    const [viewing, setViewing] = useState<MealEntry | null>(null);
    const [modalMode, setModalMode] = useState<ModalMode>('closed');
    const [editingEntry, setEditingEntry] = useState<MealEntry | null>(null);
    const [form, setForm] = useState({
        date: '',
        mealType: '',
        description: '',
        proteinG: '',
        carbsG: '',
        fatG: '',
        calories: '',
    });
    const [saving, setSaving] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const mealTypeOptions = useMemo(() => {
        const types = entries
            .map((e) => e.mealType)
            .filter((t): t is string => t != null && t.trim() !== '');
        return [...new Set(types)].sort();
    }, [entries]);

    const hasUncategorized = useMemo(
        () => entries.some((e) => e.mealType == null || e.mealType.trim() === ''),
        [entries]
    );

    const filteredEntries = useMemo(() => {
        if (mealTypeFilter === 'all') return entries;
        if (mealTypeFilter === UNCATEGORIZED_FILTER) {
            return entries.filter((e) => e.mealType == null || e.mealType.trim() === '');
        }
        return entries.filter((e) => e.mealType === mealTypeFilter);
    }, [entries, mealTypeFilter]);

    const { page, setPage, pageItems, totalPages, totalItems } = usePagination(filteredEntries, {
        pageSize: compact ? 5 : 10,
    });

    useEffect(() => {
        setMealTypeFilter('all');
    }, [entries]);

    const openCreate = useCallback(() => {
        setModalMode('create');
        setEditingEntry(null);
        setForm({
            date: defaultDate ?? '',
            mealType: '',
            description: '',
            proteinG: '',
            carbsG: '',
            fatG: '',
            calories: '',
        });
        setModalError(null);
    }, [defaultDate]);

    const openEdit = (entry: MealEntry) => {
        setModalMode('edit');
        setEditingEntry(entry);
        setForm({
            date: entry.date,
            mealType: entry.mealType ?? '',
            description: entry.description,
            proteinG: String(entry.proteinG),
            carbsG: entry.carbsG != null ? String(entry.carbsG) : '',
            fatG: entry.fatG != null ? String(entry.fatG) : '',
            calories: entry.calories != null ? String(entry.calories) : '',
        });
        setModalError(null);
    };

    const closeModal = () => {
        setModalMode('closed');
        setEditingEntry(null);
        setModalError(null);
    };

    const handleSave = async () => {
        if (!form.date || !form.description.trim()) {
            setModalError('Date and description are required.');
            return;
        }
        const proteinG = parseRequiredNumber(form.proteinG);
        if (proteinG == null) {
            setModalError('Protein must be a non-negative number.');
            return;
        }
        setSaving(true);
        setModalError(null);
        try {
            const payload = {
                date: form.date,
                mealType: form.mealType.trim() || null,
                description: form.description.trim(),
                proteinG,
                carbsG: parseOptionalNumber(form.carbsG),
                fatG: parseOptionalNumber(form.fatG),
                calories: parseOptionalNumber(form.calories),
            };
            if (modalMode === 'create') {
                await createMeal(payload);
            } else if (editingEntry) {
                await updateMeal(editingEntry.id, payload);
            }
            closeModal();
            onChanged();
        } catch (err) {
            setModalError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (entry: MealEntry) => {
        setActionError(null);
        try {
            await deleteMeal(entry.id);
            onChanged();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to delete');
        }
    };

    if (entries.length === 0 && defaultDate == null) {
        return <p className="muted">{compact ? 'No meals logged this day.' : 'No meals logged in this range.'}</p>;
    }

    const displayEntries = pageItems;

    const recordModal = (
        <RecordModal
            title={modalMode === 'create' ? 'Add meal' : 'Edit meal'}
            open={modalMode !== 'closed'}
            saving={saving}
            error={modalError}
            onClose={closeModal}
            onSave={handleSave}
        >
            <div className="form-field">
                <label htmlFor="meal-date">Date</label>
                <input
                    id="meal-date"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
            </div>
            <div className="form-field">
                <label htmlFor="meal-type">Meal type</label>
                <input
                    id="meal-type"
                    type="text"
                    placeholder="e.g. breakfast, lunch"
                    value={form.mealType}
                    onChange={(e) => setForm((f) => ({ ...f, mealType: e.target.value }))}
                />
            </div>
            <div className="form-field">
                <label htmlFor="meal-description">Description</label>
                <input
                    id="meal-description"
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
            </div>
            <div className="form-field">
                <label htmlFor="meal-protein">Protein (g)</label>
                <input
                    id="meal-protein"
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.proteinG}
                    onChange={(e) => setForm((f) => ({ ...f, proteinG: e.target.value }))}
                />
            </div>
            <div className="form-field">
                <label htmlFor="meal-carbs">Carbs (g)</label>
                <input
                    id="meal-carbs"
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.carbsG}
                    onChange={(e) => setForm((f) => ({ ...f, carbsG: e.target.value }))}
                />
            </div>
            <div className="form-field">
                <label htmlFor="meal-fat">Fat (g)</label>
                <input
                    id="meal-fat"
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.fatG}
                    onChange={(e) => setForm((f) => ({ ...f, fatG: e.target.value }))}
                />
            </div>
            <div className="form-field">
                <label htmlFor="meal-calories">Calories</label>
                <input
                    id="meal-calories"
                    type="number"
                    min="0"
                    step="1"
                    value={form.calories}
                    onChange={(e) => setForm((f) => ({ ...f, calories: e.target.value }))}
                />
            </div>
        </RecordModal>
    );

    if (compact) {
        if (filteredEntries.length === 0 && entries.length > 0) {
            return <p className="muted">No meals match this type.</p>;
        }

        return (
            <>
                {defaultDate != null && (
                    <div className="section-header-row">
                        <h4>Meals</h4>
                        <button type="button" className="btn-add" onClick={openCreate}>
                            + Add
                        </button>
                    </div>
                )}
                {actionError && <p className="error">{actionError}</p>}
                {filteredEntries.length === 0 ? (
                    <p className="muted">No meals logged this day.</p>
                ) : (
                    <>
                        <ul className="day-entry-list">
                            {displayEntries.map((entry) => (
                                <li key={entry.id} className="day-entry-card">
                                    <button
                                        type="button"
                                        className="day-entry-main day-entry-main--clickable"
                                        onClick={() => setViewing(entry)}
                                    >
                                        <span className="day-entry-title">{entry.description}</span>
                                        <span className="day-entry-sub">
                                            {entry.mealType ? `${entry.mealType} · ` : ''}
                                            {formatMealSummary(entry)}
                                        </span>
                                    </button>
                                    <RowActions
                                        onEdit={() => openEdit(entry)}
                                        onDelete={() => handleDelete(entry)}
                                        deleteLabel={`"${entry.description}"`}
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
                {viewing && (
                    <HealthEntryDetailModal
                        type="meal"
                        entry={viewing}
                        onClose={() => setViewing(null)}
                        onEdit={() => {
                            const entry = viewing;
                            setViewing(null);
                            openEdit(entry);
                        }}
                        onDelete={async () => {
                            await handleDelete(viewing);
                            setViewing(null);
                        }}
                    />
                )}
                {recordModal}
            </>
        );
    }

    return (
        <>
            {actionError && <p className="error">{actionError}</p>}
            <div className="history-log-table">
                <div className="transactions-toolbar">
                    <select
                        className="chart-select"
                        value={mealTypeFilter}
                        onChange={(e) => setMealTypeFilter(e.target.value)}
                        aria-label="Filter by meal type"
                    >
                        <option value="all">All meal types</option>
                        {hasUncategorized && (
                            <option value={UNCATEGORIZED_FILTER}>Uncategorized</option>
                        )}
                        {mealTypeOptions.map((mealType) => (
                            <option key={mealType} value={mealType}>
                                {mealType}
                            </option>
                        ))}
                    </select>
                </div>
                {filteredEntries.length === 0 ? (
                    <p className="muted">No meals match this type.</p>
                ) : (
                    <>
                        <div className="table-scroll">
                            <table className="data-table data-table--meals">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Type</th>
                                        <th>Description</th>
                                        <th>Protein (g)</th>
                                        <th className="col-carbs">Carbs (g)</th>
                                        <th className="col-fat">Fat (g)</th>
                                        <th>Calories</th>
                                        <th className="actions-col">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pageItems.map((entry) => (
                                        <tr key={entry.id}>
                                            <td>{entry.date}</td>
                                            <td>{formatCell(entry.mealType)}</td>
                                            <td>{entry.description}</td>
                                            <td>{formatCell(entry.proteinG)}</td>
                                            <td className="col-carbs">{formatCell(entry.carbsG)}</td>
                                            <td className="col-fat">{formatCell(entry.fatG)}</td>
                                            <td>{formatCell(entry.calories)}</td>
                                            <td>
                                                <RowActions
                                                    onEdit={() => openEdit(entry)}
                                                    onDelete={() => handleDelete(entry)}
                                                    deleteLabel={`"${entry.description}"`}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <TablePagination
                            page={page}
                            totalPages={totalPages}
                            totalItems={totalItems}
                            onPageChange={setPage}
                        />
                    </>
                )}
            </div>
            {recordModal}
        </>
    );
}
