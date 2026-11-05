// Run from Dashboard/: npx tsx client/src/utils/mealGroups_check.ts
import type { MealEntry } from '../api';
import { toMealDisplayItems, type MealGroup } from './mealGroups';

let nextId = 1;
function meal(description: string, mealType: string | null, date = '2026-11-05'): MealEntry {
    return {
        id: nextId++,
        date,
        mealType,
        description,
        proteinG: 10.4,
        carbsG: null,
        fatG: null,
        calories: 100.4,
    };
}

function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(`mealGroups check failed: ${message}`);
}

function onlyGroup(entries: MealEntry[]): MealGroup {
    const items = toMealDisplayItems(entries);
    const item = items[0];
    assert(items.length === 1 && item.type === 'group', 'expected exactly one group');
    return (item as { group: MealGroup }).group;
}

// A receipt: titled by the restaurant, which comes off each line, with rounded totals.
const receipt = onlyGroup([
    meal('Rocku Yakiniku: Pork belly x1', 'dinner'),
    meal('Rocku Yakiniku: Beef slices x2', 'dinner'),
    meal('Rocku Yakiniku: Soft drink x1', 'dinner'),
]);
assert(receipt.title === 'Rocku Yakiniku', 'restaurant becomes the title');
assert(receipt.mealType === 'dinner', 'meal type stays visible beside a restaurant title');
assert(receipt.items[0].label === 'Pork belly x1', 'restaurant comes off the item label');
assert(receipt.calories === 301 && receipt.proteinG === 31, 'totals are summed, then rounded');

// No shared restaurant: titled by meal type, descriptions untouched, even with a partial prefix.
const mixed = onlyGroup([meal('Egg tart (Zok Noodles)', 'lunch'), meal("Costa: Iced tea", 'Lunch')]);
assert(mixed.title === 'Lunch', 'falls back to the meal type');
assert(mixed.mealType === null, 'meal type is not repeated when it is the title');
assert(mixed.items[1].label === 'Costa: Iced tea', 'description stays whole without a shared prefix');

// Only a colon followed by a space is a prefix, and missing meal types group as Other.
const noType = onlyGroup([meal('Kopi at 8:30am', null), meal('Toast', '  ')]);
assert(noType.title === 'Other', 'no meal type groups as Other');
assert(noType.items[0].label === 'Kopi at 8:30am', 'a time is not a restaurant prefix');

// Different days and meal types never merge, a lone meal stays a row, and order is kept.
const items = toMealDisplayItems([
    meal('Nasi lemak', 'lunch'),
    meal('Teh tarik', 'dinner'),
    meal('Roti', 'dinner'),
    meal('Rice', 'dinner', '2026-11-04'),
]);
assert(items.map((i) => i.type).join() === 'single,group,single', 'groups by day and meal type, in order');

console.log('mealGroups check ok');
