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
        totalIncome: number;
        totalReimbursed: number;
        netCashflow: number;
    };
}

export interface ExpenseReimbursement {
    id: number;
    source: string | null;
    amount: number;
}

export type TripLeg = 'exchange' | 'fund' | 'card';

export interface ExpenseTransaction {
    id: number;
    date: string;
    amount: number;
    category: string;
    description: string;
    paymentMethod?: string | null;
    /** Destination investment account when this expense funds an investment. */
    toInvestmentAccount?: string | null;
    grossAmount?: number;
    reimbursed?: number;
    netAmount?: number;
    reimbursements?: ExpenseReimbursement[];
    tripId?: number | null;
    tripLeg?: TripLeg | null;
    fxAmount?: number | null;
    fxCurrency?: string | null;
    fxRate?: number | null;
}

export interface Trip {
    id: number;
    name: string;
    startDate: string | null;
    endDate: string | null;
    tripCurrency: string;
    notes: string | null;
}

export interface TripExpense {
    id: number;
    date: string;
    amount: number;
    category: string;
    description: string;
    paymentMethod: string | null;
    tripLeg: TripLeg | null;
    fxAmount: number | null;
    fxCurrency: string | null;
    fxRate: number | null;
}

export interface TripSummary {
    trip: Trip;
    exchangedMyr: number;
    fundReceived: number;
    fundSpent: number;
    fundRemaining: number;
    cardMyr: number;
    tripTotalMyr: number;
    latestExchangeRate: number | null;
    expenses: TripExpense[];
}

export interface ExpenseTransactionsResponse {
    month: string;
    start: string;
    end: string;
    entries: ExpenseTransaction[];
}

export interface IncomeTransaction {
    id: number;
    date: string;
    amount: number;
    category: string;
    description: string;
    source: string | null;
    expenseId: number | null;
    paymentMethod?: string | null;
    fromPaymentMethod?: string | null;
}

export interface IncomeTransactionsResponse {
    month: string;
    start: string;
    end: string;
    entries: IncomeTransaction[];
}

export interface IncomeDailyPoint {
    date: string;
    total: number;
    byCategory: Record<string, number>;
}

export interface IncomeDailyResponse {
    start: string;
    end: string;
    series: IncomeDailyPoint[];
}

export type LoanMethod = 'reducing' | 'flat' | 'included';

export interface FixedExpenseConfig {
    id: number;
    description: string;
    category: string;
    amount: number;
    dayOfMonth: number;
    frequencyMonths: number;
    startMonth: number;
    currency: string;
    paymentMethod?: string | null;
    toInvestmentAccount?: string | null;
    instrumentId?: number | null;
    instrumentName?: string | null;
    contributedThisMonth?: boolean;
    loanMethod?: LoanMethod | null;
    originalPrincipal?: number | null;
    remainingPrincipal?: number | null;
    annualRatePct?: number | null;
    tenureMonths?: number | null;
    loanStartDate?: string | null;
}

export interface FixedExpensesResponse {
    entries: FixedExpenseConfig[];
}

export type InterestFrequency = 'daily' | 'monthly';

export interface InterestScheduleConfig {
    id: number;
    paymentMethod: string;
    frequency: InterestFrequency;
    dayOfMonth: number | null;
    annualRatePct: number | null;
    fixedAmount: number | null;
    currency: string;
    description: string;
}

export interface InterestSchedulesResponse {
    entries: InterestScheduleConfig[];
}

export type PaymentAccountType = 'account' | 'credit' | 'investment';

export interface AccountHolding {
    id: number;
    name: string;
    kind: 'equity' | 'fund' | 'fd' | 'other';
}

export const REBATE_CATEGORIES = ['Petrol', 'Groceries', 'Dining', 'Grab'] as const;

export type RebateRuleType = 'simple' | 'tiered';

export interface DescriptionMappingRule {
    keywords: string[];
    rebateCategory: string;
    expenseCategory?: string;
}

