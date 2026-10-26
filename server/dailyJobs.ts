import { and, eq, gte, min, sql } from 'drizzle-orm';
import { integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { loadExpenseCategories } from '../agent/config/expenseCategories';
import { loadPaymentAccounts, resolvePaymentMethod } from '../agent/config/paymentMethods';
import { requireDb } from '../agent/db/client';
import { expenses } from '../agent/db/schema';
import {
    appendExpense,
    getFixedExpensesDueOn,
    isFixedContributionRecorded,
    type DueFixedExpense,
} from '../agent/services/expenseService';
import { contributeFixedExpense } from '../agent/services/fixedContributionService';
import {
    fundingDestination,
    isInvestmentCategory,
    upsertInvestmentFundingTransfer,
} from '../agent/services/incomeService';
import {
    accrueInterestForSchedule,
    getInterestSchedulesDueOn,
} from '../agent/services/interestScheduleService';
import { getInstrumentById } from '../agent/services/investmentPortfolioService';
import { applyLoanPayment } from '../agent/services/loanService';
import { sendTelegramReport } from './telegramNotify';

/**
 * The daily jobs that used to be node-cron jobs in the AI Agent bot: the 9am fixed bills and
 * interest accrual (Asia/Kuala_Lumpur).
 *
 * A host may put this server to sleep, so nothing waits for an exact minute. Each run (a timer
 * while the server is up, the server starting, or POST /api/scheduler/run from an outside ping)
 * runs every job that is due and not yet done. scheduled_job_runs holds one row per job per day,
 * and inserting that row is the lock: a day is never run twice, even by two servers at once, and
 * a day the server missed is caught up later with that day's date.
 */

/** AI Agent/scripts/migrate-scheduled-job-runs.sql. Dashboard-only, so not in the vendored schema. */
const scheduledJobRuns = pgTable(
    'scheduled_job_runs',
    {
        job: text('job').notNull(),
        runDate: text('run_date').notNull(),
        /** running | done | failed */
        status: text('status').notNull(),
        triggeredBy: text('triggered_by'),
        attempts: integer('attempts').default(1).notNull(),
        summary: text('summary'),
        startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
        finishedAt: timestamp('finished_at', { withTimezone: true }),
    },
    (t) => [primaryKey({ columns: [t.job, t.runDate] })]
);

const TIMEZONE = 'Asia/Kuala_Lumpur';
const TICK_MS = 5 * 60_000;
/** Catch-up jobs also run this many missed days back (only days after the job's first run). */
const CATCH_UP_DAYS = 7;
/** A 'running' row this old belongs to a server that died mid-run: take it over. */
const STALE_RUNNING_MS = 15 * 60_000;
/** A failed day is retried this long after its last attempt, up to MAX_ATTEMPTS in all. */
const FAILED_RETRY_MS = 30 * 60_000;
const MAX_ATTEMPTS = 3;

type JobName = 'fixed-bills' | 'interest';

interface DailyJob {
    name: JobName;
    /** Due from this KL time, in minutes after midnight. Missed days are run later, oldest first. */
    at: number;
    /** Logs the day and returns its summary for scheduled_job_runs. Throws when nothing was done. */
    run: (date: string, today: string) => Promise<string>;
    /** Telegram alert when run() throws. */
    failureText?: (day: string) => string;
}

interface LedgerRow {
    runDate: string;
    status: string;
    startedAt: Date;
    attempts: number;
}

export interface JobRunResult {
    job: JobName;
    date: string;
    status: 'done' | 'failed';
}

/** KL calendar day (YYYY-MM-DD) and minutes after midnight. */
function klClock(now: Date): { date: string; minutes: number } {
    const t = new Date(now.toLocaleString('en-US', { timeZone: TIMEZONE }));
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, '0');
    const d = String(t.getDate()).padStart(2, '0');
    return { date: `${y}-${m}-${d}`, minutes: t.getHours() * 60 + t.getMinutes() };
}

