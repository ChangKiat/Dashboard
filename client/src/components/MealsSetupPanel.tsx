import { useCallback, useEffect, useState } from 'react';

import { fetchNutritionSettings, updateNutritionSettings } from '../api';

export default function MealsSetupPanel() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [savedMsg, setSavedMsg] = useState<string | null>(null);

    const [calories, setCalories] = useState('');
    const [protein, setProtein] = useState('');
    const [carbs, setCarbs] = useState('');
    const [fat, setFat] = useState('');
    const [bodyWeight, setBodyWeight] = useState('');
    const [height, setHeight] = useState('');
    const [age, setAge] = useState('');
    const [sex, setSex] = useState<'male' | 'female' | ''>('');

    const load = useCallback(async () => {
        const settings = await fetchNutritionSettings();
        setCalories(String(settings.dailyCalorieTarget));
        setProtein(String(settings.dailyProteinTargetG));
        setCarbs(String(settings.dailyCarbsTargetG));
        setFat(String(settings.dailyFatTargetG));
        setBodyWeight(settings.bodyWeightKg != null ? String(settings.bodyWeightKg) : '');
        setHeight(settings.heightCm != null ? String(settings.heightCm) : '');
        setAge(settings.age != null ? String(settings.age) : '');
        setSex(settings.sex ?? '');
    }, []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        load()
            .catch((err) => {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [load]);

    const handleSave = async () => {
        const dailyCalorieTarget = Number(calories);
        const dailyProteinTargetG = Number(protein);
        const dailyCarbsTargetG = Number(carbs);
        const dailyFatTargetG = Number(fat);
        const trimmedWeight = bodyWeight.trim();
        const bodyWeightKg = trimmedWeight === '' ? null : Number(trimmedWeight);
        const trimmedHeight = height.trim();
        const heightCm = trimmedHeight === '' ? null : Number(trimmedHeight);
        const trimmedAge = age.trim();
        const ageValue = trimmedAge === '' ? null : Number(trimmedAge);

        if (
            !(dailyCalorieTarget > 0) ||
            !(dailyProteinTargetG > 0) ||
            !(dailyCarbsTargetG > 0) ||
            !(dailyFatTargetG > 0)
        ) {
            setError('Calorie and macro targets must be positive numbers.');
            return;
        }
        if (bodyWeightKg !== null && !(bodyWeightKg > 0)) {
            setError('Body weight must be a positive number or left blank.');
            return;
        }
        if (heightCm !== null && !(heightCm > 0)) {
            setError('Height must be a positive number or left blank.');
            return;
        }
        if (ageValue !== null && !(ageValue > 0)) {
            setError('Age must be a positive number or left blank.');
            return;
        }

        setSaving(true);
        setError(null);
        setSavedMsg(null);
        try {
            const updated = await updateNutritionSettings({
                dailyCalorieTarget,
                dailyProteinTargetG,
                dailyCarbsTargetG,
                dailyFatTargetG,
                bodyWeightKg,
                heightCm,
                age: ageValue,
                sex: sex === '' ? null : sex,
            });
            setCalories(String(updated.dailyCalorieTarget));
            setProtein(String(updated.dailyProteinTargetG));
            setCarbs(String(updated.dailyCarbsTargetG));
            setFat(String(updated.dailyFatTargetG));
            setBodyWeight(updated.bodyWeightKg != null ? String(updated.bodyWeightKg) : '');
            setHeight(updated.heightCm != null ? String(updated.heightCm) : '');
            setAge(updated.age != null ? String(updated.age) : '');
            setSex(updated.sex ?? '');
            setSavedMsg('Saved.');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="card meals-setup-panel">
                <h3>Meal goals</h3>
                <p className="muted">Loading…</p>
            </div>
        );
    }

    return (
        <div className="card meals-setup-panel">
            <div className="section-header-row">
                <h3>Meal goals</h3>
                <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                </button>
            </div>
            <p className="muted meals-setup-hint">
                Daily nutrition targets and body stats used for Health charts and calorie burn
                estimates (resting metabolism + steps + workouts).
            </p>
            {error && <p className="error">{error}</p>}
            {savedMsg && <p className="muted">{savedMsg}</p>}
            <div className="meals-setup-grid">
                <div className="form-field">
                    <label htmlFor="meal-cal">Calories (kcal)</label>
                    <input
                        id="meal-cal"
                        type="number"
                        min="1"
                        step="1"
                        value={calories}
                        onChange={(e) => setCalories(e.target.value)}
                    />
                </div>
                <div className="form-field">
                    <label htmlFor="meal-protein">Protein (g)</label>
                    <input
                        id="meal-protein"
                        type="number"
                        min="1"
                        step="1"
                        value={protein}
                        onChange={(e) => setProtein(e.target.value)}
                    />
                </div>
                <div className="form-field">
                    <label htmlFor="meal-carbs">Carbs (g)</label>
                    <input
                        id="meal-carbs"
                        type="number"
                        min="1"
                        step="1"
                        value={carbs}
                        onChange={(e) => setCarbs(e.target.value)}
                    />
                </div>
                <div className="form-field">
                    <label htmlFor="meal-fat">Fat (g)</label>
                    <input
                        id="meal-fat"
                        type="number"
                        min="1"
                        step="1"
                        value={fat}
                        onChange={(e) => setFat(e.target.value)}
                    />
                </div>
                <div className="form-field">
                    <label htmlFor="meal-weight">Body weight (kg)</label>
                    <input
                        id="meal-weight"
                        type="number"
                        min="1"
                        step="0.1"
                        value={bodyWeight}
                        onChange={(e) => setBodyWeight(e.target.value)}
                        placeholder="Optional"
                    />
                </div>
                <div className="form-field">
                    <label htmlFor="meal-height">Height (cm)</label>
                    <input
                        id="meal-height"
                        type="number"
                        min="1"
                        step="0.1"
                        value={height}
                        onChange={(e) => setHeight(e.target.value)}
                        placeholder="For BMR"
                    />
                </div>
                <div className="form-field">
                    <label htmlFor="meal-age">Age</label>
                    <input
                        id="meal-age"
                        type="number"
                        min="1"
                        step="1"
                        value={age}
                        onChange={(e) => setAge(e.target.value)}
                        placeholder="For BMR"
                    />
                </div>
                <div className="form-field">
                    <label htmlFor="meal-sex">Sex</label>
                    <select
                        id="meal-sex"
                        value={sex}
                        onChange={(e) => setSex(e.target.value as 'male' | 'female' | '')}
                    >
                        <option value="">Not set</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                    </select>
                </div>
            </div>
        </div>
    );
}