export interface SimpleRebateCategory {
    name: string;
    cap: number | null;
    isDefault?: boolean;
    fixedRate?: number;
}

export interface SimpleRebateConfig {
    enabled: true;
    ruleType: 'simple';
    minSpendThreshold: number;
    highRate: number;
    lowRate: number;
    categoryCap: number;
    rebateCategories: string[];
    categories?: SimpleRebateCategory[];
    categoryMappings: Record<string, string>;
    descriptionRules?: DescriptionMappingRule[];
}

export interface RebateCategoryDef {
    name: string;
    cap: number | null;
    isDefault?: boolean;
    fixedRate?: number;
    minSpendPerMapping?: number;
    minTotalSpend?: number;
}

export interface RebateTier {
    minTotalSpend: number;
    rates: Record<string, number>;
}

export interface TieredRebateConfig {
    enabled: true;
    ruleType: 'tiered';
    tiers: RebateTier[];
    categories: RebateCategoryDef[];
    categoryMappings: Record<string, string>;
    descriptionRules?: DescriptionMappingRule[];
}

export type RebateConfig = SimpleRebateConfig | TieredRebateConfig;

export interface PaymentAccount {
    id: number;
    name: string;
    accountType: PaymentAccountType;
    initialBalance: number;
    balanceBaselineDate: string;
    creditLimit: number | null;
    statementDay?: number | null;
    rebateConfig?: RebateConfig | null;
    active: boolean;
    balance?: number;
    amountOwed?: number;
    availableCredit?: number;
    /** Market value of holdings (investment accounts). */
    holdingsMarketValue?: number;
    /** Cost basis of holdings (investment accounts). */
    totalCostBasis?: number;
    /** Unrealized P/L of holdings (investment accounts). */
    unrealizedGain?: number;
    /** Holding names under this investment account (e.g. Maybank, Public Bank). */
    holdingNames?: string[];
    holdings?: AccountHolding[];
    /** Cash balance + holdings market value (investment accounts). */
    nav?: number;
    /** Locked FD principal on debit accounts. */
    fdLocked?: number;
    /** Ledger balance minus locked FD principal. */
    available?: number;
}

export interface PaymentAccountsResponse {
    entries: PaymentAccount[];
}

export type AccountActivityType = 'expense' | 'income' | 'transfer_in' | 'transfer_out';

export interface AccountActivityEntry {
    id: number;
    date: string;
    type: AccountActivityType;
    description: string;
    category: string;
    amount: number;
    direction: 'in' | 'out';
    beforeBaseline?: boolean;
    runningBalance?: number;
    runningOwed?: number;
}

export interface AccountActivityResponse {
    account: PaymentAccount;
    entries: AccountActivityEntry[];
}

export interface RebateCategoryResult {
    category: string;
    spend: number;
    rate: number;
    earned: number;
    cap: number | null;
    remaining: number | null;
    fullyClaimed: boolean;
    requirementMet: boolean;
    requirementNote?: string;
    isDefault?: boolean;
}

export interface RebateEligibleExpense {
    id: number;
    date: string;
    description: string;
    category: string;
    rebateCategory: string;
    amount: number;
}

export interface RebateSummary {
    month: string;
    periodStart: string;
    periodEnd: string;
    ruleType: RebateRuleType;
    totalSpend: number;
    minSpendThreshold?: number;
    minSpendMet?: boolean;
    rate?: number;
    activeTier?: { minTotalSpend: number; label: string } | null;
    categories: RebateCategoryResult[];
    totalEarned: number;
    eligibleExpenses: RebateEligibleExpense[];
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
    /** Progressive set weights, e.g. "10/20/30". */
    weightsKg: string | null;
    durationMin: number | null;
    notes: string | null;
    caloriesBurned: number | null;
    fatBurnG: number | null;
    sessionId: string | null;
    sessionLabel: string | null;
    /** Pair exercises in a session (same number = one superset). */
    supersetGroup: number | null;
}

