import { loadExpenseCategories } from '../agent/config/expenseCategories';
import { listDailyActivityLogs } from '../agent/services/dailyActivityService';
import { getSpendingSummary } from '../agent/services/expenseService';
import { getWorkoutHistory, groupWorkoutsBySession } from '../agent/services/gymService';
import { caloriesFromSteps, getTodayMacroProgress } from '../agent/services/nutritionService';
import { parseMonth } from './dateUtils';
import { isTelegramConfigured, sendTelegramReport } from './telegramNotify';
import { getTelegramUserId } from './telegramUser';

/**
 * The 9:30pm check-in: today's meals against the macro targets, spending (with any category
 * that is near or over its monthly budget), workouts and steps, in one Telegram message. A day
 * with nothing logged at all sends nothing.
 */

/** Same threshold as the Dashboard's "Near limit" (client/src/utils/budgetStatus.ts). */
const BUDGET_WARNING = 0.8;

export interface CheckInDay {
    date: string;
    meals: { count: number; calories: number; protein: number; calorieTarget: number; proteinTarget: number };
    /** Today's spending by category, as the Dashboard counts it (net of reimbursements). */
    spentToday: Record<string, number>;
    spentThisMonth: Record<string, number>;
    budgets: { category: string; monthlyBudget: number }[];
    /** Session labels ("Push day (5 exercises)") and stand-alone exercise names. */
    workouts: string[];
    workoutKcal: number;
    steps: { count: number; kcal: number } | null;
}

const count = (n: number) => Math.round(n).toLocaleString('en-US');
const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function daysLeftInMonth(date: string): number {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month, 0)).getUTCDate() - day;
}

function mealsLine({ meals }: CheckInDay): string {
    if (meals.count === 0) return '🍽️ No meals logged today.';
    const calories = Math.round(meals.calories);
    const calorieTarget = Math.round(meals.calorieTarget);
    const protein = Math.round(meals.protein);
    const proteinTarget = Math.round(meals.proteinTarget);
    const over = calories > calorieTarget ? ` (${count(calories - calorieTarget)} over)` : '';
    const proteinNote = protein < proteinTarget ? ` (${proteinTarget - protein}g to go)` : ' ✅';
    return `🍽️ ${count(calories)} / ${count(calorieTarget)} kcal${over} · protein ${protein} / ${proteinTarget}g${proteinNote}`;
}

/**
 * The spending line, then the categories spent in today that are over their monthly budget, and
 * those at 80% of it or more: one line each, however many categories.
 */
function spendingLines(day: CheckInDay): string[] {
    const spent = Object.entries(day.spentToday)
        .filter(([, amount]) => amount >= 0.005)
        .sort(([, a], [, b]) => b - a);
    if (spent.length === 0) return ['💸 No spending logged today.'];
    const total = spent.reduce((sum, [, amount]) => sum + amount, 0);
    const lines = [`💸 RM ${money(total)} today: ${spent.map(([cat, amount]) => `${cat} ${money(amount)}`).join(', ')}`];

    const over: string[] = [];
    const near: string[] = [];
    for (const [category] of spent) {
        const budget = day.budgets.find((b) => b.category === category)?.monthlyBudget ?? 0;
        const monthSpent = day.spentThisMonth[category] ?? 0;
        if (budget <= 0 || monthSpent < budget * BUDGET_WARNING) continue;
        if (monthSpent > budget) {
            over.push(`${category} +RM ${count(monthSpent - budget)}`);
        } else {
            near.push(`${category} RM ${count(monthSpent)} of ${count(budget)} (${Math.round((monthSpent / budget) * 100)}%)`);
        }
    }
    if (over.length > 0) lines.push(`🚨 Over budget this month: ${over.join(', ')}`);
    if (near.length > 0) {
        const daysLeft = daysLeftInMonth(day.date);
        const left = daysLeft === 0 ? 'last day of the month' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
        lines.push(`⚠️ Near budget, ${left}: ${near.join(', ')}`);
    }
    return lines;
}

