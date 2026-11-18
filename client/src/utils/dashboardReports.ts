import type { ExpenseOverviewResponse, ExpenseTransaction, IncomeTransaction, MonthlyCashflowPoint, TripSummary } from '../api';
import type { HealthData, HealthStats } from '../hooks/useHealthData';
import { transferFeesToExpenseEntries } from './bankCharges';
import { bars, cards, escapeHtml, note, table, type Report } from './pdfReport';

type Money = (value: number) => string;
const sum = <T,>(rows: T[], pick: (row: T) => number) => rows.reduce((total, row) => total + pick(row), 0);
const byDate = <T extends { date: string }>(rows: T[]) => [...rows].sort((a, b) => a.date.localeCompare(b.date));
const net = (e: ExpenseTransaction) => e.netAmount ?? Math.max(0, (e.grossAmount ?? e.amount) - (e.reimbursed ?? 0));

export function expenseReport(overview: ExpenseOverviewResponse, transactions: ExpenseTransaction[], incomes: IncomeTransaction[], money: Money): Report {
    const entries = byDate([...transactions.filter((t) => t.tripLeg !== 'fund'), ...transferFeesToExpenseEntries(incomes)]);
    const fixed = new Set(overview.fixed.map((r) => r.category));
    const earned = incomes.filter((i) => i.expenseId == null && i.category !== 'Account transfer');
    const months = [...new Set([...entries.map((e) => e.date.slice(0, 7)), ...earned.map((i) => i.date.slice(0, 7))])].sort();
    if (!months.length) months.push(overview.month);
    const spent = sum(entries, net);
    const income = sum(earned, (i) => i.amount);
    const categoryTotals = new Map<string, number>();
    for (const e of entries) categoryTotals.set(e.category, (categoryTotals.get(e.category) ?? 0) + net(e));
    let body = cards([['Income', money(income)], ['Recorded spending', money(spent)], ['Net cashflow', money(income - spent)], ['Transactions', entries.length]]);
    body += note('All records in the selected period are included, regardless of the on-screen category filter. Spending is net of reimbursements and includes transfer fees. Trip-fund purchases are excluded because the exchange is already counted.');
    body += bars('Spending by category', [...categoryTotals].sort((a, b) => b[1] - a[1]), money);
    body += table('Monthly summary', ['Month', 'Income', 'Fixed-category spend', 'Other spend', 'Net'], months.map((month) => {
        const rows = entries.filter((e) => e.date.startsWith(month));
        const incoming = sum(earned.filter((i) => i.date.startsWith(month)), (i) => i.amount);
        return [month, money(incoming), money(sum(rows.filter((e) => fixed.has(e.category)), net)), money(sum(rows.filter((e) => !fixed.has(e.category)), net)), money(incoming - sum(rows, net))];
    }));
    body += table('Current fixed-expense plan (reference only)', ['Category', 'Configured amount'], overview.fixed.map((f) => [f.category, money(f.amount)]));
    body += note('The plan above reflects current settings, not historical payments, and is not added to recorded spending. Recorded expenses are grouped using the current fixed-expense categories.');
    for (const month of months) {
        const rows = entries.filter((e) => e.date.startsWith(month));
        body += `<div class="month"><h2>${escapeHtml(month)} / Transaction details</h2></div>`;
        body += cards([['Recorded spending', money(sum(rows, net))], ['Reimbursed', money(sum(rows, (e) => e.reimbursed ?? 0))]]);
        for (const [label, group] of [['Fixed-category expenses', rows.filter((e) => fixed.has(e.category))], ['Other expenses', rows.filter((e) => !fixed.has(e.category))]] as const) {
            body += table(label, ['Date', 'Category / description', 'Account', 'Gross', 'Reimbursed', 'Net'], group.map((e) => [e.date, `${e.category}: ${e.description}`, e.paymentMethod, money(e.grossAmount ?? e.amount), money(e.reimbursed ?? 0), money(net(e))]));
        }
        body += table('Income (excluding transfers and reimbursements)', ['Date', 'Category', 'Description', 'Amount'], byDate(earned.filter((i) => i.date.startsWith(month))).map((i) => [i.date, i.category, i.description, money(i.amount)]));
    }
    return { title: 'Expense report', subtitle: `${overview.start} to ${overview.end}`, body };
}

export function cashflowReport(year: string, series: MonthlyCashflowPoint[], money: Money): Report {
    const rows = [...series].filter((p) => p.month.startsWith(`${year}-`)).sort((a, b) => a.month.localeCompare(b.month));
    const income = sum(rows, (p) => p.income), spending = sum(rows, (p) => p.spending);
    return { title: 'Yearly cashflow report', subtitle: `${year} / January to December / recorded activity`, body:
        cards([['Income', money(income)], ['Spending', money(spending)], ['Net cashflow', money(income - spending)], ['Savings rate', income > 0 ? `${((income - spending) / income * 100).toFixed(1)}%` : 'N/A']]) +
        note('Recorded activity as of generation time; future months are not forecasts. Income excludes transfers and reimbursements. Spending is after reimbursements and includes transfer fees; trip-fund purchases are counted at exchange.') +
        bars('Monthly income', rows.map((p) => [p.month, p.income]), money) +
        bars('Monthly spending', rows.map((p) => [p.month, p.spending]), money) +
        bars('Monthly net cashflow', rows.map((p) => [p.month, p.net]), money) +
        table('Monthly details', ['Month', 'Income', 'Spending', 'Net'], rows.map((p) => [p.month, money(p.income), money(p.spending), money(p.net)])) };
}

