import { asc, desc, eq, inArray } from 'drizzle-orm';
import { requireDb } from '../db/client';
import { taxReliefClaims, taxReliefReceipts } from '../db/schema';

export type TaxReliefGroup = 'Lifestyle & medical' | 'Insurance & contributions' | 'Family' | 'Individual' | 'Other';

export type TaxReliefCategory = {
    id: string;
    label: string;
    /** Yearly cap in RM; null when it depends on the number of people (e.g. per child) */
    limit: number | null;
    hint: string;
    group: TaxReliefGroup;
    /** False for status-based reliefs (spouse, child, disability) that have no receipt */
    receipt: boolean;
};

/** Every resident gets this without claiming anything. */
export const INDIVIDUAL_RELIEF = 9000;

/** LHDN individual reliefs for YA 2025. */
const YA2025_CATEGORIES: TaxReliefCategory[] = [
    { id: 'lifestyle', label: 'Lifestyle', limit: 2500, group: 'Lifestyle & medical', receipt: true, hint: 'Reading materials, PC / smartphone / tablet, internet subscription (self, spouse, child)' },
    { id: 'sports', label: 'Sports equipment & activities', limit: 1000, group: 'Lifestyle & medical', receipt: true, hint: 'Sports equipment, facility rental / entry fees, approved competitions, gym membership (includes parents)' },
    { id: 'medical_self', label: 'Medical (serious disease / fertility)', limit: 10000, group: 'Lifestyle & medical', receipt: true, hint: 'Self, spouse, child. Includes up to RM1,000 each for full check-up / COVID test, vaccination, dental; RM6,000 for child learning disability' },
    { id: 'medical_parents', label: 'Medical & carer for parents', limit: 8000, group: 'Lifestyle & medical', receipt: true, hint: 'Treatment, special needs, carer, dental; includes grandparents. Full check-up up to RM1,000' },
    { id: 'disability_equipment', label: 'Basic supporting equipment (disabled)', limit: 6000, group: 'Lifestyle & medical', receipt: true, hint: 'For self, spouse, child or parent' },
    { id: 'education_self', label: 'Education fees (self)', limit: 7000, group: 'Lifestyle & medical', receipt: true, hint: 'Recognised courses; upskilling / enhancement courses up to RM2,000' },
    { id: 'breastfeeding', label: 'Breastfeeding equipment', limit: 1000, group: 'Lifestyle & medical', receipt: true, hint: 'Female taxpayer, child 2 years old and below; once every 2 years' },
    { id: 'ev_charging', label: 'EV charging / composting', limit: 2500, group: 'Lifestyle & medical', receipt: true, hint: 'EV charging facilities (install, rent, hire purchase, subscription); food waste composting machine' },
    { id: 'housing_loan_interest', label: 'First home loan interest', limit: 7000, group: 'Lifestyle & medical', receipt: true, hint: 'S&P signed 2025–2027, first 3 years of assessment. RM7,000 if ≤RM500k; RM5,000 if RM500k–750k' },
    { id: 'epf', label: 'EPF', limit: 4000, group: 'Insurance & contributions', receipt: true, hint: 'Obligatory or voluntary contributions' },
    { id: 'life_insurance', label: 'Life insurance / voluntary EPF', limit: 3000, group: 'Insurance & contributions', receipt: true, hint: 'Life insurance or takaful premiums, or voluntary EPF contributions, or both' },
    { id: 'edu_medical_insurance', label: 'Education & medical insurance', limit: 4000, group: 'Insurance & contributions', receipt: true, hint: 'Premiums for education or medical benefit policies' },
    { id: 'prs', label: 'PRS & deferred annuity', limit: 3000, group: 'Insurance & contributions', receipt: true, hint: 'Private Retirement Scheme or deferred annuity' },
    { id: 'socso', label: 'SOCSO / EIS', limit: 350, group: 'Insurance & contributions', receipt: true, hint: 'PERKESO contributions' },
    { id: 'sspn', label: 'SSPN', limit: 8000, group: 'Insurance & contributions', receipt: true, hint: 'Net deposit for the year' },
    { id: 'childcare', label: 'Childcare / kindergarten', limit: 3000, group: 'Family', receipt: true, hint: 'Registered childcare or kindergarten, child 6 years old and below' },
    { id: 'spouse', label: 'Spouse / alimony', limit: 4000, group: 'Family', receipt: false, hint: 'Spouse with no income, or alimony to former wife' },
    { id: 'disabled_spouse', label: 'Disabled spouse', limit: 6000, group: 'Family', receipt: false, hint: 'Additional relief for a disabled husband / wife' },
    { id: 'child_under_18', label: 'Child below 18', limit: null, group: 'Family', receipt: false, hint: 'RM2,000 per unmarried child' },
    { id: 'child_higher_ed', label: 'Child 18+ in higher education', limit: null, group: 'Family', receipt: false, hint: 'RM8,000 per unmarried child studying diploma or above in Malaysia' },
    { id: 'disabled_child', label: 'Disabled child', limit: null, group: 'Family', receipt: false, hint: 'RM6,000 per child, plus RM8,000 if pursuing diploma or higher' },
    { id: 'disabled_individual', label: 'Disabled individual', limit: 7000, group: 'Individual', receipt: false, hint: 'Registered with JKM' },
    { id: 'other', label: 'Other', limit: null, group: 'Other', receipt: true, hint: 'Anything not listed above' },
];