export interface WorkoutSession {
    sessionId: string;
    sessionLabel: string | null;
    date: string;
    exercises: WorkoutEntry[];
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
    const res = await fetch(url, {
        ...init,
        credentials: 'include',
        headers: {
            ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
            ...init?.headers,
        },
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed: ${res.status}`);
    }
    return res.json();
}

export function getAuthMe() {
    return fetchJson<{ authenticated: boolean }>('/api/auth/me');
}

export function verifyAuth(code: string) {
    return fetchJson<{ ok: true }>('/api/auth/verify', {
        method: 'POST',
        body: JSON.stringify({ code }),
    });
}

export function logoutAuth() {
    return fetchJson<{ ok: true }>('/api/auth/logout', { method: 'POST' });
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

export function createExpenseTransaction(
    fields: Pick<ExpenseTransaction, 'date' | 'category' | 'description'> & {
        amount?: number;
        paymentMethod?: string | null;
        toInvestmentAccount?: string | null;
        reimbursements?: { source: string; amount: number; paymentMethod?: string | null }[];
        tripId?: number;
        tripLeg?: TripLeg;
        fxAmount?: number;
        fxCurrency?: string;
        fxRate?: number;
    }
) {
    return fetchJson<{ ok: true; id: number }>('/api/expenses/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
    });
}

export function updateExpenseTransaction(
    id: number,
    fields: Partial<
        Pick<ExpenseTransaction, 'date' | 'amount' | 'category' | 'description' | 'paymentMethod' | 'toInvestmentAccount'>
    >
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

export function createFixedExpense(
    fields: Pick<
        FixedExpenseConfig,
        | 'description'
        | 'category'
        | 'amount'
        | 'dayOfMonth'
        | 'frequencyMonths'
        | 'startMonth'
    > & {
        paymentMethod?: string | null;
        toInvestmentAccount?: string | null;
        instrumentId?: number | null;
        loanMethod?: LoanMethod | null;
        originalPrincipal?: number | null;
        remainingPrincipal?: number | null;
        annualRatePct?: number | null;
        tenureMonths?: number | null;
        loanStartDate?: string | null;
    }
) {
    return fetchJson<{ ok: true }>('/api/expenses/fixed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
    });
}

export function updateFixedExpense(
    id: number,
    fields: Partial<
        Pick<
            FixedExpenseConfig,
            | 'description'
            | 'category'
            | 'amount'
            | 'dayOfMonth'
            | 'frequencyMonths'
            | 'paymentMethod'
            | 'toInvestmentAccount'
            | 'instrumentId'
            | 'loanMethod'
            | 'originalPrincipal'
            | 'remainingPrincipal'
            | 'annualRatePct'
            | 'tenureMonths'
            | 'loanStartDate'
        >
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

let dueContributionsPromise: Promise<{ ok: true; applied: number; skipped: number }> | null = null;

export function applyDueFixedContributions() {
    if (!dueContributionsPromise) {
        dueContributionsPromise = fetchJson<{ ok: true; applied: number; skipped: number }>(
            '/api/expenses/fixed/contribute-due',
            { method: 'POST' }
        ).catch((err) => {
            dueContributionsPromise = null;
            throw err;
        });
    }
    return dueContributionsPromise;
}

export function fetchInterestSchedules() {
    return fetchJson<InterestSchedulesResponse>('/api/interest-schedules');
}

export function createInterestSchedule(
    fields: Pick<
        InterestScheduleConfig,
        'paymentMethod' | 'frequency' | 'description' | 'currency'
    > & {
        dayOfMonth?: number | null;
        annualRatePct?: number | null;
        fixedAmount?: number | null;
    }
) {
    return fetchJson<{ ok: true }>('/api/interest-schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
    });
}

export function updateInterestSchedule(
    id: number,
    fields: Partial<
        Pick<
            InterestScheduleConfig,
            | 'paymentMethod'
            | 'frequency'
            | 'dayOfMonth'
            | 'annualRatePct'
            | 'fixedAmount'
            | 'currency'
            | 'description'
        >
    >
) {
    return fetchJson<{ ok: true }>(`/api/interest-schedules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
    });
}

