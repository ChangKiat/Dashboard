import { and, count, eq, gte, lte, max } from 'drizzle-orm';
import { requireDb } from '../../AI Agent/src/db/client';
import {
    expenses,
    fixedExpenses,
    incomes,
    meals,
    userSettings,
    workouts,
} from '../../AI Agent/src/db/schema';
import { parseMonth } from './dateUtils';
import { getTelegramUserId } from './telegramUser';

export type SyncScope = 'expenses' | 'health';

function stat(countVal: number | null, maxId: number | null): string {
    return `${countVal ?? 0}:${maxId ?? 0}`;
}

export async function getExpensesSyncFingerprint(month: string): Promise<string> {
    const { start, end } = parseMonth(month);
    const dateRange = and(gte(expenses.date, start), lte(expenses.date, end));
    const incomeDateRange = and(gte(incomes.date, start), lte(incomes.date, end));

    const db = requireDb();
    const userId = getTelegramUserId();

    const [expRow, incRow, fixRow, settings] = await Promise.all([
        db
            .select({ count: count(), maxId: max(expenses.id) })
            .from(expenses)
            .where(dateRange),
        db
            .select({ count: count(), maxId: max(incomes.id) })
            .from(incomes)
            .where(incomeDateRange),
        db
            .select({ count: count(), maxId: max(fixedExpenses.id) })
            .from(fixedExpenses)
            .where(eq(fixedExpenses.active, true)),
        db
            .select({ salaryAfterTax: userSettings.salaryAfterTax })
            .from(userSettings)
            .where(eq(userSettings.telegramUserId, userId))
            .limit(1),
    ]);

    const expStats = stat(expRow[0]?.count ?? 0, expRow[0]?.maxId ?? 0);
    const incStats = stat(incRow[0]?.count ?? 0, incRow[0]?.maxId ?? 0);
    const fixStats = stat(fixRow[0]?.count ?? 0, fixRow[0]?.maxId ?? 0);
    const salary = settings[0]?.salaryAfterTax ?? '0';
    return `exp:${expStats}|inc:${incStats}|fix:${fixStats}|sal:${salary}`;
}

export async function getHealthSyncFingerprint(month: string): Promise<string> {
    const { start, end } = parseMonth(month);
    const userId = getTelegramUserId();

    const workoutRange = and(
        eq(workouts.telegramUserId, userId),
        gte(workouts.date, start),
        lte(workouts.date, end)
    );
    const mealRange = and(
        eq(meals.telegramUserId, userId),
        gte(meals.date, start),
        lte(meals.date, end)
    );

    const db = requireDb();

    const [workoutRow, mealRow, settings] = await Promise.all([
        db
            .select({ count: count(), maxId: max(workouts.id) })
            .from(workouts)
            .where(workoutRange),
        db
            .select({ count: count(), maxId: max(meals.id) })
            .from(meals)
            .where(mealRange),
        db
            .select({
                dailyCalorieTarget: userSettings.dailyCalorieTarget,
                dailyProteinTargetG: userSettings.dailyProteinTargetG,
                dailyCarbsTargetG: userSettings.dailyCarbsTargetG,
                dailyFatTargetG: userSettings.dailyFatTargetG,
                bodyWeightKg: userSettings.bodyWeightKg,
            })
            .from(userSettings)
            .where(eq(userSettings.telegramUserId, userId))
            .limit(1),
    ]);

    const workoutStats = stat(workoutRow[0]?.count ?? 0, workoutRow[0]?.maxId ?? 0);
    const mealStats = stat(mealRow[0]?.count ?? 0, mealRow[0]?.maxId ?? 0);
    const s = settings[0];
    const targets = s
        ? `${s.dailyCalorieTarget}:${s.dailyProteinTargetG}:${s.dailyCarbsTargetG}:${s.dailyFatTargetG}:${s.bodyWeightKg ?? ''}`
        : '0:0:0:0:';

    return `wkt:${workoutStats}|meal:${mealStats}|tgt:${targets}`;
}

export async function getSyncFingerprint(month: string, scope: SyncScope): Promise<string> {
    if (scope === 'expenses') return getExpensesSyncFingerprint(month);
    return getHealthSyncFingerprint(month);
}
