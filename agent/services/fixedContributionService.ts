import { and, eq, inArray } from 'drizzle-orm';
import { requireDb } from '../db/client';
import { investmentEvents, investmentInstruments } from '../db/schema';
import { resolveCategory } from '../config/expenseCategories';
import { getActiveFixedExpenses } from './expenseService';
import { getInstrumentById, recordFundInvest } from './investmentPortfolioService';
import { getPaymentAccountById } from './paymentAccountService';

const TIMEZONE = 'Asia/Kuala_Lumpur';

function todayInKL(): Date {
    return new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE }));
}

function roundMoney(n: number): number {
    return Math.round(n * 100) / 100;
}

export function dueDateInMonth(dayOfMonth: number, year: number, month: number): string {
    const lastDay = new Date(year, month, 0).getDate();
    const day = Math.min(dayOfMonth, lastDay);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isFrequencyDue(startMonth: number, frequencyMonths: number, currentMonth: number): boolean {
    const monthDiff = currentMonth - startMonth;
    const freq = frequencyMonths || 1;
    return ((monthDiff % freq) + freq) % freq === 0;
}

export async function resolveContributionHolding(
    instrumentId: number
): Promise<{ instrumentId: number; parentName: string } | { error: string }> {
    const instrument = await getInstrumentById(instrumentId);
    if (!instrument || !instrument.active) return { error: 'Holding not found' };
    if (instrument.kind !== 'fund') {
        return { error: 'Recurring contributions are only for unit trusts' };
    }
    const account = await getPaymentAccountById(instrument.paymentAccountId);
    if (!account || !account.active) return { error: 'Investment account not found' };
    if (account.accountType !== 'investment') {
        return { error: 'Holding must belong to an investment account' };
    }
    return { instrumentId: instrument.id, parentName: account.name };
}

async function hasMatchingBuy(instrumentId: number, date: string, amount: number): Promise<boolean> {
    const db = requireDb();
    const rows = await db
        .select({ amount: investmentEvents.amount })
        .from(investmentEvents)
        .where(
            and(
                eq(investmentEvents.instrumentId, instrumentId),
                eq(investmentEvents.eventType, 'buy'),
                eq(investmentEvents.date, date)
            )
        );
    const target = roundMoney(amount);
    return rows.some((row) => roundMoney(parseFloat(row.amount ?? '0')) === target);
}

export async function contributeFixedExpense(
    id: number,
    date?: string
): Promise<{ ok: true; skipped: boolean }> {
    const row = (await getActiveFixedExpenses()).find((entry) => entry.id === id);
    if (!row) throw new Error('Fixed expense not found');
    if (resolveCategory(row.category).toLowerCase() !== 'investment') {
        throw new Error('Only Investment bills can contribute to a holding');
    }
    if (row.instrumentId == null) {
        throw new Error('Select a unit trust holding for this bill');
    }
    const resolved = await resolveContributionHolding(row.instrumentId);
    if ('error' in resolved) throw new Error(resolved.error);

    const today = todayInKL();
    const contribDate =
        date ?? dueDateInMonth(row.dayOfMonth, today.getFullYear(), today.getMonth() + 1);

    if (await hasMatchingBuy(resolved.instrumentId, contribDate, row.amount)) {
        return { ok: true, skipped: true };
    }

    await recordFundInvest({
        instrumentId: resolved.instrumentId,
        date: contribDate,
        amount: row.amount,
        notes: row.description,
        fromPaymentMethod: row.paymentMethod,
    });
    return { ok: true, skipped: false };
}

export async function contributeDueFixedExpenses(): Promise<{ applied: number; skipped: number }> {
    const today = todayInKL();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const todayDay = today.getDate();
    const rows = await getActiveFixedExpenses();
    let applied = 0;
    let skipped = 0;

    for (const row of rows) {
        if (row.instrumentId == null) continue;
        if (resolveCategory(row.category).toLowerCase() !== 'investment') continue;
        if (!isFrequencyDue(row.startMonth, row.frequencyMonths, month)) continue;
        const dueDay = Math.min(row.dayOfMonth, new Date(year, month, 0).getDate());
        if (todayDay < dueDay) continue;

        const result = await contributeFixedExpense(
            row.id,
            dueDateInMonth(row.dayOfMonth, year, month)
        );
        if (result.skipped) skipped += 1;
        else applied += 1;
    }
    return { applied, skipped };
}

export async function attachHoldingContributionStatus<
    T extends {
        instrumentId: number | null;
        amount: number;
        dayOfMonth: number;
    },
>(entries: T[]): Promise<(T & { instrumentName: string | null; contributedThisMonth: boolean })[]> {
    const today = todayInKL();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const withIds = entries.filter((entry) => entry.instrumentId != null);
    const ids = [...new Set(withIds.map((entry) => entry.instrumentId!))];
    const nameById = new Map<number, string>();
    const contributedKeys = new Set<string>();

    if (ids.length > 0) {
        const db = requireDb();
        const instruments = await db
            .select({ id: investmentInstruments.id, name: investmentInstruments.name })
            .from(investmentInstruments)
            .where(inArray(investmentInstruments.id, ids));
        for (const row of instruments) {
            nameById.set(row.id, row.name);
        }

        const dates = [
            ...new Set(withIds.map((entry) => dueDateInMonth(entry.dayOfMonth, year, month))),
        ];
        const events = await db
            .select({
                instrumentId: investmentEvents.instrumentId,
                date: investmentEvents.date,
                amount: investmentEvents.amount,
            })
            .from(investmentEvents)
            .where(
                and(
                    inArray(investmentEvents.instrumentId, ids),
                    eq(investmentEvents.eventType, 'buy'),
                    inArray(investmentEvents.date, dates)
                )
            );
        for (const event of events) {
            contributedKeys.add(
                `${event.instrumentId}:${event.date}:${roundMoney(parseFloat(event.amount ?? '0'))}`
            );
        }
    }

    return entries.map((entry) => {
        const dueDate = dueDateInMonth(entry.dayOfMonth, year, month);
        const contributedThisMonth =
            entry.instrumentId != null &&
            contributedKeys.has(
                `${entry.instrumentId}:${dueDate}:${roundMoney(entry.amount)}`
            );
        return {
            ...entry,
            instrumentName:
                entry.instrumentId != null ? nameById.get(entry.instrumentId) ?? null : null,
            contributedThisMonth,
        };
    });
}