/** YA 2026: adds local travel, CCTV under EV, wider childcare and child reliefs. */
const YA2026_CATEGORIES: TaxReliefCategory[] = YA2025_CATEGORIES.flatMap((cat): TaxReliefCategory[] => {
    switch (cat.id) {
        case 'lifestyle':
            return [
                { ...cat, hint: 'Books, newspapers, magazines (incl. digital), electronic devices, monthly internet, self-improvement courses' },
                { id: 'local_travel', label: 'Local travel', limit: 1000, group: 'Lifestyle & medical', receipt: true, hint: 'Attraction, cultural, artistic and performance event admission tickets' },
            ];
        case 'sports':
            return [{ ...cat, hint: 'Sports equipment, facility entry / rental, competition registration, gym membership, fitness classes' }];
        case 'medical_self':
            return [{ ...cat, label: 'Critical illness medical', hint: 'Up to RM1,000 for check-ups, vaccination, dental, mental health screening, disease tests, self-test devices; RM6,000 for child learning disability' }];
        case 'ev_charging':
            return [{ ...cat, label: 'EV charging / food waste / CCTV', hint: 'EV charging facilities, food waste disposers, CCTV systems' }];
        case 'childcare':
            return [{ ...cat, label: 'Childcare / preschool fees', hint: 'Children below 12 years old' }];
        case 'child_under_18':
            return [{ ...cat, hint: 'RM2,000 per unmarried child below 18, or 18+ full-time pre-university' }];
        case 'child_higher_ed':
            return [{ ...cat, hint: 'RM8,000 per unmarried child 18+ in foundation, bachelor or higher' }];
        case 'disabled_child':
            return [{ ...cat, hint: 'RM8,000 per disabled child' }];
        default:
            return [cat];
    }
});

/** Relief rules for a year of assessment; later years reuse the newest list until updated. */
export function categoriesForYear(year: number): TaxReliefCategory[] {
    return year <= 2025 ? YA2025_CATEGORIES : YA2026_CATEGORIES;
}

const ALL_CATEGORY_IDS = new Set([...YA2025_CATEGORIES, ...YA2026_CATEGORIES].map((c) => c.id));

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
export const RECEIPT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];

export type TaxReliefReceipt = {
    id: number;
    claimId: number;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
};

export type TaxReliefClaim = {
    id: number;
    year: number;
    date: string;
    category: string;
    description: string;
    amount: number;
    notes: string | null;
    receipts: TaxReliefReceipt[];
};