export function deleteInterestSchedule(id: number) {
    return fetchJson<{ ok: true }>(`/api/interest-schedules/${id}`, { method: 'DELETE' });
}

export function fetchPaymentAccounts() {
    return fetchJson<PaymentAccountsResponse>('/api/payment-accounts');
}

export function createPaymentAccount(fields: {
    name: string;
    accountType: PaymentAccountType;
    initialBalance?: number;
    creditLimit?: number;
    statementDay?: number | null;
}) {
    return fetchJson<{ ok: true; id: number }>('/api/payment-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
    });
}

export function updatePaymentAccount(
    id: number,
    fields: Partial<
        Pick<
            PaymentAccount,
            | 'name'
            | 'accountType'
            | 'active'
            | 'initialBalance'
            | 'creditLimit'
            | 'statementDay'
            | 'rebateConfig'
        >
    >
) {
    return fetchJson<{ ok: true }>(`/api/payment-accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
    });
}

export function deletePaymentAccount(id: number) {
    return fetchJson<{ ok: true }>(`/api/payment-accounts/${id}`, { method: 'DELETE' });
}

export function fetchAccountActivity(id: number) {
    return fetchJson<AccountActivityResponse>(`/api/payment-accounts/${id}/activity`);
}

export function fetchAccountRebate(id: number, month: string) {
    return fetchJson<RebateSummary>(`/api/payment-accounts/${id}/rebate?month=${encodeURIComponent(month)}`);
}

export function syncAccountRebate(id: number, month: string) {
    return fetchJson<RebateSummary>(
        `/api/payment-accounts/${id}/rebate/sync?month=${encodeURIComponent(month)}`,
        { method: 'POST' }
    );
}

export function fetchIncomeTransactions(month: string) {
    return fetchJson<IncomeTransactionsResponse>(`/api/incomes/transactions?month=${month}`);
}

export function fetchIncomeDaily(range: DateRange) {
    return fetchJson<IncomeDailyResponse>(`/api/incomes/daily?${qs(range)}`);
}

export function createIncomeTransaction(
    fields: Pick<IncomeTransaction, 'date' | 'amount' | 'category' | 'description'> & {
        source?: string | null;
        expenseId?: number | null;
        paymentMethod?: string | null;
        fromPaymentMethod?: string | null;
    }
) {
    return fetchJson<{ ok: true; id: number }>('/api/incomes/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
    });
}

export function updateIncomeTransaction(
    id: number,
    fields: Partial<
        Pick<
            IncomeTransaction,
            | 'date'
            | 'amount'
            | 'category'
            | 'description'
            | 'source'
            | 'expenseId'
            | 'paymentMethod'
            | 'fromPaymentMethod'
        >
    >
) {
    return fetchJson<{ ok: true }>(`/api/incomes/transactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
    });
}

