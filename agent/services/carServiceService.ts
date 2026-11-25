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

export type CarVisitType = typeof carServiceVisits.$inferSelect.visitType;

export type CarServiceVisit = {
    visitType: CarVisitType;
    id: number;
    date: string;
    odometerKm: number | null;
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

export const SERVICE_INTERVAL_KM = 10_000;
export const SERVICE_INTERVAL_MONTHS = 6;

export type NextServiceSummary = {
    /** Last service date + 6 months */
    byDate: string;
    /** Last odometer + 10,000 km */
    byOdometerKm: number;
    /** Estimated date whichever limit comes first */
    predictedDate: string;
    limitingFactor: 'date' | 'km';
    avgKmPerDay: number | null;
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
        nextService: NextServiceSummary | null;
    };
};

function parseIsoDate(iso: string): Date {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function formatIsoDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function addMonthsToIso(iso: string, months: number): string {
    const d = parseIsoDate(iso);
    d.setMonth(d.getMonth() + months);
    return formatIsoDate(d);
}

function addDaysToIso(iso: string, days: number): string {
    const d = parseIsoDate(iso);
    d.setDate(d.getDate() + Math.round(days));
    return formatIsoDate(d);
}

function daysBetweenIso(start: string, end: string): number {
    return (parseIsoDate(end).getTime() - parseIsoDate(start).getTime()) / (1000 * 60 * 60 * 24);
}

function computeNextService(visits: (CarServiceVisit & { odometerKm: number })[]): NextServiceSummary | null {
    if (visits.length === 0) return null;

    const last = visits[visits.length - 1];
    const byDate = addMonthsToIso(last.date, SERVICE_INTERVAL_MONTHS);
    const byOdometerKm = last.odometerKm + SERVICE_INTERVAL_KM;

    let totalKm = 0;
    let totalDays = 0;
    for (let i = 1; i < visits.length; i++) {
        const prev = visits[i - 1];
        const curr = visits[i];
        const days = daysBetweenIso(prev.date, curr.date);
        if (days > 0) {
            totalKm += curr.odometerKm - prev.odometerKm;
            totalDays += days;
        }
    }
    const avgKmPerDay = totalDays > 0 ? totalKm / totalDays : null;

    if (avgKmPerDay != null && avgKmPerDay > 0) {
        const byKmDate = addDaysToIso(last.date, SERVICE_INTERVAL_KM / avgKmPerDay);
        if (byKmDate < byDate) {
            return {
                byDate,
                byOdometerKm,
                predictedDate: byKmDate,
                limitingFactor: 'km',
                avgKmPerDay,
            };
        }
    }

    return {
        byDate,
        byOdometerKm,
        predictedDate: byDate,
        limitingFactor: 'date',
        avgKmPerDay,
    };
}

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

    let latestReading: number | null = null;
    const visits: CarServiceVisit[] = visitRows.map((row) => {
        const items = (itemsByVisit.get(row.id) ?? []).sort((a, b) =>
            a.category === b.category
                ? a.description.localeCompare(b.description)
                : a.category.localeCompare(b.category)
        );
        const total = items.reduce((sum, item) => sum + item.amount, 0);
        const kmSincePrev: number | null = row.odometerKm != null && latestReading != null ? row.odometerKm - latestReading : null;
        if (row.odometerKm != null) latestReading = row.odometerKm;
        return {
            id: row.id,
            visitType: row.visitType,
            date: row.date,
            odometerKm: row.odometerKm,
            notes: row.notes ?? null,
            total,
            items,
            kmSincePrev,
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
            latestOdometerKm: latestReading,
            latestDate: latest?.date ?? null,
            avgCostPerVisit: visits.length > 0 ? lifetimeTotal / visits.length : 0,
            avgKmBetweenVisits,
            nextService: computeNextService(visits.filter((visit): visit is CarServiceVisit & { odometerKm: number } =>
                visit.visitType === 'Normal service' && visit.odometerKm != null
            )),
        },
    };
}

export type VisitItemInput = { id?: number; category: string; description: string; amount: number };
export type VisitChanges = { visitType?: CarVisitType; date?: string; odometerKm?: number | null; notes?: string | null; items?: VisitItemInput[] };

function itemValues(visitId: number, item: VisitItemInput) {
    return {
        visitId,
        category: resolveCategory(item.category),
        description: item.description.trim(),
        amount: item.amount.toFixed(2),
    };
}

export async function createVisit(fields: VisitChanges & { date: string }): Promise<CarServiceVisit> {
    const id = await requireDb().transaction(async (tx) => {
        const [visit] = await tx.insert(carServiceVisits).values({
            visitType: fields.visitType,
            date: fields.date,
            odometerKm: fields.odometerKm,
            notes: fields.notes?.trim() || null,
        }).returning();
        if (fields.items?.length) {
            await tx.insert(carServiceItems).values(fields.items.map((item) => itemValues(visit.id, item)));
        }
        return visit.id;
    });
    const visit = (await getCarServiceOverview()).visits.find((v) => v.id === id);
    if (!visit) throw new Error('Failed to load created visit');
    return visit;
}

export class MissingOdometerError extends Error {}

export class StaleVisitItemError extends Error {}

export async function updateVisit(id: number, fields: VisitChanges): Promise<CarServiceVisit | null> {
    const found = await requireDb().transaction(async (tx) => {
        const [visit] = await tx.select().from(carServiceVisits).where(eq(carServiceVisits.id, id)).for('update');
        if (!visit) return false;
        const odometerKm = fields.odometerKm === undefined ? visit.odometerKm : fields.odometerKm;
        if ((fields.visitType ?? visit.visitType) === 'Normal service' && odometerKm == null) {
            throw new MissingOdometerError('Enter an odometer reading for normal service.');
        }
        const { items, ...metadata } = fields;
        if (Object.keys(metadata).length) {
            await tx.update(carServiceVisits).set(metadata).where(eq(carServiceVisits.id, id));
        }
        if (items) {
            const existing = await tx.select().from(carServiceItems).where(eq(carServiceItems.visitId, id));
            const remaining = new Set(existing.map((item) => item.id));
            for (const item of items) {
                const values = itemValues(id, item);
                if (item.id === undefined) {
                    await tx.insert(carServiceItems).values(values);
                } else {
                    if (!remaining.delete(item.id)) throw new StaleVisitItemError('This item has changed. Reload the visit and try again.');
                    await tx.update(carServiceItems).set(values).where(eq(carServiceItems.id, item.id));
                }
            }
            if (remaining.size) await tx.delete(carServiceItems).where(inArray(carServiceItems.id, [...remaining]));
        }
        return true;
    });
    if (!found) return null;
    return (await getCarServiceOverview()).visits.find((v) => v.id === id) ?? null;
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