function workoutLine(day: CheckInDay): string {
    if (day.workouts.length === 0) return '🏋️ No workout today.';
    const kcal = day.workoutKcal > 0 ? ` · ~${count(day.workoutKcal)} kcal` : '';
    return `🏋️ ${day.workouts.join(', ')}${kcal}`;
}

function stepsLine({ steps }: CheckInDay): string {
    if (!steps) return '👣 No steps logged yet: tap 👣 Steps to add them.';
    return `👣 ${count(steps.count)} steps · ~${count(steps.kcal)} kcal`;
}

/** Null when nothing at all was logged that day. */
export function formatNightlyCheckIn(day: CheckInDay): string | null {
    const anyLogged =
        day.meals.count > 0 ||
        Object.values(day.spentToday).some((amount) => amount >= 0.005) ||
        day.workouts.length > 0 ||
        day.steps != null;
    if (!anyLogged) return null;
    const heading = new Date(`${day.date}T00:00:00Z`).toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
    });
    return [
        `🌙 Check-in for ${heading}`,
        '',
        mealsLine(day),
        ...spendingLines(day),
        workoutLine(day),
        stepsLine(day),
    ].join('\n');
}

async function loadCheckInDay(date: string): Promise<CheckInDay> {
    const userId = getTelegramUserId();
    const month = parseMonth(date.slice(0, 7));
    // One query at a time, not Promise.all: the Supabase session pooler has 15 client slots for the
    // Dashboard, the bot and any local dev server together, and six at once ran out of them
    // (EMAXCONNSESSION). One at a time reuses a connection the server already holds.
    // Categories first: getSpendingSummary groups rows by the category list loaded here.
    const categories = await loadExpenseCategories();
    const nutrition = await getTodayMacroProgress(userId, date);
    const today = await getSpendingSummary(undefined, undefined, date, date);
    const thisMonth = await getSpendingSummary(undefined, undefined, month.start, month.end);
    const exercises = await getWorkoutHistory(userId, date, date);
    const activity = await listDailyActivityLogs(userId, date, date);

    const { sessions, standalone } = groupWorkoutsBySession(exercises);
    const workouts = [
        ...sessions.map((s) => {
            const n = s.exercises.length;
            return `${s.sessionLabel?.trim() || 'Workout'} (${n} exercise${n === 1 ? '' : 's'})`;
        }),
        ...standalone.map((ex) => ex.exercise),
    ];
    const steps = activity[0]?.steps;

    return {
        date,
        meals: {
            count: nutrition.consumed.meals.length,
            calories: nutrition.consumed.calories,
            protein: nutrition.consumed.protein,
            calorieTarget: nutrition.targets.dailyCalorieTarget,
            proteinTarget: nutrition.targets.dailyProteinTargetG,
        },
        spentToday: today.breakdown,
        spentThisMonth: thisMonth.breakdown,
        budgets: categories,
        workouts,
        workoutKcal: exercises.reduce((sum, ex) => sum + (ex.caloriesBurned ?? 0), 0),
        steps:
            steps == null
                ? null
                : { count: steps, kcal: caloriesFromSteps(steps, nutrition.targets.bodyWeightKg) },
    };
}

/** The check-in text for `date` without sending it; null when nothing was logged. */
export async function buildNightlyCheckIn(date: string): Promise<string | null> {
    return formatNightlyCheckIn(await loadCheckInDay(date));
}

/** The scheduler's nightly-check-in job. Throws when the message could not be sent, so it is retried. */
export async function runNightlyCheckIn(date: string): Promise<string> {
    if (!isTelegramConfigured()) return 'skipped: Telegram is not configured';
    const message = await buildNightlyCheckIn(date);
    if (!message) return 'nothing logged';
    if (!(await sendTelegramReport(message, { markdown: false }))) {
        throw new Error('Telegram message not sent');
    }
    return message;
}

