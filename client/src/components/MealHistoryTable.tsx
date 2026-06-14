import { useEffect, useMemo, useState } from 'react';

import type { MealEntry } from '../api';
import { deleteMeal, updateMeal } from '../api';
import {
    formatCell,
    parseOptionalNumber,
    parseRequiredNumber,
} from '../utils/tableFormat';
import RecordModal from './RecordModal';
import RowActions from './RowActions';

interface Props {
    entries: MealEntry[];
    onChanged: () => void;
}

const UNCATEGORIZED_FILTER = '__uncategorized__';

export default function MealHistoryTable({ entries, onChanged }: Props) {
    const [mealTypeFilter, setMealTypeFilter] = useState('all');
    const [editing, setEditing] = useState<MealEntry | null>(null);
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

    useEffect(() => {
        setMealTypeFilter('all');
    }, [entries]);

    const openEdit = (entry: MealEntry) => {
        setEditing(entry);
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

    const closeEdit = () => {
        setEditing(null);
        setModalError(null);
    };

    const handleSave = async () => {
        if (!editing) return;
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
            await updateMeal(editing.id, {
                date: form.date,
                mealType: form.mealType.trim() || null,
                description: form.description.trim(),
                proteinG,
                carbsG: parseOptionalNumber(form.carbsG),
                fatG: parseOptionalNumber(form.fatG),
                calories: parseOptionalNumber(form.calories),
            });
            closeEdit();
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

    if (entries.length === 0) {
        return <p className="muted">No meals logged in this range.</p>;
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
                    <div className="table-scroll">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Description</th>
                                    <th>Protein (g)</th>
                                    <th>Carbs (g)</th>
                                    <th>Fat (g)</th>
                                    <th>Calories</th>
                                    <th className="actions-col">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredEntries.map((entry) => (
                                    <tr key={entry.id}>
                                        <td>{entry.date}</td>
                                        <td>{formatCell(entry.mealType)}</td>
                                        <td>{entry.description}</td>
                                        <td>{formatCell(entry.proteinG)}</td>
                                        <td>{formatCell(entry.carbsG)}</td>
                                        <td>{formatCell(entry.fatG)}</td>
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
                )}
            </div>
            <RecordModal
                title="Edit meal"
                open={editing != null}
                saving={saving}
                error={modalError}
                onClose={closeEdit}
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
        </>
    );
}
