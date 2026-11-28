import { categoryExpenseChart, fixedExpensePie } from './expenseReportCharts';
import type { CarServiceVisit, CarVisitType, ExpenseOverviewResponse, ExpenseTransaction, IncomeTransaction, MonthlyCashflowPoint, TripSummary } from '../api';
import type { HealthData, HealthStats } from '../hooks/useHealthData';
import { transferFeesToExpenseEntries } from './bankCharges';
import { bars, cards, comboChart, columnChart, comparisonBars, escapeHtml, note, table, type Report } from './pdfReport';

type Money = (value: number) => string;
const sum = <T,>(rows: T[], pick: (row: T) => number) => rows.reduce((total, row) => total + pick(row), 0);
const byDate = <T extends { date: string }>(rows: T[]) => [...rows].sort((a, b) => a.date.localeCompare(b.date));
const net = (e: ExpenseTransaction) => e.netAmount ?? Math.max(0, (e.grossAmount ?? e.amount) - (e.reimbursed ?? 0));

export function expenseReport(overview: ExpenseOverviewResponse, transactions: ExpenseTransaction[], incomes: IncomeTransaction[], money: Money, budgetMonths = 1): Report {
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
    const categoryNames = [...new Set([...overview.variable.map(v => v.category), ...[...categoryTotals.keys()].filter(category => !fixed.has(category))])];
    body += categoryExpenseChart(categoryNames.map(category => ({
        category,
        expenses: categoryTotals.get(category) ?? 0,
        budget: overview.variable.find(v => v.category === category)?.monthlyBudget == null ? null : overview.variable.find(v => v.category === category)!.monthlyBudget * budgetMonths,
    })), money);
    body += note('Blue columns show category budgets; the red line shows recorded expenses. Budget amounts appear below each category. Categories without budgets are marked No budget set.');
    body += fixedExpensePie(overview.fixed, money);
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
        columnChart('Income and spending by month (MYR)', rows.map(p => ({ label: p.month.slice(5), first: p.income, second: p.spending })), 'Income', 'Spending') +
        columnChart('Quarterly income and spending (MYR)', [1,2,3,4].map(q => {
            const quarter = rows.filter(p => Math.ceil(Number(p.month.slice(5)) / 3) === q);
            return { label: `Q${q}`, first: sum(quarter,p=>p.income), second: sum(quarter,p=>p.spending) };
        }), 'Income', 'Spending') +
        bars('Savings rate by month', rows.filter(p=>p.income>0).map(p=>[p.month,(p.income-p.spending)/p.income*100]), n=>`${n.toFixed(1)}%`) +
        note('Savings rate = (income - spending) / income. Months with no income are omitted from this chart. Negative rates indicate spending above income.') +
        table('Monthly details', ['Month', 'Income', 'Spending', 'Net'], rows.map((p) => [p.month, money(p.income), money(p.spending), money(p.net)])) };
}

export function carServiceReport(visits: CarServiceVisit[], filter: CarVisitType | 'All', query: string, money: Money): Report {
    const totalFor = (type: CarVisitType) => sum(visits.filter((visit) => visit.visitType === type), (visit) => visit.total);
    const details = visits.map((visit) => {
        const heading = [visit.date, visit.visitType, money(visit.total)].join(' · ');
        const mileage = visit.odometerKm != null
            ? visit.odometerKm.toLocaleString('en-MY') + ' km' : '';
        const metadata = [mileage, visit.notes].filter(Boolean).join(' · ');
        const rows = visit.items.map((item) => [item.description, item.category, money(item.amount)]);
        return (rows.length ? table(heading, ['Description', 'Category', 'Amount'], rows)
            : '<h2>' + escapeHtml(heading) + '</h2>' + note('No items recorded.')) + (metadata ? note(metadata) : '');
    });
    return {
        title: 'Car service report',
        subtitle: [filter === 'All' ? 'All service visits' : filter, query.trim()].filter(Boolean).join(' · '),
        body: cards([['Total spend', money(sum(visits, (visit) => visit.total))],
            ['Normal service', money(totalFor('Normal service'))], ['Accessory repair', money(totalFor('Accessory repair'))],
            ['Visits', visits.length]]) + details.join(''),
    };
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
    if (mealsOnly) return nutritionWorkoutReport(data, stats);
    const logged = data.nutritionSeries.filter((d) => d.mealCount > 0 || d.calories > 0 || d.protein > 0);
    const avg = (pick: (d: typeof logged[number]) => number) => logged.length ? Math.round(sum(logged, pick) / logged.length) : null;
    const averageCalories = avg((d) => d.calories), averageProtein = avg((d) => d.protein);
    let body = mealsOnly
        ? cards([['Meals logged', data.meals.length], ['Days logged', logged.length], ['Average calories', averageCalories == null ? 'N/A' : `${averageCalories} kcal/day`], ['Average protein', averageProtein == null ? 'N/A' : `${averageProtein} g/day`]])
        : cards([['Latest weight', data.latestWeight ? `${data.latestWeight.weightKg} kg (${data.latestWeight.date})` : 'N/A'], ['Training days', stats.trainingDays], ['Workout sessions', stats.sessions], ['Average steps', stats.steps.loggedDays ? stats.steps.avg : 'N/A']]);
    body += note('Figures use logged records. Missing days are not treated as zero intake or zero activity. Averages use logged days.');
    if (mealsOnly) {
        body += comboChart('Daily calories vs target', byDate(logged).map(d=>({label:d.date.slice(8),actual:d.calories,target:d.targets.calories})), 'Calories (kcal)', 'Target (kcal)');
        body += comboChart('Daily protein vs target', byDate(logged).map(d=>({label:d.date.slice(8),actual:d.protein,target:d.targets.protein})), 'Protein (g)', 'Target (g)');
        body += bars('Macro totals', [['Protein',sum(logged,d=>d.protein)],['Carbs',sum(logged,d=>d.carbs)],['Fat',sum(logged,d=>d.fat)]],n=>`${Math.round(n)} g`);
    } else {
        body += bars('Daily steps',byDate(data.dailyActivity).map(d=>[d.date,d.steps]),n=>n.toLocaleString('en-MY'));
        body += bars('Body weight trend',byDate(data.bodyWeightLogs).map(d=>[d.date,d.weightKg]),n=>`${n} kg`);
        body += workoutFigures(data,stats);
    }
    return { title: mealsOnly ? 'Monthly meal report' : 'Monthly health report', subtitle: data.month, body };
}