export type TaxReliefCategorySummary = {
    category: string;
    label: string;
    limit: number | null;
    claimed: number;
    /** Claimed amount capped at the relief limit */
    eligible: number;
    claimCount: number;
};

export type TaxReliefOverview = {
    year: number;
    years: number[];
    categories: TaxReliefCategory[];
    claims: TaxReliefClaim[];
    byCategory: TaxReliefCategorySummary[];
    summary: {
        totalClaimed: number;
        /** Includes the automatic individual relief */
        totalEligible: number;
        individualRelief: number;
        claimCount: number;
        receiptCount: number;
        missingReceiptCount: number;
    };
};

/** Keeps any known id on write; a year's view folds ids it doesn't offer into Other. */
function resolveCategory(value: string, categories?: TaxReliefCategory[]): string {
    const id = value.trim();
    if (categories) return categories.some((c) => c.id === id) ? id : 'other';
    return ALL_CATEGORY_IDS.has(id) ? id : 'other';
}

function yearOfDate(iso: string): number {
    return parseInt(iso.slice(0, 4), 10);
}

const receiptMetaColumns = {
    id: taxReliefReceipts.id,
    claimId: taxReliefReceipts.claimId,
    fileName: taxReliefReceipts.fileName,
    mimeType: taxReliefReceipts.mimeType,
    sizeBytes: taxReliefReceipts.sizeBytes,
    createdAt: taxReliefReceipts.createdAt,
};

function mapReceipt(row: {
    id: number;
    claimId: number;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: Date;
}): TaxReliefReceipt {
    return { ...row, createdAt: row.createdAt.toISOString() };
}

export async function getTaxReliefOverview(year: number): Promise<TaxReliefOverview> {
    const db = requireDb();
    const categories = categoriesForYear(year);
    const claimRows = await db
        .select()
        .from(taxReliefClaims)
        .where(eq(taxReliefClaims.year, year))
        .orderBy(desc(taxReliefClaims.date), desc(taxReliefClaims.id));

    const claimIds = claimRows.map((c) => c.id);
    const receiptRows =
        claimIds.length === 0
            ? []
            : await db
                  .select(receiptMetaColumns)
                  .from(taxReliefReceipts)
                  .where(inArray(taxReliefReceipts.claimId, claimIds))
                  .orderBy(asc(taxReliefReceipts.id));

    const receiptsByClaim = new Map<number, TaxReliefReceipt[]>();
    for (const row of receiptRows) {
        const list = receiptsByClaim.get(row.claimId) ?? [];
        list.push(mapReceipt(row));
        receiptsByClaim.set(row.claimId, list);
    }

    const claims: TaxReliefClaim[] = claimRows.map((row) => ({
        id: row.id,
        year: row.year,
        date: row.date,
        category: resolveCategory(row.category, categories),
        description: row.description,
        amount: parseFloat(row.amount),
        notes: row.notes ?? null,
        receipts: receiptsByClaim.get(row.id) ?? [],
    }));

    const byCategory: TaxReliefCategorySummary[] = categories.map((cat) => {
        const inCat = claims.filter((c) => c.category === cat.id);
        const claimed = inCat.reduce((sum, c) => sum + c.amount, 0);
        return {
            category: cat.id,
            label: cat.label,
            limit: cat.limit,
            claimed,
            eligible: cat.limit != null ? Math.min(claimed, cat.limit) : claimed,
            claimCount: inCat.length,
        };
    });

    const yearRows = await db
        .selectDistinct({ year: taxReliefClaims.year })
        .from(taxReliefClaims)
        .orderBy(desc(taxReliefClaims.year));
    const years = [...new Set([year, ...yearRows.map((r) => r.year)])].sort((a, b) => b - a);

    return {
        year,
        years,
        categories,
        claims,
        byCategory,
        summary: {
            totalClaimed: claims.reduce((sum, c) => sum + c.amount, 0),
            totalEligible: INDIVIDUAL_RELIEF + byCategory.reduce((sum, c) => sum + c.eligible, 0),
            individualRelief: INDIVIDUAL_RELIEF,
            claimCount: claims.length,
            receiptCount: receiptRows.length,
            missingReceiptCount: claims.filter(
                (c) => c.receipts.length === 0 && categories.find((cat) => cat.id === c.category)?.receipt !== false
            ).length,
        },
    };
}

