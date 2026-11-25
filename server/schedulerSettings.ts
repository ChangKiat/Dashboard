import { boolean, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { requireDb } from '../agent/db/client';

export const DEFAULT_JOBS = [
    { name: 'fixed-bills', label: 'Recurring bills', enabled: true, time: '09:00' },
    { name: 'interest', label: 'Interest accrual', enabled: true, time: '09:00' },
    { name: 'nightly-check-in', label: 'Daily check-in', enabled: true, time: '21:30' },
] as const;
export type JobSetting = { name: string; enabled: boolean; time: string };
const settingsTable = pgTable('scheduler_settings', {
    name: text('name').primaryKey(),
    enabled: boolean('enabled').notNull(),
    at: integer('at_minutes').notNull(),
});

export function parseJobSettings(value: unknown): JobSetting[] {
    if (!Array.isArray(value) || value.length !== DEFAULT_JOBS.length) throw new Error('Provide all three jobs');
    const names = new Set<string>();
    return value.map((job) => {
        if (!job || !DEFAULT_JOBS.some(d => d.name === job.name) || names.has(job.name)
            || typeof job.enabled !== 'boolean' || typeof job.time !== 'string'
            || !/^([01]\d|2[0-3]):[0-5]\d$/.test(job.time)) {
            throw new Error('Each job needs a unique name, on/off setting and valid HH:MM time');
        }
        names.add(job.name);
        return { name: job.name, enabled: job.enabled, time: job.time };
    });
}

export async function loadJobSettings() {
    try {
        const rows = await requireDb().select().from(settingsTable);
        return { ready: true, jobs: DEFAULT_JOBS.map(job => {
            const row = rows.find(r => r.name === job.name);
            return row ? { ...job, enabled: row.enabled,
                time: `${String(Math.floor(row.at / 60)).padStart(2, '0')}:${String(row.at % 60).padStart(2, '0')}` } : { ...job };
        }) };
    } catch (error) {
        // Preserve the existing schedules until the additive migration is installed.
        const e = error as { code?: string; cause?: { code?: string } };
        if (e.code === '42P01' || e.cause?.code === '42P01') return { ready: false, jobs: DEFAULT_JOBS.map(j => ({ ...j })) };
        throw error;
    }
}

export async function saveJobSettings(jobs: JobSetting[]) {
    await requireDb().transaction(async tx => {
        for (const job of jobs) {
            const [hours, minutes] = job.time.split(':').map(Number);
            const values = { name: job.name, enabled: job.enabled, at: hours * 60 + minutes };
            await tx.insert(settingsTable).values(values).onConflictDoUpdate({ target: settingsTable.name, set: values });
        }
    });
}
