import type { CarServiceVisit } from '../api';

export const TYRE_ROTATION_KM = 10_000;
export const TYRE_ROTATION_MONTHS = 6;

/** Offered in the item name list, so a tyre visit is picked up without typing it exactly. */
export const TYRE_ITEMS = ['Tyre change', 'Tyre rotation'];

const TYRE_WORK = /\b(tyres?|tires?|tayar)\b|\brotat/i;
/** Small tyre jobs that don't restart the rotation interval. */
const MINOR_WORK = /repair|patch|puncture|tampal|valve|pressure|nitrogen|shine|polish|sealant/i;

/** A new set of tyres, or a rotation. */
export function isTyreWork(description: string) {
    return TYRE_WORK.test(description) && (/rotat/i.test(description) || !MINOR_WORK.test(description));
}

export type TyreRotation = {
    /** The tyre visit the interval counts from. */
    fromDate: string;
    byDate: string;
    /** Null when that visit has no odometer reading. */
    byOdometerKm: number | null;
    /** The date to act by: the date limit, or earlier if the mileage will get there first. */
    dueDate: string;
    estimated: boolean;
    /** The latest odometer reading has already passed the target. */
    kmReached: boolean;
};

function addDays(iso: string, days: number) {
    const date = new Date(iso + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + Math.round(days));
    return date.toISOString().slice(0, 10);
}

function addMonths(iso: string, months: number) {
    const date = new Date(iso + 'T00:00:00Z');
    date.setUTCMonth(date.getUTCMonth() + months);
    return date.toISOString().slice(0, 10);
}

export function rotationTargets(date: string, odometerKm: number | null) {
    return {
        byDate: addMonths(date, TYRE_ROTATION_MONTHS),
        byOdometerKm: odometerKm == null ? null : odometerKm + TYRE_ROTATION_KM,
    };
}

/** The next rotation, counted from the latest tyre visit. `visits` must be oldest first. */
export function nextTyreRotation(visits: CarServiceVisit[], latestOdometerKm: number | null, avgKmPerDay: number | null): TyreRotation | null {
    const last = [...visits].reverse().find((visit) => visit.items.some((item) => isTyreWork(item.description)));
    if (!last) return null;
    const { byDate, byOdometerKm } = rotationTargets(last.date, last.odometerKm);
    const byKmDate = byOdometerKm != null && avgKmPerDay != null && avgKmPerDay > 0
        ? addDays(last.date, TYRE_ROTATION_KM / avgKmPerDay)
        : null;
    const estimated = byKmDate != null && byKmDate < byDate;
    return {
        fromDate: last.date,
        byDate,
        byOdometerKm,
        dueDate: estimated ? byKmDate : byDate,
        estimated,
        kmReached: byOdometerKm != null && latestOdometerKm != null && latestOdometerKm >= byOdometerKm,
    };
}