export function deleteIncomeTransaction(id: number) {
    return fetchJson<{ ok: true }>(`/api/incomes/transactions/${id}`, { method: 'DELETE' });
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

export function createWorkout(
    fields: Pick<
        WorkoutEntry,
        | 'date'
        | 'exercise'
        | 'sets'
        | 'reps'
        | 'weightKg'
        | 'weightsKg'
        | 'durationMin'
        | 'notes'
        | 'caloriesBurned'
        | 'fatBurnG'
        | 'supersetGroup'
    > & {
        sessionId?: string | null;
        sessionLabel?: string | null;
    }
) {
    return fetchJson<{ ok: true }>('/api/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
    });
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
            | 'weightsKg'
            | 'durationMin'
            | 'notes'
            | 'caloriesBurned'
            | 'fatBurnG'
            | 'sessionId'
            | 'sessionLabel'
            | 'supersetGroup'
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

export function deleteWorkoutSession(sessionId: string) {
    return fetchJson<{ ok: true }>(`/api/workouts/session/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
    });
}

export interface NutritionSettings {
    dailyCalorieTarget: number;
    dailyProteinTargetG: number;
    dailyCarbsTargetG: number;
    dailyFatTargetG: number;
    bodyWeightKg: number | null;
}

export function fetchNutritionSettings() {
    return fetchJson<NutritionSettings>('/api/nutrition/settings');
}

export function updateNutritionSettings(fields: Partial<NutritionSettings>) {
    return fetchJson<{ ok: true } & NutritionSettings>('/api/nutrition/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
    });
}

export function fetchNutritionDaily(range: DateRange) {
    return fetchJson<NutritionDailyResponse>(`/api/nutrition/daily?${qs(range)}`);
}

export function fetchMeals(range: DateRange) {
    return fetchJson<MealsResponse>(`/api/nutrition/meals?${qs(range)}`);
}

export function createMeal(
    fields: Pick<MealEntry, 'date' | 'description' | 'mealType' | 'proteinG' | 'carbsG' | 'fatG' | 'calories'>
) {
    return fetchJson<{ ok: true }>('/api/nutrition/meals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
    });
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

export type SyncScope = 'expenses' | 'health';

export function fetchSyncStatus(month: string, scope: SyncScope) {
    return fetchJson<{ fingerprint: string }>(`/api/sync-status?month=${month}&scope=${scope}`);
}

export function fetchTrips() {
    return fetchJson<{ entries: Trip[] }>('/api/trips');
}

export function createTrip(fields: {
    name: string;
    tripCurrency: string;
    startDate?: string | null;
    endDate?: string | null;
    notes?: string | null;
}) {
    return fetchJson<{ ok: true; trip: Trip }>('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
    });
}

export function updateTrip(
    id: number,
    fields: Partial<{
        name: string;
        tripCurrency: string;
        startDate: string | null;
        endDate: string | null;
        notes: string | null;
    }>
) {
    return fetchJson<{ ok: true; trip: Trip }>(`/api/trips/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
    });
}

export function deleteTrip(id: number) {
    return fetchJson<{ ok: true }>(`/api/trips/${id}`, { method: 'DELETE' });
}

export function fetchTripSummary(id: number) {
    return fetchJson<TripSummary>(`/api/trips/${id}/summary`);
}

export type InstrumentKind = 'equity' | 'fund' | 'fd' | 'other';
export type InvestmentEventType =
    | 'buy'
    | 'sell'
    | 'dividend'
    | 'interest'
    | 'fee'
    | 'price_mark';

export interface InvestmentInstrument {
    id: number;
    paymentAccountId: number;
    kind: InstrumentKind;
    symbol: string | null;
    name: string;
    currency: string;
    lastPrice: number | null;
    lastPriceAt: string | null;
    principal: number | null;
    annualRatePct: number | null;
    startDate: string | null;
    maturityDate: string | null;
    active: boolean;
}

export interface InvestmentEvent {
    id: number;
    instrumentId: number;
    eventType: InvestmentEventType;
    date: string;
    quantity: number | null;
    unitPrice: number | null;
    amount: number | null;
    realizedGain: number | null;
    notes: string | null;
    linkedIncomeId: number | null;
    linkedExpenseId: number | null;
}

export interface HoldingPosition {
    instrument: InvestmentInstrument;
    quantity: number;
    costBasis: number;
    marketValue: number;
    unrealizedGain: number;
    lastPrice: number | null;
}