function addDays(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/** Same rule as claimRun's setWhere: a stale 'running' day, or a failed day due for a retry. */
function canTakeOver(row: LedgerRow, now: Date): boolean {
    const age = now.getTime() - row.startedAt.getTime();
    if (row.status === 'running') return age >= STALE_RUNNING_MS;
    if (row.status === 'failed') return row.attempts < MAX_ATTEMPTS && age >= FAILED_RETRY_MS;
    return false;
}

/**
 * Days `job` should run now, oldest first. A job that has never run starts today, so the first
 * deploy doesn't redo days the bot already ran; after that, missed days back to CATCH_UP_DAYS.
 */
function pendingRunDates(
    job: Pick<DailyJob, 'at'>,
    now: Date,
    firstRunDate: string | null,
    rows: LedgerRow[]
): string[] {
    const { date: today, minutes } = klClock(now);
    const blocked = new Set(rows.filter((row) => !canTakeOver(row, now)).map((row) => row.runDate));
    const pastTime = minutes >= job.at;
    if (firstRunDate == null) {
        return pastTime && !blocked.has(today) ? [today] : [];
    }
    const end = pastTime ? today : addDays(today, -1);
    const windowStart = addDays(today, -CATCH_UP_DAYS);
    const dates: string[] = [];
    for (let d = firstRunDate > windowStart ? firstRunDate : windowStart; d <= end; d = addDays(d, 1)) {
        if (!blocked.has(d)) dates.push(d);
    }
    return dates;
}

/** Telegram legacy Markdown: escape _ * ` [ in user text so a name can't break the reports. */
function escapeMarkdown(text: string): string {
    return text.replace(/[_*`[]/g, (ch) => `\\${ch}`);
}

function errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function dayLabel(date: string, today: string): string {
    return date === today ? 'today' : `${date} (a day the scheduler missed)`;
}

/** A bill's expense is already there: a retried or caught-up day, or the bot logged it before the move. */
async function isBillExpenseLogged(exp: DueFixedExpense): Promise<boolean> {
    const rows = await requireDb()
        .select({ id: expenses.id })
        .from(expenses)
        .where(
            and(
                eq(expenses.date, exp.date),
                eq(expenses.category, exp.category),
                eq(expenses.description, exp.description),
                eq(expenses.amount, exp.amount.toFixed(2))
            )
        )
        .limit(1);
    return rows.length > 0;
}

/**
 * Logs one due fixed bill and returns its confirmation line (Markdown-escaped), or null when it
 * is already logged. Throws only when nothing was written; a later step that fails (funding
 * transfer, loan balance) is reported as a ⚠️ line under the bill instead, so the bill isn't
 * listed as "not applied" after its expense was saved.
 */
async function logFixedBill(exp: DueFixedExpense): Promise<string | null> {
    if (await isFixedContributionRecorded(exp)) return null;
    const md = escapeMarkdown;
    const amount = `${exp.currency} ${exp.amount}`;
    const warnings: string[] = [];
    const lineWithWarnings = (details: string) =>
        `\n- ${md(exp.description)} (${amount}${details})` +
        warnings.map((w) => `\n   ⚠️ ${md(w)}`).join('');

    // A unit trust bill records its expense, the holding buy and the funding transfer in one
    // transaction. The page-load contribution on Cashflow and Setup stays as the idempotent fallback.
    let contributionError: string | null = null;
    if (exp.instrumentId != null && isInvestmentCategory(exp.category) && !exp.loan) {
        let contributed = false;
        try {
            const result = await contributeFixedExpense(exp.id, exp.date);
            if (result.skipped) return null;
            contributed = true;
        } catch (error) {
            contributionError = errorText(error);
        }
        if (contributed) {
            // contributeFixedExpense succeeds only when every account set on the bill resolves, and
            // writes the transfer only when both do.
            const buyFrom = resolvePaymentMethod(exp.paymentMethod);
            const buyTo = resolvePaymentMethod(exp.toInvestmentAccount);
            const holding = await getInstrumentById(exp.instrumentId).catch(() => null);
            const via = buyFrom ? ` via ${md(buyFrom)}` : '';
            const toFund = buyFrom && buyTo ? ` → ${md(buyTo)}` : '';
            return lineWithWarnings(`${via}${toFund} · ${md(holding?.name ?? `holding #${exp.instrumentId}`)}`);
        }
        // Not "record the buy on the Dashboard": a manual buy there would add a second expense.
        warnings.push(
            `holding buy not recorded (${contributionError}): logged the expense only. Fix the bill, then open Cashflow or Setup to add the buy`
        );
    }

    if (await isBillExpenseLogged(exp)) {
        return warnings.length ? lineWithWarnings(' · already logged') : null;
    }

    // keepRaw: a bill whose account no longer resolves keeps that name on the expense instead of
    // being saved with no account ("Cash" is an active account, so it resolves normally).
    let expenseId: number;
    try {
        expenseId = await appendExpense(
            exp.date,
            exp.amount,
            exp.currency,
            exp.category,
            exp.description,
            exp.paymentMethod,
            undefined,
            { keepRaw: true }
        );
    } catch (error) {
        throw new Error(
            contributionError
                ? `holding buy failed (${contributionError}); expense failed (${errorText(error)})`
                : errorText(error)
        );
    }

    const from = resolvePaymentMethod(exp.paymentMethod);
    if (exp.paymentMethod && !from) {
        warnings.push(`'${exp.paymentMethod}' is not an active account: stored as text, fix the bill in Setup`);
    }

    // Investment bills and "Other" bills with a destination both get the linked transfer.
    const dest = fundingDestination(exp.category, exp.paymentMethod, exp.toInvestmentAccount);
    let toFund = '';
    if (dest && exp.paymentMethod) {
        const fundingTo = resolvePaymentMethod(dest);
        if (!from || !fundingTo) {
            warnings.push(`transfer to '${dest}' skipped: account '${!from ? exp.paymentMethod : dest}' not found`);
        } else {
            try {
                await upsertInvestmentFundingTransfer({
                    expenseId,
                    date: exp.date,
                    amount: exp.amount,
                    description: exp.description,
                    fromPaymentMethod: from,
                    toInvestmentAccount: fundingTo,
                });
                toFund = ` → ${md(fundingTo)}`;
            } catch (error) {
                warnings.push(`transfer to ${fundingTo} not logged: ${errorText(error)}`);
            }
        }
    } else if (dest) {
        warnings.push(`transfer to '${dest}' skipped: the bill has no payment account`);
    } else if (isInvestmentCategory(exp.category)) {
        warnings.push('transfer skipped: the bill has no destination investment account, set it in Setup');
    }

    let loanNote = '';
    if (exp.loan) {
        try {
            const applied = await applyLoanPayment({ fixedExpenseId: exp.id, date: exp.date, expenseId });
            if (applied) {
                loanNote = ` · interest ${applied.interest.toFixed(2)} / principal ${applied.principal.toFixed(2)} / left ${applied.remainingAfter.toFixed(2)}`;
            }
        } catch (error) {
            warnings.push(`loan balance not updated: ${errorText(error)}`);
        }
    }

    const via = exp.paymentMethod ? ` via ${md(exp.paymentMethod)}` : '';
    return lineWithWarnings(`${via}${toFund}${loanNote}`);
}

async function runFixedBills(date: string, today: string): Promise<string> {
    const due = await getFixedExpensesDueOn(date);
    if (due.length === 0) return 'nothing due';

    console.log(`Found ${due.length} fixed expenses for ${date}. Logging...`);
    let loggedList = '';
    let notApplied = '';

    // Each bill on its own: one bad bill is listed under "not applied" and the rest still log.
    for (const exp of due) {
        try {
            const line = await logFixedBill(exp);
            if (line) loggedList += line;
        } catch (billError) {
            console.error(`Fixed bill #${exp.id} (${exp.description}) not applied:`, billError);
            notApplied += `\n- ${escapeMarkdown(exp.description)} (${exp.currency} ${exp.amount}): ${escapeMarkdown(errorText(billError))}`;
        }
    }

    if (!loggedList && !notApplied) return 'already logged';

    const day = dayLabel(date, today);
    let msg = loggedList
        ? `🗓️ *Automated Billing:* Good morning! I just logged the scheduled expenses for ${day}:${loggedList}`
        : `🗓️ *Automated Billing:* Good morning! None of the scheduled expenses for ${day} could be logged.`;
    if (notApplied) {
        msg += `\n\n⚠️ *Not applied* (nothing saved for these, log them by hand once fixed):${notApplied}`;
    }
    await sendTelegramReport(msg);
    return msg;
}

async function runInterest(date: string, today: string): Promise<string> {
    const schedulesDue = await getInterestSchedulesDueOn(date);
    if (schedulesDue.length === 0) return 'nothing due';

    console.log(`Found ${schedulesDue.length} interest schedules for ${date}. Accruing...`);
    let loggedList = '';
    let notApplied = '';

    // Each schedule on its own, so one failure doesn't stop (or hide) the others.
    for (const sched of schedulesDue) {
        try {
            const result = await accrueInterestForSchedule(sched, date);
            if (!result?.created) continue;
            loggedList += `\n- ${escapeMarkdown(sched.description)} (${sched.currency} ${result.amount.toFixed(2)} → ${escapeMarkdown(sched.paymentMethod)})`;
        } catch (schedError) {
            console.error(`Interest schedule #${sched.id} (${sched.description}) not accrued:`, schedError);
            notApplied += `\n- ${escapeMarkdown(sched.description)}: ${escapeMarkdown(errorText(schedError))}`;
        }
    }

    if (!loggedList && !notApplied) return 'nothing to accrue';

    const day = dayLabel(date, today);
    let msg = loggedList
        ? `💰 *Interest accrued:* Good morning! I just logged the scheduled interest for ${day}:${loggedList}`
        : `💰 *Interest accrued:* Good morning! None of the scheduled interest for ${day} could be logged.`;
    if (notApplied) msg += `\n\n⚠️ *Not accrued:*${notApplied}`;
    await sendTelegramReport(msg);
    return msg;
}

const JOBS: DailyJob[] = [
    {
        name: 'fixed-bills',
        at: 9 * 60,
        run: runFixedBills,
        failureText: (day) => `🚨 *Automated Billing failed:* The fixed expenses for ${day} were NOT logged.`,
    },
    {
        name: 'interest',
        at: 9 * 60,
        run: runInterest,
        failureText: (day) => `🚨 *Interest accrual failed:* The scheduled interest for ${day} was NOT accrued.`,
    },
];

async function loadLedger(job: JobName, since: string): Promise<{ firstRunDate: string | null; rows: LedgerRow[] }> {
    const db = requireDb();
    const [first] = await db
        .select({ date: min(scheduledJobRuns.runDate) })
        .from(scheduledJobRuns)
        .where(eq(scheduledJobRuns.job, job));
    const rows = await db
        .select({
            runDate: scheduledJobRuns.runDate,
            status: scheduledJobRuns.status,
            startedAt: scheduledJobRuns.startedAt,
            attempts: scheduledJobRuns.attempts,
        })
        .from(scheduledJobRuns)
        .where(and(eq(scheduledJobRuns.job, job), gte(scheduledJobRuns.runDate, since)));
    return { firstRunDate: first?.date ?? null, rows };
}

/** Takes the day for this server: a new row, or a stale / retryable one. Resolves its attempt number, or null if taken. */
async function claimRun(job: JobName, date: string, triggeredBy: string): Promise<number | null> {
    // ISO strings: a raw sql`` param is not run through the column's Date mapping.
    const now = Date.now();
    const staleBefore = new Date(now - STALE_RUNNING_MS).toISOString();
    const retryBefore = new Date(now - FAILED_RETRY_MS).toISOString();
    const [row] = await requireDb()
        .insert(scheduledJobRuns)
        .values({ job, runDate: date, status: 'running', triggeredBy })
        .onConflictDoUpdate({
            target: [scheduledJobRuns.job, scheduledJobRuns.runDate],
            set: {
                status: 'running',
                triggeredBy,
                attempts: sql`${scheduledJobRuns.attempts} + 1`,
                summary: null,
                startedAt: sql`now()`,
                finishedAt: null,
            },
            setWhere: sql`(${scheduledJobRuns.status} = 'running' and ${scheduledJobRuns.startedAt} < ${staleBefore})
                or (${scheduledJobRuns.status} = 'failed' and ${scheduledJobRuns.attempts} < ${MAX_ATTEMPTS}
                    and ${scheduledJobRuns.startedAt} < ${retryBefore})`,
        })
        .returning({ attempts: scheduledJobRuns.attempts });
    return row?.attempts ?? null;
}

async function finishRun(job: JobName, date: string, status: 'done' | 'failed', summary: string): Promise<void> {
    await requireDb()
        .update(scheduledJobRuns)
        .set({ status, summary, finishedAt: new Date() })
        .where(and(eq(scheduledJobRuns.job, job), eq(scheduledJobRuns.runDate, date)));
}

/** Accounts and categories may have been edited in Telegram since startup. A failed load keeps the cached list. */
async function reloadFinanceCaches(): Promise<void> {
    const [accounts, categories] = await Promise.allSettled([loadPaymentAccounts(), loadExpenseCategories()]);
    if (accounts.status === 'rejected') {
        console.error('Payment account reload failed; keeping the cached list:', accounts.reason);
    }
    if (categories.status === 'rejected') {
        console.error('Expense category reload failed; keeping the cached list:', categories.reason);
    }
}

const lastErrorAlertAt = new Map<JobName, number>();

/** The scheduler itself failed (database down, table missing): alert at most once an hour per job. */
async function reportSchedulerError(job: JobName, error: unknown): Promise<void> {
    console.error(`Scheduler: ${job} not run:`, error);
    const last = lastErrorAlertAt.get(job) ?? 0;
    if (Date.now() - last < 60 * 60_000) return;
    lastErrorAlertAt.set(job, Date.now());
    await sendTelegramReport(
        `🚨 *Scheduler error* (${job}): ${escapeMarkdown(errorText(error))}\nIt tries again on the next run.`
    );
}

async function runJobDay(job: DailyJob, date: string, today: string, attempt: number): Promise<JobRunResult> {
    let summary: string;
    try {
        summary = await job.run(date, today);
    } catch (error) {
        console.error(`Scheduler: ${job.name} for ${date} failed (attempt ${attempt} of ${MAX_ATTEMPTS}):`, error);
        await finishRun(job.name, date, 'failed', errorText(error)).catch((finishError) =>
            console.error(`Scheduler: could not record the ${job.name} failure:`, finishError)
        );
        if (job.failureText) {
            const next =
                attempt < MAX_ATTEMPTS
                    ? 'I will try again in about 30 minutes.'
                    : 'I will not try again: log them by hand.';
            await sendTelegramReport(
                `${job.failureText(dayLabel(date, today))}\n${escapeMarkdown(errorText(error))}\n${next}`
            );
        }
        return { job: job.name, date, status: 'failed' };
    }
    // The day's work is saved. If this write fails the row stays 'running' and is retried once
    // stale, which logs nothing twice (logged bills and accrued interest are skipped).
    await finishRun(job.name, date, 'done', summary).catch((error) =>
        console.error(`Scheduler: ${job.name} for ${date} ran, but recording it failed:`, error)
    );
    return { job: job.name, date, status: 'done' };
}

async function runDueJobsOnce(triggeredBy: string): Promise<JobRunResult[]> {
    const now = new Date();
    const today = klClock(now).date;
    const results: JobRunResult[] = [];
    let cachesReloaded = false;

    for (const job of JOBS) {
        try {
            const ledger = await loadLedger(job.name, addDays(today, -CATCH_UP_DAYS));
            for (const date of pendingRunDates(job, now, ledger.firstRunDate, ledger.rows)) {
                const attempt = await claimRun(job.name, date, triggeredBy);
                if (attempt == null) continue;
                if (!cachesReloaded) {
                    await reloadFinanceCaches();
                    cachesReloaded = true;
                }
                results.push(await runJobDay(job, date, today, attempt));
            }
        } catch (error) {
            await reportSchedulerError(job.name, error);
        }
    }
    return results;
}

let inFlight: Promise<JobRunResult[]> | null = null;

/** Runs every job that is due and not yet done. Never throws; concurrent callers share one run. */
export function runDueJobs(triggeredBy: string): Promise<JobRunResult[]> {
    if (!inFlight) {
        inFlight = runDueJobsOnce(triggeredBy).finally(() => {
            inFlight = null;
        });
    }
    return inFlight;
}

export function isSchedulerEnabled(): boolean {
    return process.env.SCHEDULER_ENABLED === '1';
}

/** Checks for due jobs now and every TICK_MS while the server is up. */
export function startScheduler(): void {
    if (!isSchedulerEnabled()) {
        console.log('Scheduler off: set SCHEDULER_ENABLED=1 on the deployed server to run the daily jobs');
        return;
    }
    void runDueJobs('startup');
    setInterval(() => void runDueJobs('timer'), TICK_MS).unref();
    console.log('Scheduler on: 9:00 fixed bills and interest (Asia/Kuala_Lumpur)');
}

// ponytail self-check: pure date math, no DB: npx tsx server/dailyJobs.ts
if (require.main === module) {
    const eq = (actual: unknown, expected: unknown, label: string) => {
        const a = JSON.stringify(actual);
        const e = JSON.stringify(expected);
        if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
    };
    // 2026-10-26 09:05 and 07:30 in KL (UTC+8)
    const at0905 = new Date('2026-10-26T01:05:00Z');
    const at0730 = new Date('2026-10-25T23:30:00Z');
    const bills = { at: 9 * 60 };
    const row = (runDate: string, status: string, minutesAgo: number, attempts = 1): LedgerRow => ({
        runDate,
        status,
        startedAt: new Date(at0905.getTime() - minutesAgo * 60_000),
        attempts,
    });

    eq(klClock(at0905), { date: '2026-10-26', minutes: 545 }, 'KL clock');
    eq(addDays('2026-03-01', -1), '2026-02-28', 'addDays across a month');
    eq(pendingRunDates(bills, at0905, null, []), ['2026-10-26'], 'first run starts today');
    eq(pendingRunDates(bills, at0730, null, []), [], 'first run before 9am waits');
    eq(
        pendingRunDates(bills, at0905, '2026-10-20', [row('2026-10-25', 'done', 1440)]),
        ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-26'],
        'missed days from the first run, done day skipped'
    );
    eq(
        pendingRunDates(bills, at0730, '2026-10-01', [row('2026-10-24', 'done', 2000)]),
        ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-25'],
        'before 9am: up to yesterday, 7 days back at most'
    );
    eq(pendingRunDates(bills, at0905, '2026-10-26', [row('2026-10-26', 'running', 5)]), [], 'fresh running row is taken');
    eq(pendingRunDates(bills, at0905, '2026-10-26', [row('2026-10-26', 'running', 20)]), ['2026-10-26'], 'stale running row is retried');
    eq(pendingRunDates(bills, at0905, '2026-10-26', [row('2026-10-26', 'failed', 10)]), [], 'failed day waits 30 minutes');
    eq(pendingRunDates(bills, at0905, '2026-10-26', [row('2026-10-26', 'failed', 40, 2)]), ['2026-10-26'], 'failed day is retried');
    eq(pendingRunDates(bills, at0905, '2026-10-26', [row('2026-10-26', 'failed', 40, 3)]), [], 'third failure gives up');
    console.log('dailyJobs self-check ok');
}
