import type { MealEntry } from '../api';

export interface MealGroup {
    key: string;
    title: string;
    /** Only set when the title is a restaurant, so the meal type still shows somewhere. */
    mealType: string | null;
    items: { entry: MealEntry; label: string }[];
    calories: number;
    proteinG: number;
}

export type MealDisplayItem =
    | { type: 'group'; group: MealGroup }
    | { type: 'single'; entry: MealEntry };

/** The bot names receipt items "Restaurant: item"; the colon must be followed by a space, so "8:30" is safe. */
const RESTAURANT_PREFIX = /^([^:]+):\s+(.+)$/;

export const MEAL_CATEGORIES = [
    { value: 'breakfast', label: 'Breakfast' },
    { value: 'lunch', label: 'Lunch' },
    { value: 'tea', label: 'Tea' },
    { value: 'dinner', label: 'Dinner' },
    { value: 'supper', label: 'Supper' },
    { value: 'others', label: 'Others' },
] as const;

export function getMealCategory(mealType: string | null) {
    const value = mealType?.trim().toLowerCase();
    return MEAL_CATEGORIES.find((category) => category.value === value) ??
        MEAL_CATEGORIES[MEAL_CATEGORIES.length - 1];
}

function buildGroup(key: string, rows: MealEntry[], categoryLabel?: string): MealGroup {
    const parts = rows.map((row) => row.description.match(RESTAURANT_PREFIX));
    const first = parts[0]?.[1].trim();
    const restaurant = first && parts.every((p) => p?.[1].trim() === first) ? first : null;
    const mealType = rows[0].mealType?.trim() || null;

    return {
        key,
        title:
            (categoryLabel && restaurant ? `${categoryLabel} · ${restaurant}` : categoryLabel) ??
            restaurant ??
            (mealType ? mealType.charAt(0).toUpperCase() + mealType.slice(1) : 'Other'),
        mealType: restaurant && !categoryLabel ? mealType : null,
        items: rows.map((entry, i) => ({
            entry,
            label: restaurant ? parts[i]![2] : entry.description,
        })),
        calories: Math.round(rows.reduce((sum, row) => sum + (row.calories ?? 0), 0)),
        proteinG: Math.round(rows.reduce((sum, row) => sum + row.proteinG, 0)),
    };
}

/**
 * Collapses meals sharing a day and meal type into one row; a lone meal stays a plain row.
 *
 * ponytail: rows have no receipt id, so "same day + same meal type" stands in for "one receipt".
 * Ceiling: two receipts at the same meal share a row. Upgrade path: a receipt id column set by
 * the bot, like workouts.session_id.
 */
export function toMealDisplayItems(entries: MealEntry[], categorize = false): MealDisplayItem[] {
    const byMeal = new Map<string, MealEntry[]>();
    for (const entry of entries) {
        const type = categorize
            ? getMealCategory(entry.mealType).value
            : entry.mealType?.trim().toLowerCase() ?? '';
        const key = `${entry.date}|${type}`;
        byMeal.set(key, [...(byMeal.get(key) ?? []), entry]);
    }
    const groups = [...byMeal];
    if (categorize) {
        groups.sort(([, left], [, right]) =>
            MEAL_CATEGORIES.indexOf(getMealCategory(left[0].mealType)) -
            MEAL_CATEGORIES.indexOf(getMealCategory(right[0].mealType))
        );
    }
    return groups.map(([key, rows]) => {
        if (!categorize && rows.length === 1) return { type: 'single', entry: rows[0] };
        const label = categorize ? getMealCategory(rows[0].mealType).label : undefined;
        return { type: 'group', group: buildGroup(key, rows, label) };
    });
}