// ponytail self-check: formatting only, no DB: npx tsx server/nightlyCheckIn.ts
if (require.main === module) {
    const expect = (actual: string | null, expected: string | null, label: string) => {
        if (actual !== expected) throw new Error(`${label}:\nexpected ${expected}\ngot      ${actual}`);
    };
    const base: CheckInDay = {
        date: '2026-10-26',
        meals: { count: 0, calories: 0, protein: 0, calorieTarget: 2200, proteinTarget: 160 },
        spentToday: {},
        spentThisMonth: {},
        budgets: [
            { category: 'Food', monthlyBudget: 800 },
            { category: 'Transport', monthlyBudget: 370 },
            { category: 'Drink', monthlyBudget: 200 },
        ],
        workouts: [],
        workoutKcal: 0,
        steps: null,
    };

    expect(formatNightlyCheckIn(base), null, 'nothing logged sends nothing');
    expect(
        formatNightlyCheckIn({ ...base, spentToday: { Food: 0, Drink: 0.001 } }),
        null,
        'zero and fully reimbursed spending count as nothing'
    );

    expect(
        formatNightlyCheckIn({
            ...base,
            meals: { count: 3, calories: 1849.6, protein: 120.4, calorieTarget: 2200, proteinTarget: 160 },
            spentToday: { Transport: 34.5, Food: 52 },
            spentThisMonth: { Food: 640, Transport: 120, Drink: 300 },
            workouts: ['Push day (5 exercises)', 'Running'],
            workoutKcal: 321.7,
            steps: { count: 8400, kcal: 294.4 },
        }),
        [
            '🌙 Check-in for Mon 26 Oct',
            '',
            '🍽️ 1,850 / 2,200 kcal · protein 120 / 160g (40g to go)',
            '💸 RM 86.50 today: Food 52.00, Transport 34.50',
            '⚠️ Near budget, 5 days left: Food RM 640 of 800 (80%)',
            '🏋️ Push day (5 exercises), Running · ~322 kcal',
            '👣 8,400 steps · ~294 kcal',
        ].join('\n'),
        'full day: Drink is over budget but not spent in today, so not listed'
    );

    expect(
        formatNightlyCheckIn({
            ...base,
            date: '2026-10-31',
            meals: { count: 2, calories: 2450, protein: 170, calorieTarget: 2200, proteinTarget: 160 },
            spentToday: { Food: 25, Transport: 12, Drink: 9.5 },
            spentThisMonth: { Food: 860.4, Transport: 410, Drink: 170 },
        }),
        [
            '🌙 Check-in for Sat 31 Oct',
            '',
            '🍽️ 2,450 / 2,200 kcal (250 over) · protein 170 / 160g ✅',
            '💸 RM 46.50 today: Food 25.00, Transport 12.00, Drink 9.50',
            '🚨 Over budget this month: Food +RM 60, Transport +RM 40',
            '⚠️ Near budget, last day of the month: Drink RM 170 of 200 (85%)',
            '🏋️ No workout today.',
            '👣 No steps logged yet: tap 👣 Steps to add them.',
        ].join('\n'),
        'over targets, over budget, nothing else logged'
    );

    expect(
        formatNightlyCheckIn({ ...base, steps: { count: 0, kcal: 0 } }),
        [
            '🌙 Check-in for Mon 26 Oct',
            '',
            '🍽️ No meals logged today.',
            '💸 No spending logged today.',
            '🏋️ No workout today.',
            '👣 0 steps · ~0 kcal',
        ].join('\n'),
        'a logged 0 steps still counts as logged'
    );
    if (daysLeftInMonth('2026-10-31') !== 0 || daysLeftInMonth('2028-02-01') !== 28) {
        throw new Error('daysLeftInMonth');
    }
    console.log('nightlyCheckIn self-check ok');
}
