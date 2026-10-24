import { requireDb } from '../agent/db/client';
import { expenses, incomes } from '../agent/db/schema';
import { isTripFundSpend } from '../agent/services/expenseService';
import { isAccountTransferCategory, parseStoredTransferFee } from '../agent/services/incomeService';
import { enumerateDates } from './dateUtils';

export interface MonthlyCashflowPoint {
    month: string;
    income: number;
    spending: number;
    net: number;
}

export interface DailyCashflowPoint {
    date: string;
    income: number;
    spending: number;
    net: number;
}

/** `count` months ending at `month` (YYYY-MM), oldest first. */
export function monthsEndingAt(month: string, count: number): string[] {
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const monthIndex = parseInt(monthStr, 10) - 1;
    const months: string[] = [];
    for (let offset = count - 1; offset >= 0; offset -= 1) {
        const d = new Date(year, monthIndex - offset, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return months;
}

/**
 * Income and spending per bucket (a month or a day), using the same rules as getSpendingSummary
 * (spending is net of reimbursements plus account-transfer fees; income leaves out
 * reimbursements and account transfers), loading each table once.
 */
async function cashflowBuckets(keys: string[], keyFor: (isoDate: string) => string) {
    const db = requireDb();
    const [expenseRows, incomeRows] = await Promise.all([
        db.select().from(expenses),
        db.select().from(incomes),
    ]);

    const totals = new Map(keys.map((key) => [key, { income: 0, spending: 0 }]));
    const reimbursedByExpenseId = new Map<number, number>();

    for (const row of incomeRows) {
        const bucket = totals.get(keyFor(row.date));

        if (row.expenseId != null && !isAccountTransferCategory(row.category)) {
            const amount = parseFloat(row.amount);
            reimbursedByExpenseId.set(row.expenseId, (reimbursedByExpenseId.get(row.expenseId) ?? 0) + amount);
        }

        if (!bucket) continue;

        if (isAccountTransferCategory(row.category)) {
            const fee = parseStoredTransferFee(row.transferFee);
            if (fee > 0) bucket.spending += fee;
        }

        if (row.expenseId == null && row.category !== 'Account transfer') {
            bucket.income += parseFloat(row.amount);
        }
    }

    for (const row of expenseRows) {
        if (isTripFundSpend(row)) continue;
        const bucket = totals.get(keyFor(row.date));
        if (!bucket) continue;
        const gross = parseFloat(row.amount);
        bucket.spending += Math.max(0, gross - (reimbursedByExpenseId.get(row.id) ?? 0));
    }

    return totals;
}

export async function getMonthlyCashflow(months: string[]): Promise<MonthlyCashflowPoint[]> {
    const totals = await cashflowBuckets(months, (date) => date.slice(0, 7));
    return months.map((month) => {
        const { income, spending } = totals.get(month)!;
        return { month, income, spending, net: income - spending };
    });
}

/** The same income / spending / net as getMonthlyCashflow, for each day from start to end. */
export async function getDailyCashflow(start: string, end: string): Promise<DailyCashflowPoint[]> {
    const dates = enumerateDates(start, end);
    const totals = await cashflowBuckets(dates, (date) => date);
    return dates.map((date) => {
        const { income, spending } = totals.get(date)!;
        return { date, income, spending, net: income - spending };
    });
}
