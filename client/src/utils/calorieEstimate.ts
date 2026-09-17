/** Mifflin-St Jeor resting energy expenditure; null if any input is missing. */
export function computeBMR(
    weightKg: number | null,
    heightCm: number | null,
    age: number | null,
    sex: 'male' | 'female' | null
): number | null {
    if (weightKg == null || heightCm == null || age == null || sex == null) return null;
    const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
    return sex === 'male' ? base + 5 : base - 161;
}

/** ~0.0005 kcal/step/kg approximates published per-step energy cost across body weights. */
export function caloriesFromSteps(steps: number, weightKg: number | null): number {
    return steps * (weightKg ?? 70) * 0.0005;
}