export interface PortfolioSummary {
    paymentAccountId: number;
    holdings: HoldingPosition[];
    events: InvestmentEvent[];
    totalCostBasis: number;
    totalMarketValue: number;
    totalUnrealizedGain: number;
    totalRealizedGain: number;
    cashBalance: number;
    nav: number;
    fdLocked?: number;
    available?: number;
}

export function fetchPortfolio(accountId: number) {
    return fetchJson<PortfolioSummary>(`/api/investments/accounts/${accountId}/portfolio`);
}

export function createInstrument(fields: {
    paymentAccountId: number;
    kind: InstrumentKind;
    name: string;
    symbol?: string | null;
    currency?: string;
    lastPrice?: number | null;
    principal?: number | null;
    annualRatePct?: number | null;
    startDate?: string | null;
    maturityDate?: string | null;
    tenureMonths?: number | null;
}) {
    return fetchJson<{ ok: true; id: number }>('/api/investments/instruments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
    });
}

export function updateInstrument(
    id: number,
    fields: Partial<{
        name: string;
        symbol: string | null;
        lastPrice: number | null;
        principal: number | null;
        annualRatePct: number | null;
        startDate: string | null;
        maturityDate: string | null;
        active: boolean;
    }>
) {
    return fetchJson<{ ok: true }>(`/api/investments/instruments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
    });
}

export function deleteInstrument(id: number) {
    return fetchJson<{ ok: true }>(`/api/investments/instruments/${id}`, { method: 'DELETE' });
}

export function recordPortfolioBuy(fields: {
    instrumentId: number;
    date: string;
    quantity: number;
    unitPrice: number;
    notes?: string | null;
    fee?: number | null;
    fromPaymentMethod?: string | null;
}) {
    return fetchJson<{ ok: true; eventId: number; lotId: number }>('/api/investments/events/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
    });
}

export function recordPortfolioSell(fields: {
    instrumentId: number;
    date: string;
    quantity: number;
    unitPrice: number;
    notes?: string | null;
    fee?: number | null;
    toPaymentMethod?: string | null;
}) {
    return fetchJson<{ ok: true; eventId: number; realizedGain: number }>(
        '/api/investments/events/sell',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fields),
        }
    );
}

export function recordFundInvest(fields: {
    instrumentId: number;
    date: string;
    amount: number;
    notes?: string | null;
    fromPaymentMethod?: string | null;
}) {
    return fetchJson<{ ok: true; eventId: number }>('/api/investments/events/fund-invest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
    });
}

export function recordFundWithdraw(fields: {
    instrumentId: number;
    date: string;
    amount: number;
    notes?: string | null;
    toPaymentMethod?: string | null;
}) {
    return fetchJson<{ ok: true; eventId: number }>('/api/investments/events/fund-withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
    });
}

export function recordPortfolioDividend(fields: {
    instrumentId: number;
    date: string;
    amount: number;
    notes?: string | null;
    toPaymentMethod?: string | null;
}) {
    return fetchJson<{ ok: true; eventId: number }>('/api/investments/events/dividend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
    });
}

export function recordPortfolioInterest(fields: {
    instrumentId: number;
    date: string;
    amount: number;
    notes?: string | null;
    toPaymentMethod?: string | null;
    syncCash?: boolean;
}) {
    return fetchJson<{ ok: true; eventId: number }>('/api/investments/events/interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
    });
}

export function recordPortfolioPriceMark(fields: {
    instrumentId: number;
    date: string;
    unitPrice: number;
    notes?: string | null;
}) {
    return fetchJson<{ ok: true; eventId: number }>('/api/investments/events/price-mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
    });
}

export function accrueFdInterest(
    instrumentId: number,
    fields: {
        toDate: string;
        amountOverride?: number;
        toPaymentMethod?: string | null;
        syncCash?: boolean;
    }
) {
    return fetchJson<{ ok: true; eventId: number; amount: number }>(
        `/api/investments/instruments/${instrumentId}/accrue-fd`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fields),
        }
    );
}
