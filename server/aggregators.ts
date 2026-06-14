export function groupFixedExpensesByCategory(
    rows: { category: string; amount: number }[]
): { category: string; amount: number }[] {
    const totals = new Map<string, number>();
    for (const row of rows) {
        totals.set(row.category, (totals.get(row.category) ?? 0) + row.amount);
    }
    return [...totals.entries()]
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount);
}

export type ExpenseTransactionRow = {
    id: number;
    date: string;
    amount: string;
    category: string;
    description: string;
};

export function formatExpenseTransactions(rows: ExpenseTransactionRow[]) {
    return rows.map((row) => ({
        id: row.id,
        date: row.date,
        amount: parseFloat(row.amount),
        category: row.category,
        description: row.description,
    }));
}

export function groupExpensesByDate(
    rows: { date: string; amount: string; category: string }[]
) {
    const byDate: Record<string, { total: number; byCategory: Record<string, number> }> = {};

    for (const row of rows) {
        if (!byDate[row.date]) {
            byDate[row.date] = { total: 0, byCategory: {} };
        }
        const amount = parseFloat(row.amount);
        byDate[row.date].total += amount;
        const cat = row.category;
        byDate[row.date].byCategory[cat] = (byDate[row.date].byCategory[cat] || 0) + amount;
    }

    return byDate;
}

export type WorkoutRow = {
    id?: number;
    date: string;
    exercise: string;
    sets: number | null;
    reps: number | null;
    weightKg: number | null;
    durationMin: number | null;
    notes: string | null;
};

export type PersonalRecord = {
    exercise: string;
    weightKg: number;
    reps: number | null;
    sets: number | null;
    date: string;
};

export function groupWorkoutsByDate(rows: Pick<WorkoutRow, 'date' | 'exercise' | 'sets'>[]) {
    const byDate: Record<string, { sessionCount: number; totalSets: number; exercises: string[] }> =
        {};

    for (const row of rows) {
        if (!byDate[row.date]) {
            byDate[row.date] = { sessionCount: 0, totalSets: 0, exercises: [] };
        }
        byDate[row.date].sessionCount += 1;
        byDate[row.date].totalSets += row.sets ?? 0;
        byDate[row.date].exercises.push(row.exercise);
    }

    return byDate;
}

export function computePersonalRecords(rows: WorkoutRow[]): {
    prs: PersonalRecord[];
    heaviest: PersonalRecord | null;
} {
    const bestByExercise: Record<string, PersonalRecord> = {};

    for (const row of rows) {
        if (row.weightKg == null) continue;

        const existing = bestByExercise[row.exercise];
        if (
            !existing ||
            row.weightKg > existing.weightKg ||
            (row.weightKg === existing.weightKg && row.date > existing.date)
        ) {
            bestByExercise[row.exercise] = {
                exercise: row.exercise,
                weightKg: row.weightKg,
                reps: row.reps,
                sets: row.sets,
                date: row.date,
            };
        }
    }

    const prs = Object.values(bestByExercise).sort((a, b) => b.weightKg - a.weightKg);
    return { prs, heaviest: prs[0] ?? null };
}

export function formatWorkoutEntries(rows: WorkoutRow[]) {
    return rows.map((row) => ({
        id: row.id,
        date: row.date,
        exercise: row.exercise,
        sets: row.sets,
        reps: row.reps,
        weightKg: row.weightKg,
        durationMin: row.durationMin,
        notes: row.notes,
    }));
}

export function countExercises(
    rows: { exercise: string; weightKg: number | null; date: string }[]
) {
    const counts: Record<string, number> = {};
    const weightTrend: Record<string, { date: string; weightKg: number }[]> = {};

    for (const row of rows) {
        counts[row.exercise] = (counts[row.exercise] || 0) + 1;
        if (row.weightKg != null) {
            if (!weightTrend[row.exercise]) weightTrend[row.exercise] = [];
            weightTrend[row.exercise].push({ date: row.date, weightKg: row.weightKg });
        }
    }

    const top = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([exercise, count]) => ({ exercise, count }));

    for (const key of Object.keys(weightTrend)) {
        weightTrend[key].sort((a, b) => a.date.localeCompare(b.date));
    }

    return { top, weightTrend };
}
