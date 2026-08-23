import { asc, eq, inArray } from 'drizzle-orm';
import { requireDb } from '../db/client';
import { carServiceItems, carServiceVisits } from '../db/schema';

export const CAR_SERVICE_CATEGORIES = ['Material', 'Lubricants', 'Labour', 'Other'] as const;
export type CarServiceCategory = (typeof CAR_SERVICE_CATEGORIES)[number];

/** Default rows matching the Proton X50 spreadsheet layout. */
export const DEFAULT_CAR_SERVICE_CATALOG: { category: CarServiceCategory; description: string }[] = [
    { category: 'Material', description: 'Oil Filter (1.5TD)' },
    { category: 'Material', description: 'Drain Plug Gasket' },
    { category: 'Material', description: 'Air Filter X50' },
    { category: 'Material', description: 'Windshield Cleaner' },
    { category: 'Material', description: 'Wheel Alignment & Balancing' },
    { category: 'Material', description: 'Aircond Filter N95 (X50)' },
    { category: 'Material', description: 'Fuel Filter X50' },
    { category: 'Material', description: 'Spark Plug' },
    { category: 'Material', description: 'Alternator' },
    { category: 'Material', description: 'Car Battery' },
    { category: 'Lubricants', description: 'Proton Genuine Oil. 5W30 SP-5L' },
    { category: 'Lubricants', description: 'Bactakleen Utra Mist' },
    { category: 'Lubricants', description: 'Brake Fluid Dot4' },
    { category: 'Lubricants', description: 'Brake & Part Cleaner' },
    { category: 'Lubricants', description: 'DCT Oil Spirax' },
];

export type CarServiceItem = {
    id: number;
    visitId: number;
    category: CarServiceCategory;
    description: string;
    amount: number;
};

export type CarServiceVisit = {
    id: number;
    date: string;
    odometerKm: number;
    notes: string | null;
    total: number;
    items: CarServiceItem[];
    kmSincePrev: number | null;
};

export type CarServiceItemTotal = {
    category: CarServiceCategory;
    description: string;
    total: number;
    count: number;
};

export type CarServiceOverview = {
    visits: CarServiceVisit[];
    itemTotals: CarServiceItemTotal[];
    catalog: { category: CarServiceCategory; description: string }[];
    summary: {
        visitCount: number;
        lifetimeTotal: number;
        latestOdometerKm: number | null;
        latestDate: string | null;
        avgCostPerVisit: number;
        avgKmBetweenVisits: number | null;
    };
};

function resolveCategory(value: string): CarServiceCategory {
    const trimmed = value.trim();
    if ((CAR_SERVICE_CATEGORIES as readonly string[]).includes(trimmed)) {
        return trimmed as CarServiceCategory;
    }
    return 'Other';
}

function mapItem(row: typeof carServiceItems.$inferSelect): CarServiceItem {
    return {
        id: row.id,
        visitId: row.visitId,
        category: resolveCategory(row.category),
        description: row.description,
        amount: parseFloat(row.amount),
    };
}

export async function getCarServiceOverview(): Promise<CarServiceOverview> {
    const db = requireDb();
    const visitRows = await db.select().from(carServiceVisits).orderBy(asc(carServiceVisits.date), asc(carServiceVisits.id));
    const visitIds = visitRows.map((v) => v.id);
    const itemRows =
        visitIds.length === 0
            ? []
            : await db.select().from(carServiceItems).where(inArray(carServiceItems.visitId, visitIds));

    const itemsByVisit = new Map<number, CarServiceItem[]>();
    for (const row of itemRows) {
        const item = mapItem(row);
        const list = itemsByVisit.get(item.visitId) ?? [];
        list.push(item);
        itemsByVisit.set(item.visitId, list);
    }

    const visits: CarServiceVisit[] = visitRows.map((row, index) => {
        const items = (itemsByVisit.get(row.id) ?? []).sort((a, b) =>
            a.category === b.category
                ? a.description.localeCompare(b.description)
                : a.category.localeCompare(b.category)
        );
        const total = items.reduce((sum, item) => sum + item.amount, 0);
        const prev = index > 0 ? visitRows[index - 1] : null;
        return {
            id: row.id,
            date: row.date,
            odometerKm: row.odometerKm,
            notes: row.notes ?? null,
            total,
            items,
            kmSincePrev: prev != null ? row.odometerKm - prev.odometerKm : null,
        };
    });

    const totalsMap = new Map<string, CarServiceItemTotal>();
    for (const visit of visits) {
        for (const item of visit.items) {
            const key = `${item.category}::${item.description}`;
            const existing = totalsMap.get(key);
            if (existing) {
                existing.total += item.amount;
                existing.count += 1;
            } else {
                totalsMap.set(key, {
                    category: item.category,
                    description: item.description,
                    total: item.amount,
                    count: 1,
                });
            }
        }
    }

    const catalogKeys = new Set(DEFAULT_CAR_SERVICE_CATALOG.map((c) => `${c.category}::${c.description}`));
    const catalog = [
        ...DEFAULT_CAR_SERVICE_CATALOG,
        ...[...totalsMap.values()]
            .filter((t) => !catalogKeys.has(`${t.category}::${t.description}`))
            .map((t) => ({ category: t.category, description: t.description }))
            .sort((a, b) =>
                a.category === b.category
                    ? a.description.localeCompare(b.description)
                    : a.category.localeCompare(b.category)
            ),
    ];

    const itemTotals = [...totalsMap.values()].sort((a, b) => b.total - a.total);
    const lifetimeTotal = visits.reduce((sum, v) => sum + v.total, 0);
    const latest = visits.length > 0 ? visits[visits.length - 1] : null;
    const intervals = visits.map((v) => v.kmSincePrev).filter((v): v is number => v != null && v >= 0);
    const avgKmBetweenVisits =
        intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : null;

    return {
        visits,
        itemTotals,
        catalog,
        summary: {
            visitCount: visits.length,
            lifetimeTotal,
            latestOdometerKm: latest?.odometerKm ?? null,
            latestDate: latest?.date ?? null,
            avgCostPerVisit: visits.length > 0 ? lifetimeTotal / visits.length : 0,
            avgKmBetweenVisits,
        },
    };
}

