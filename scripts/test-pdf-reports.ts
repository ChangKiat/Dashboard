import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expenseReport, cashflowReport, healthReport, tripReport } from '../client/src/utils/dashboardReports';
import { reportHtml } from '../client/src/utils/pdfReport';
import type { ExpenseOverviewResponse, ExpenseTransaction, IncomeTransaction, TripSummary } from '../client/src/api';
import type { HealthData, HealthStats } from '../client/src/hooks/useHealthData';

const money = (n: number) => `RM ${n.toFixed(2)}`;
const overview: ExpenseOverviewResponse = {
    month: '2026-11', start: '2026-10-01', end: '2026-11-30', salaryAfterTax: 5000,
    fixed: [{ category: 'Rent', amount: 1000 }], variable: [],
    totals: { fixExpensesTotal: 1000, amountCanUse: 4000, budget: 2000, actualSpend: 0, totalIncome: 0, totalReimbursed: 0, netCashflow: 0 },
};
const expenses: ExpenseTransaction[] = [
    { id: 1, date: '2026-11-15', amount: 100, reimbursed: 20, netAmount: 80, category: 'Food', description: '<script>alert("unsafe")</script> & lunch' },
    { id: 2, date: '2026-11-01', amount: 1000, category: 'Rent', description: 'Monthly rent' },
    { id: 3, date: '2026-10-01', amount: 200, category: 'Travel', description: 'Exchange', tripLeg: 'exchange' },
    { id: 4, date: '2026-11-02', amount: 150, category: 'Travel', description: 'FUND-EXCLUDED', tripLeg: 'fund' },
    { id: 5, date: '2026-11-03', amount: 30, category: 'Food', description: 'Earlier meal' },
];
const incomes: IncomeTransaction[] = [
    { id: 1, date: '2026-11-01', amount: 5000, category: 'Salary', description: 'Salary', source: null, expenseId: null },
    { id: 2, date: '2026-11-15', amount: 20, category: 'Reimbursement', description: 'Payback', source: null, expenseId: 1 },
    { id: 3, date: '2026-11-02', amount: 500, category: 'Account transfer', description: 'Transfer', source: null, expenseId: null, transferFee: 5 },
];
const report = expenseReport(overview, expenses, incomes, money);
assert.match(report.body, /RM 1315\.00/); // 80 + 1000 + 200 + 30 + 5; fund excluded.
assert.match(report.body, /RM 3685\.00/);
assert.ok(!report.body.includes('FUND-EXCLUDED'));
assert.ok(!report.body.includes('<script>'));
assert.match(report.body, /&lt;script&gt;/);
assert.ok(report.body.indexOf('Earlier meal') < report.body.indexOf('&lt;script&gt;'));
assert.equal(expenses[0].id, 1, 'Report sorting must not mutate dashboard data');
const yearly = cashflowReport('2026', [
    { month: '2026-02', income: 100, spending: 200, net: -100 },
    { month: '2026-01', income: 400, spending: 100, net: 300 },
    { month: '2025-12', income: 99999, spending: 0, net: 99999 },
], money);
assert.match(yearly.body, /40\.0%/);
assert.ok(!yearly.body.includes('99999'));
assert.ok(yearly.body.indexOf('2026-01') < yearly.body.indexOf('2026-02'));
assert.match(cashflowReport('2026', [], money).body, /N\/A/);

const health: HealthData = { month: '2026-11', workoutSeries: [], nutritionSeries: [], topExercises: [], weightTrend: {}, prs: [], history: [], meals: [], bodyWeightLogs: [], latestWeight: null, previousWeight: null, dailyActivity: [], nutritionSettings: null };
const stats = { trainingDays: 0, sessions: 0, steps: { loggedDays: 0, avg: 0 }, adherence: { loggedDays: 0, proteinHitPct: 0 } } as HealthStats;
assert.match(healthReport(health, stats, true).body, /No records/);
assert.match(healthReport(health, stats, false).body, /N\/A/);
health.meals = [
    { id: 1, date: '2026-11-02', mealType: 'Lunch', description: 'Chicken and rice', proteinG: 35, carbsG: 50, fatG: null, calories: 450 },
    { id: 2, date: '2026-11-01', mealType: 'Breakfast', description: 'Eggs & toast', proteinG: 20, carbsG: 30, fatG: 10, calories: 290 },
];
health.nutritionSeries = health.meals.map((m) => ({ date: m.date, calories: m.calories!, protein: m.proteinG, carbs: m.carbsG!, fat: m.fatG ?? 0, mealCount: 1, targets: { calories: 2000, protein: 100, carbs: 250, fat: 60 } }));
health.dailyActivity = [{ id: 1, date: '2026-11-01', steps: 8000 }];
health.bodyWeightLogs = [{ id: 1, date: '2026-11-01', weightKg: 70 }];
health.latestWeight = health.bodyWeightLogs[0];
health.history = [{ id: 1, date: '2026-11-01', exercise: 'Bench press', sets: 3, reps: 10, weightKg: 40, weightsKg: null, durationMin: null, notes: null, caloriesBurned: 80, fatBurnG: null, sessionId: 'test', sessionLabel: null, supersetGroup: null }];
const mealBody = healthReport(health, stats, true).body;
assert.match(mealBody, /370 kcal\/day/);
assert.ok(mealBody.indexOf('Eggs &amp; toast') < mealBody.indexOf('Chicken and rice'));
assert.match(healthReport(health, stats, false).body, /Bench press/);
const trip: TripSummary = { trip: { id: 1, name: '日本 / Japan', startDate: '2026-11-01', endDate: '2026-11-05', tripCurrency: 'JPY', notes: 'A trip with family' }, exchangedMyr: 1000, fundReceived: 30000, fundSpent: 15000, fundSpentMyr: 500, fundRemaining: 15000, cardMyr: 200, linkedMyr: 100, reimbursedMyr: 50, spentMyr: 750, tripTotalMyr: 1250, days: 5, byCategory: [{ category: 'Dining', amountMyr: 750, count: 1 }], latestExchangeRate: 1 / 30, expenses: [] };
assert.match(tripReport(trip, money).body, /RM 1250\.00/);
assert.match(tripReport(trip, money).body, /JPY 15,000/);

// Optional deterministic fixtures for print layout QA, including a multi-page table.
if (process.env.REPORT_QA_DIR) {
    const dir = process.env.REPORT_QA_DIR;
    mkdirSync(dir, { recursive: true });
    const longExpenses = Array.from({ length: 90 }, (_, i) => ({ id: i + 20, date: `2026-11-${String(i % 28 + 1).padStart(2, '0')}`, amount: i + 1, category: 'Food', description: `Meal ${i + 1} / 日本 / A longer description to check wrapping and pagination in the detailed transaction table.` }));
    const fixtures = { expenses: expenseReport(overview, [...expenses, ...longExpenses], incomes, money), yearly, trip: tripReport(trip, money), meals: healthReport(health, stats, true), health: healthReport(health, stats, false) };
    for (const [name, fixture] of Object.entries(fixtures)) writeFileSync(join(dir, `${name}.html`), reportHtml(fixture));
}
console.log('PDF report checks passed (accounting, sorting, escaping, year scope, empty data, trip currency).');
