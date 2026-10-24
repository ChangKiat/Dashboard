import { and, count, eq, gte, lte, max } from 'drizzle-orm';
import { requireDb } from '../agent/db/client';
import {
    bodyWeightLogs,
    expenses,
    fixedExpenses,
    incomes,
    interestSchedules,
    meals,
    userSettings,
    workouts,
} from '../agent/db/schema';
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

    const [expRow, incRow, fixRow, intRow, settings] = await Promise.all([
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
            .select({ count: count(), maxId: max(interestSchedules.id) })
            .from(interestSchedules)
            .where(eq(interestSchedules.active, true)),
        db
            .select({ salaryAfterTax: userSettings.salaryAfterTax })
            .from(userSettings)
            .where(eq(userSettings.telegramUserId, userId))
            .limit(1),
    ]);

    const expStats = stat(expRow[0]?.count ?? 0, expRow[0]?.maxId ?? 0);
    const incStats = stat(incRow[0]?.count ?? 0, incRow[0]?.maxId ?? 0);
    const fixStats = stat(fixRow[0]?.count ?? 0, fixRow[0]?.maxId ?? 0);
    const intStats = stat(intRow[0]?.count ?? 0, intRow[0]?.maxId ?? 0);
    const salary = settings[0]?.salaryAfterTax ?? '0';
    return `exp:${expStats}|inc:${incStats}|fix:${fixStats}|int:${intStats}|sal:${salary}`;
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
    const weightRange = and(
        eq(bodyWeightLogs.telegramUserId, userId),
        gte(bodyWeightLogs.date, start),
        lte(bodyWeightLogs.date, end)
    );

    const db = requireDb();

    const [workoutRow, mealRow, weightRow, settings] = await Promise.all([
        db
            .select({ count: count(), maxId: max(workouts.id) })
            .from(workouts)
            .where(workoutRange),
        db
            .select({ count: count(), maxId: max(meals.id) })
            .from(meals)
            .where(mealRange),
        db
            .select({ count: count(), maxId: max(bodyWeightLogs.id) })
            .from(bodyWeightLogs)
            .where(weightRange),
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
    const weightStats = stat(weightRow[0]?.count ?? 0, weightRow[0]?.maxId ?? 0);
    const s = settings[0];
    const targets = s
        ? `${s.dailyCalorieTarget}:${s.dailyProteinTargetG}:${s.dailyCarbsTargetG}:${s.dailyFatTargetG}:${s.bodyWeightKg ?? ''}`
        : '0:0:0:0:';

    return `wkt:${workoutStats}|meal:${mealStats}|bw:${weightStats}|tgt:${targets}`;
}

export async function getSyncFingerprint(month: string, scope: SyncScope): Promise<string> {
    if (scope === 'expenses') return getExpensesSyncFingerprint(month);
    return getHealthSyncFingerprint(month);
}

function latestIso(values: (Date | string | null | undefined)[]): string | null {
    const times = values
        .filter((v): v is Date | string => v != null)
        .map((v) => new Date(v).getTime())
        .filter((t) => !Number.isNaN(t));
    return times.length > 0 ? new Date(Math.max(...times)).toISOString() : null;
}

/** When the newest entry in this scope was created (any month), as an ISO string. */
export async function getLastEntryAt(scope: SyncScope): Promise<string | null> {
    const db = requireDb();

    if (scope === 'expenses') {
        const [expRow, incRow] = await Promise.all([
            db.select({ at: max(expenses.createdAt) }).from(expenses),
            db.select({ at: max(incomes.createdAt) }).from(incomes),
        ]);
        return latestIso([expRow[0]?.at, incRow[0]?.at]);
    }

    const userId = getTelegramUserId();
    const [workoutRow, mealRow, weightRow] = await Promise.all([
        db.select({ at: max(workouts.createdAt) }).from(workouts).where(eq(workouts.telegramUserId, userId)),
        db.select({ at: max(meals.createdAt) }).from(meals).where(eq(meals.telegramUserId, userId)),
        db
            .select({ at: max(bodyWeightLogs.createdAt) })
            .from(bodyWeightLogs)
            .where(eq(bodyWeightLogs.telegramUserId, userId)),
    ]);
    return latestIso([workoutRow[0]?.at, mealRow[0]?.at, weightRow[0]?.at]);
}