export async function createVisit(fields: {
    date: string;
    odometerKm: number;
    notes?: string | null;
    items?: { category: string; description: string; amount: number }[];
}): Promise<CarServiceVisit> {
    const db = requireDb();
    const [row] = await db
        .insert(carServiceVisits)
        .values({
            date: fields.date,
            odometerKm: fields.odometerKm,
            notes: fields.notes?.trim() || null,
        })
        .returning();

    const items = fields.items?.filter((i) => i.description.trim() && i.amount > 0) ?? [];
    if (items.length > 0) {
        await db.insert(carServiceItems).values(
            items.map((item) => ({
                visitId: row.id,
                category: resolveCategory(item.category),
                description: item.description.trim(),
                amount: item.amount.toFixed(2),
            }))
        );
    }

    const overview = await getCarServiceOverview();
    const visit = overview.visits.find((v) => v.id === row.id);
    if (!visit) throw new Error('Failed to load created visit');
    return visit;
}

export async function updateVisit(
    id: number,
    fields: { date?: string; odometerKm?: number; notes?: string | null }
): Promise<CarServiceVisit | null> {
    const db = requireDb();
    const set: Partial<typeof carServiceVisits.$inferInsert> = {};
    if (fields.date != null) set.date = fields.date;
    if (fields.odometerKm != null) set.odometerKm = fields.odometerKm;
    if (fields.notes !== undefined) set.notes = fields.notes?.trim() || null;

    if (Object.keys(set).length === 0) {
        const overview = await getCarServiceOverview();
        return overview.visits.find((v) => v.id === id) ?? null;
    }

    const [row] = await db.update(carServiceVisits).set(set).where(eq(carServiceVisits.id, id)).returning();
    if (!row) return null;
    const overview = await getCarServiceOverview();
    return overview.visits.find((v) => v.id === id) ?? null;
}

export async function deleteVisit(id: number): Promise<boolean> {
    const db = requireDb();
    const deleted = await db.delete(carServiceVisits).where(eq(carServiceVisits.id, id)).returning();
    return deleted.length > 0;
}

export async function upsertVisitItem(fields: {
    visitId: number;
    category: string;
    description: string;
    amount: number;
}): Promise<CarServiceItem | null> {
    const db = requireDb();
    const visit = await db.select().from(carServiceVisits).where(eq(carServiceVisits.id, fields.visitId)).limit(1);
    if (!visit[0]) return null;

    const category = resolveCategory(fields.category);
    const description = fields.description.trim();
    const existing = await db
        .select()
        .from(carServiceItems)
        .where(eq(carServiceItems.visitId, fields.visitId));

    const match = existing.find(
        (row) => resolveCategory(row.category) === category && row.description === description
    );

    if (fields.amount <= 0) {
        if (match) {
            await db.delete(carServiceItems).where(eq(carServiceItems.id, match.id));
        }
        return null;
    }

    if (match) {
        const [row] = await db
            .update(carServiceItems)
            .set({ amount: fields.amount.toFixed(2), category })
            .where(eq(carServiceItems.id, match.id))
            .returning();
        return mapItem(row);
    }

    const [row] = await db
        .insert(carServiceItems)
        .values({
            visitId: fields.visitId,
            category,
            description,
            amount: fields.amount.toFixed(2),
        })
        .returning();
    return mapItem(row);
}

export async function deleteItem(id: number): Promise<boolean> {
    const db = requireDb();
    const deleted = await db.delete(carServiceItems).where(eq(carServiceItems.id, id)).returning();
    return deleted.length > 0;
}
