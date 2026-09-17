import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { requireDb } from '../db/client';
import { dailyActivityLogs } from '../db/schema';

export interface DailyActivityLogEntry {
    id: number;
    date: string;
    steps: number;
}

function parseLog(row: typeof dailyActivityLogs.$inferSelect): DailyActivityLogEntry {
    return {
        id: row.id,
        date: row.date,
        steps: row.steps,
    };
}

export async function listDailyActivityLogs(
    telegramUserId: number,
    start?: string,
    end?: string
): Promise<DailyActivityLogEntry[]> {
    const db = requireDb();
    const conditions = [eq(dailyActivityLogs.telegramUserId, telegramUserId)];
    if (start) conditions.push(gte(dailyActivityLogs.date, start));
    if (end) conditions.push(lte(dailyActivityLogs.date, end));

    const rows = await db
        .select()
        .from(dailyActivityLogs)
        .where(and(...conditions))
        .orderBy(asc(dailyActivityLogs.date));

    return rows.map(parseLog);
}

export async function upsertDailyActivityLog(
    telegramUserId: number,
    date: string,
    steps: number
): Promise<DailyActivityLogEntry> {
    const db = requireDb();
    const existing = await db
        .select()
        .from(dailyActivityLogs)
        .where(
            and(
                eq(dailyActivityLogs.telegramUserId, telegramUserId),
                eq(dailyActivityLogs.date, date)
            )
        )
        .limit(1);

    let row: typeof dailyActivityLogs.$inferSelect;
    if (existing[0]) {
        const updated = await db
            .update(dailyActivityLogs)
            .set({ steps })
            .where(eq(dailyActivityLogs.id, existing[0].id))
            .returning();
        row = updated[0];
    } else {
        const inserted = await db
            .insert(dailyActivityLogs)
            .values({ telegramUserId, date, steps })
            .returning();
        row = inserted[0];
    }

    return parseLog(row);
}

export async function deleteDailyActivityLog(
    id: number,
    telegramUserId: number
): Promise<boolean> {
    const db = requireDb();
    const result = await db
        .delete(dailyActivityLogs)
        .where(
            and(eq(dailyActivityLogs.id, id), eq(dailyActivityLogs.telegramUserId, telegramUserId))
        )
        .returning({ id: dailyActivityLogs.id });

    return result.length > 0;
}