function workoutFigures(data: HealthData, stats: HealthStats) {
    const burn = new Map<string, number>();
    for (const w of data.history) if (w.caloriesBurned != null) burn.set(w.date, (burn.get(w.date) ?? 0) + w.caloriesBurned);
    return cards([['Sessions',stats.sessions],['Total sets',stats.sets ?? 0],['Training days',stats.trainingDays],['Best streak',`${stats.streak?.best ?? 0} days`]]) +
        comboChart('Daily training volume',byDate(data.workoutSeries).map(d=>({label:d.date.slice(8),actual:d.totalSets,target:d.sessionCount})),'Sets','Sessions') +
        bars('Most trained exercises',data.topExercises.map(e=>[e.exercise,e.count]),n=>`${n} entries`) +
        bars('Workout burn by date (estimate)',[...burn.entries()].sort((a,b)=>a[0].localeCompare(b[0])),n=>`${Math.round(n)} kcal`);
}
export function workoutReport(data: HealthData, stats: HealthStats): Report {
    return nutritionWorkoutReport(data, stats);
}

/** Shared export for both the Meals and Workouts tabs. */
export function nutritionWorkoutReport(data: HealthData, stats: HealthStats): Report {
    const logged = byDate(data.nutritionSeries.filter(d=>d.mealCount>0 || d.calories>0 || d.protein>0));
    const average = (rows: typeof logged, pick: (d: typeof logged[number]) => number) => rows.length ? Math.round(sum(rows,pick)/rows.length) : null;
    const trainingDates = new Set(data.workoutSeries.filter(d=>d.sessionCount>0).map(d=>d.date));
    const trainingMeals = logged.filter(d=>trainingDates.has(d.date));
    const restMeals = logged.filter(d=>!trainingDates.has(d.date));
    const avgCalories = average(logged,d=>d.calories), avgProtein = average(logged,d=>d.protein);
    let body = cards([['Meals logged',data.meals.length],['Meal days logged',logged.length],['Average calories',avgCalories == null ? 'N/A' : `${avgCalories} kcal/day`],['Average protein',avgProtein == null ? 'N/A' : `${avgProtein} g/day`]]);
    body += cards([['Protein target hit',stats.adherence.loggedDays ? `${stats.adherence.proteinHitPct}%` : 'N/A'],['Calories in target band',stats.adherence.loggedDays ? `${stats.adherence.calorieHitPct}%` : 'N/A'],['Training meal days',trainingMeals.length],['Other meal days',restMeals.length]]);
    body += note('Nutrition averages use logged meal days. Other meal days have no logged workout; missing workout logs do not prove a rest day. Missing nutrition days are excluded, not treated as zero.');
    body += comboChart('Daily calories vs target',logged.map(d=>({label:d.date.slice(8),actual:d.calories,target:d.targets.calories})),'Calories (kcal)','Target (kcal)');
    body += comboChart('Daily protein vs target',logged.map(d=>({label:d.date.slice(8),actual:d.protein,target:d.targets.protein})),'Protein (g)','Target (g)');
    if (trainingMeals.length && restMeals.length) {
        body += comparisonBars('Nutrition on training vs other logged days', [{label:'Average calories (kcal/day)',first:average(trainingMeals,d=>d.calories)!,second:average(restMeals,d=>d.calories)!}], 'Training days','Other days',n=>`${n} kcal`);
        body += comparisonBars('Protein on training vs other logged days', [{label:'Average protein (g/day)',first:average(trainingMeals,d=>d.protein)!,second:average(restMeals,d=>d.protein)!}], 'Training days','Other days',n=>`${n} g`);
    } else body += note('Training-day nutrition comparisons need meal logs on both training days and days without a logged workout.');
    body += bars('Macro energy from logged meals', [['Protein',sum(logged,d=>d.protein)*4],['Carbs',sum(logged,d=>d.carbs)*4],['Fat',sum(logged,d=>d.fat)*9]],n=>`${Math.round(n).toLocaleString('en-MY')} kcal`);
    body += note('Macro energy is estimated at 4 kcal/g for protein and carbs, and 9 kcal/g for fat; totals depend on macro logging completeness.');
    body += workoutFigures(data,stats);
    body += note('Workout burn is an estimate and excludes baseline metabolism and steps. This report summarizes logged activity; no individual meal or workout detail tables are included.');
    return { title:'Monthly nutrition and workout report',subtitle:data.month,body };
}