export function tripReport(s: TripSummary, money: Money): Report {
    const fx = (value: number) => `${s.trip.tripCurrency} ${value.toLocaleString('en-MY', { maximumFractionDigits: 2 })}`;
    return { title: `Trip report: ${s.trip.name}`, subtitle: `${s.trip.startDate ?? 'No start date'} to ${s.trip.endDate ?? 'No end date'}`, body:
        cards([['Total spent', money(s.spentMyr)], ['Trip total', money(s.tripTotalMyr)], ['Per day', s.days && s.days > 0 ? money(s.spentMyr / s.days) : 'N/A'], ['Fund remaining', fx(s.fundRemaining)]]) +
        note(s.trip.notes ?? '') +
        table('Funding and spending summary', ['Item', 'Amount'], [['Exchanged', money(s.exchangedMyr)], ['Fund received', fx(s.fundReceived)], ['Fund spent', fx(s.fundSpent)], ['Fund spent (MYR)', money(s.fundSpentMyr)], ['Card', money(s.cardMyr)], ['Linked', money(s.linkedMyr)], ['Reimbursed', money(s.reimbursedMyr)]]) +
        note('Total spent reflects purchases. Trip total includes the exchange, card and linked spending after reimbursements. Exchange and fund purchases are shown separately below; adding all detail rows would count the fund twice.') +
        bars('Spending by category (MYR)', s.byCategory.map((c) => [c.category, c.amountMyr]), money) +
        table('Transactions by date', ['Date', 'Type / category', 'Description / account', 'Foreign amount', 'Gross MYR', 'Net MYR'], byDate(s.expenses).map((e) => [e.date, `${e.tripLeg ?? 'linked'} / ${e.category}`, `${e.description}${e.paymentMethod ? ` / ${e.paymentMethod}` : ''}`, e.fxAmount == null ? '-' : `${e.fxCurrency ?? s.trip.tripCurrency} ${e.fxAmount}`, money(e.amount), money(e.netAmount)])) };
}

export function healthReport(data: HealthData, stats: HealthStats, mealsOnly: boolean): Report {
    const logged = data.nutritionSeries.filter((d) => d.mealCount > 0 || d.calories > 0 || d.protein > 0);
    const avg = (pick: (d: typeof logged[number]) => number) => logged.length ? Math.round(sum(logged, pick) / logged.length) : null;
    const averageCalories = avg((d) => d.calories), averageProtein = avg((d) => d.protein);
    let body = mealsOnly
        ? cards([['Meals logged', data.meals.length], ['Days logged', logged.length], ['Average calories', averageCalories == null ? 'N/A' : `${averageCalories} kcal/day`], ['Average protein', averageProtein == null ? 'N/A' : `${averageProtein} g/day`]])
        : cards([['Latest weight', data.latestWeight ? `${data.latestWeight.weightKg} kg (${data.latestWeight.date})` : 'N/A'], ['Training days', stats.trainingDays], ['Workout sessions', stats.sessions], ['Average steps', stats.steps.loggedDays ? stats.steps.avg : 'N/A']]);
    body += note('Only logged records are detailed. Missing days are not treated as zero intake or zero activity. Averages use logged days.');
    if (mealsOnly) {
        body += bars('Daily calories (kcal)', byDate(logged).map((d) => [d.date, d.calories]), (n) => `${n.toLocaleString('en-MY')} kcal`);
        body += table('Daily nutrition and targets', ['Date', 'Meals', 'Calories / target', 'Protein / target (g)', 'Carbs (g)', 'Fat (g)'], byDate(logged).map((d) => [d.date, d.mealCount, `${d.calories} / ${d.targets.calories}`, `${d.protein} / ${d.targets.protein}`, d.carbs, d.fat]));
        body += table('Meal details', ['Date', 'Meal / description', 'Calories (kcal)', 'Protein (g)', 'Carbs (g)', 'Fat (g)'], byDate(data.meals).map((m) => [m.date, `${m.mealType ?? 'Meal'}: ${m.description}`, m.calories, m.proteinG, m.carbsG, m.fatG]));
    } else {
        body += bars('Daily steps', byDate(data.dailyActivity).map((d) => [d.date, d.steps]), (n) => n.toLocaleString('en-MY'));
        body += table('Body weight', ['Date', 'Weight (kg)'], byDate(data.bodyWeightLogs).map((d) => [d.date, d.weightKg]));
        body += table('Daily activity', ['Date', 'Steps'], byDate(data.dailyActivity).map((d) => [d.date, d.steps]));
        body += table('Workout details', ['Date', 'Exercise', 'Sets / reps', 'Weight (kg)', 'Minutes', 'Burn (kcal)'], byDate(data.history).map((w) => [w.date, w.exercise, `${w.sets ?? '-'} / ${w.reps ?? '-'}`, w.weightsKg ?? w.weightKg, w.durationMin, w.caloriesBurned]));
        body += cards([['Meal days logged', logged.length], ['Average calories', averageCalories == null ? 'N/A' : `${averageCalories} kcal/day`], ['Protein hit rate', stats.adherence.loggedDays ? `${stats.adherence.proteinHitPct}%` : 'N/A']]);
        body += note('Workout calorie burn is an estimate. Latest weight may predate the selected month; its date is shown.');
    }
    return { title: mealsOnly ? 'Monthly meal report' : 'Monthly health report', subtitle: data.month, body };
}
