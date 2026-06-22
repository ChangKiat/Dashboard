export interface DateRange {
    start: string;
    end: string;
}

export interface ExpenseDailyPoint {
    date: string;
    total: number;
    byCategory: Record<string, number>;
}

export interface ExpenseDailyResponse {
    start: string;
    end: string;
    series: ExpenseDailyPoint[];
}

export interface ExpenseOverviewVariable {
    category: string;
    monthlyBudget: number;
    spending: number;
    overBudget: boolean;
}

export interface ExpenseOverviewFixed {
    category: string;
    amount: number;
}

export interface ExpenseOverviewResponse {
    month: string;
    salaryAfterTax: number;
    variable: ExpenseOverviewVariable[];
    fixed: ExpenseOverviewFixed[];
    totals: {
        fixExpensesTotal: number;
        amountCanUse: number;
        budget: number;
        actualSpend: number;
    };
}

export interface ExpenseTransaction {
    id: number;
    date: string;
    amount: number;
    category: string;
    description: string;
}

export interface ExpenseTransactionsResponse {
    month: string;
    start: string;
    end: string;
    entries: ExpenseTransaction[];
}

export interface FixedExpenseConfig {
    id: number;
    description: string;
    category: string;
    amount: number;
    dayOfMonth: number;
    frequencyMonths: number;
    startMonth: number;
    currency: string;
}

export interface FixedExpensesResponse {
    entries: FixedExpenseConfig[];
}

export interface WorkoutDailyPoint {
    date: string;
    sessionCount: number;
    totalSets: number;
    exercises: string[];
}

export interface WorkoutDailyResponse {
    start: string;
    end: string;
    series: WorkoutDailyPoint[];
    totalSessions: number;
    totalSets: number;
}

export interface WorkoutExercisesResponse {
    start: string;
    end: string;
    top: { exercise: string; count: number }[];
    weightTrend: Record<string, { date: string; weightKg: number }[]>;
    uniqueExercises: number;
    mostTrained: string | null;
    totalSessions: number;
}

export interface PersonalRecord {
    exercise: string;
    weightKg: number;
    reps: number | null;
    sets: number | null;
    date: string;
}

export interface WorkoutPRsResponse {
    prs: PersonalRecord[];
    heaviest: PersonalRecord | null;
}

export interface WorkoutEntry {
    id: number;
    date: string;
    exercise: string;
    sets: number | null;
    reps: number | null;
    weightKg: number | null;
    durationMin: number | null;
    notes: string | null;
    caloriesBurned: number | null;
    fatBurnG: number | null;
}

export interface WorkoutHistoryResponse {
    start: string;
    end: string;
    entries: WorkoutEntry[];
}

export interface NutritionDailyPoint {
    date: string;
    protein: number;
    carbs: number;
    fat: number;
    calories: number;
    mealCount: number;
    targets: {
        protein: number;
        carbs: number;
        fat: number;
        calories: number;
    };
}

export interface NutritionDailyResponse {
    start: string;
    end: string;
    series: NutritionDailyPoint[];
    targets: NutritionDailyPoint['targets'] & { bodyWeightKg: number | null };
    totals: {
        protein: number;
        carbs: number;
        fat: number;
        calories: number;
        mealCount: number;
    };
    averages: {
        calories: number;
        protein: number;
        daysWithData: number;
    };
}

export interface MealEntry {
    id: number;
    date: string;
    mealType: string | null;
    description: string;
    proteinG: number;
    carbsG: number | null;
    fatG: number | null;
    calories: number | null;
}

export interface MealsResponse {
    start: string;
    end: string;
    entries: MealEntry[];
}

function qs(range: DateRange): string {
    return `start=${range.start}&end=${range.end}`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed: ${res.status}`);
    }
    return res.json();
}

export function fetchExpenseDaily(range: DateRange) {
    return fetchJson<ExpenseDailyResponse>(`/api/expenses/daily?${qs(range)}`);
}

export function fetchExpenseOverview(month: string) {
    return fetchJson<ExpenseOverviewResponse>(`/api/expenses/overview?month=${month}`);
}

export function fetchExpenseTransactions(month: string) {
    return fetchJson<ExpenseTransactionsResponse>(`/api/expenses/transactions?month=${month}`);
}

export function fetchFixedExpenses() {
    return fetchJson<FixedExpensesResponse>('/api/expenses/fixed');
}

export function updateExpenseTransaction(
    id: number,
    fields: Partial<Pick<ExpenseTransaction, 'date' | 'amount' | 'category' | 'description'>>
) {
    return fetchJson<{ ok: true }>(`/api/expenses/transactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
    });
}

export function deleteExpenseTransaction(id: number) {
    return fetchJson<{ ok: true }>(`/api/expenses/transactions/${id}`, { method: 'DELETE' });
}

export function updateFixedExpense(
    id: number,
    fields: Partial<
        Pick<FixedExpenseConfig, 'description' | 'category' | 'amount' | 'dayOfMonth' | 'frequencyMonths'>
    >
) {
    return fetchJson<{ ok: true }>(`/api/expenses/fixed/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
    });
}

export function deleteFixedExpense(id: number) {
    return fetchJson<{ ok: true }>(`/api/expenses/fixed/${id}`, { method: 'DELETE' });
}

export function fetchWorkoutDaily(range: DateRange) {
    return fetchJson<WorkoutDailyResponse>(`/api/workouts/daily?${qs(range)}`);
}

export function fetchWorkoutExercises(range: DateRange) {
    return fetchJson<WorkoutExercisesResponse>(`/api/workouts/exercises?${qs(range)}`);
}

export function fetchWorkoutPRs() {
    return fetchJson<WorkoutPRsResponse>('/api/workouts/prs');
}

export function fetchWorkoutHistory(range: DateRange) {
    return fetchJson<WorkoutHistoryResponse>(`/api/workouts/history?${qs(range)}`);
}

export function updateWorkout(
    id: number,
    fields: Partial<
        Pick<
            WorkoutEntry,
            | 'date'
            | 'exercise'
            | 'sets'
            | 'reps'
            | 'weightKg'
            | 'durationMin'
            | 'notes'
            | 'caloriesBurned'
            | 'fatBurnG'
        >
    >
) {
    return fetchJson<{ ok: true }>(`/api/workouts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
    });
}

export function deleteWorkout(id: number) {
    return fetchJson<{ ok: true }>(`/api/workouts/${id}`, { method: 'DELETE' });
}

export function fetchNutritionDaily(range: DateRange) {
    return fetchJson<NutritionDailyResponse>(`/api/nutrition/daily?${qs(range)}`);
}

export function fetchMeals(range: DateRange) {
    return fetchJson<MealsResponse>(`/api/nutrition/meals?${qs(range)}`);
}

export function updateMeal(
    id: number,
    fields: Partial<
        Pick<MealEntry, 'date' | 'description' | 'mealType' | 'proteinG' | 'carbsG' | 'fatG' | 'calories'>
    >
) {
    return fetchJson<{ ok: true }>(`/api/nutrition/meals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
    });
}

export function deleteMeal(id: number) {
    return fetchJson<{ ok: true }>(`/api/nutrition/meals/${id}`, { method: 'DELETE' });
}

export function fetchHealth() {
    return fetchJson<{ ok: boolean; database: string; telegramUser: string }>('/api/health');
}