export type ClaimFields = {
    date: string;
    category: string;
    description: string;
    amount: number;
    notes?: string | null;
};

export async function createClaim(fields: ClaimFields): Promise<number> {
    const db = requireDb();
    const [row] = await db
        .insert(taxReliefClaims)
        .values({
            year: yearOfDate(fields.date),
            date: fields.date,
            category: resolveCategory(fields.category),
            description: fields.description.trim(),
            amount: fields.amount.toFixed(2),
            notes: fields.notes?.trim() || null,
        })
        .returning({ id: taxReliefClaims.id });
    return row.id;
}

export async function updateClaim(id: number, fields: Partial<ClaimFields>): Promise<boolean> {
    const db = requireDb();
    const set: Partial<typeof taxReliefClaims.$inferInsert> = {};
    if (fields.date != null) {
        set.date = fields.date;
        set.year = yearOfDate(fields.date);
    }
    if (fields.category != null) set.category = resolveCategory(fields.category);
    if (fields.description != null) set.description = fields.description.trim();
    if (fields.amount != null) set.amount = fields.amount.toFixed(2);
    if (fields.notes !== undefined) set.notes = fields.notes?.trim() || null;

    if (Object.keys(set).length === 0) {
        const existing = await db
            .select({ id: taxReliefClaims.id })
            .from(taxReliefClaims)
            .where(eq(taxReliefClaims.id, id));
        return existing.length > 0;
    }

    const updated = await db
        .update(taxReliefClaims)
        .set(set)
        .where(eq(taxReliefClaims.id, id))
        .returning({ id: taxReliefClaims.id });
    return updated.length > 0;
}

export async function deleteClaim(id: number): Promise<boolean> {
    const db = requireDb();
    const deleted = await db
        .delete(taxReliefClaims)
        .where(eq(taxReliefClaims.id, id))
        .returning({ id: taxReliefClaims.id });
    return deleted.length > 0;
}

export async function addReceipt(fields: {
    claimId: number;
    fileName: string;
    mimeType: string;
    data: Buffer;
}): Promise<TaxReliefReceipt | null> {
    const db = requireDb();
    const claim = await db
        .select({ id: taxReliefClaims.id })
        .from(taxReliefClaims)
        .where(eq(taxReliefClaims.id, fields.claimId));
    if (!claim[0]) return null;

    const [row] = await db
        .insert(taxReliefReceipts)
        .values({
            claimId: fields.claimId,
            fileName: fields.fileName,
            mimeType: fields.mimeType,
            sizeBytes: fields.data.length,
            data: fields.data,
        })
        .returning(receiptMetaColumns);
    return mapReceipt(row);
}

export async function getReceiptFile(
    id: number
): Promise<{ fileName: string; mimeType: string; data: Buffer } | null> {
    const db = requireDb();
    const [row] = await db
        .select({
            fileName: taxReliefReceipts.fileName,
            mimeType: taxReliefReceipts.mimeType,
            data: taxReliefReceipts.data,
        })
        .from(taxReliefReceipts)
        .where(eq(taxReliefReceipts.id, id));
    return row ?? null;
}

export async function deleteReceipt(id: number): Promise<boolean> {
    const db = requireDb();
    const deleted = await db
        .delete(taxReliefReceipts)
        .where(eq(taxReliefReceipts.id, id))
        .returning({ id: taxReliefReceipts.id });
    return deleted.length > 0;
}

