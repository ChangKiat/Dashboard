import type { WorkoutEntry, WorkoutSession } from '../api';

export function formatWeightDisplay(entry: Pick<WorkoutEntry, 'weightKg' | 'weightsKg'>): string | null {
    if (entry.weightsKg) return `${entry.weightsKg} kg`;
    if (entry.weightKg != null) return `${entry.weightKg} kg`;
    return null;
}

export function formatExerciseLine(entry: WorkoutEntry): string {
    const weight = formatWeightDisplay(entry);
    if (weight) return `${entry.exercise} · ${weight}`;
    return entry.exercise;
}

export function formatSessionSetsReps(exercises: WorkoutEntry[]): string | null {
    if (exercises.length === 0) return null;
    const first = exercises[0];
    const uniformSets = exercises.every((e) => e.sets === first.sets);
    const uniformReps = exercises.every((e) => e.reps === first.reps);
    const parts: string[] = [];
    if (uniformReps && first.reps != null) parts.push(`${first.reps} reps`);
    if (uniformSets && first.sets != null) parts.push(`${first.sets} sets`);
    return parts.length > 0 ? parts.join(' · ') : null;
}

export function formatWorkoutEntrySummary(entry: WorkoutEntry): string {
    const parts: string[] = [];
    if (entry.sets != null) parts.push(`${entry.sets} sets`);
    if (entry.reps != null) parts.push(`${entry.reps} reps`);
    const weight = formatWeightDisplay(entry);
    if (weight) parts.push(weight);
    if (entry.supersetGroup != null) parts.push(`SS${entry.supersetGroup}`);
    if (entry.caloriesBurned != null) parts.push(`${entry.caloriesBurned} kcal`);
    if (entry.fatBurnG != null) parts.push(`${entry.fatBurnG}g fat`);
    return parts.length > 0 ? parts.join(' · ') : '—';
}

/** Format session exercises with supersets joined by " + ". */
export function formatSessionExerciseLines(exercises: WorkoutEntry[]): string[] {
    const used = new Set<number>();
    const lines: string[] = [];
    for (let i = 0; i < exercises.length; i++) {
        if (used.has(i)) continue;
        const entry = exercises[i];
        const group = entry.supersetGroup;
        if (group == null) {
            lines.push(formatExerciseLine(entry));
            continue;
        }
        const pair: string[] = [formatExerciseLine(entry)];
        used.add(i);
        for (let j = i + 1; j < exercises.length; j++) {
            if (exercises[j].supersetGroup === group) {
                pair.push(formatExerciseLine(exercises[j]));
                used.add(j);
            }
        }
        lines.push(pair.join(' + '));
    }
    return lines;
}

export function formatSessionSummary(session: WorkoutSession): string {
    const count = session.exercises.length;
    const countLabel = `${count} exercise${count === 1 ? '' : 's'}`;
    const setsReps = formatSessionSetsReps(session.exercises);
    const lines = formatSessionExerciseLines(session.exercises);
    const head = setsReps ? `${setsReps} · ${countLabel}` : countLabel;
    if (lines.length === 0) return head;
    if (lines.length <= 2) return `${head} · ${lines.join(', ')}`;
    return `${head} · ${lines.slice(0, 2).join(', ')} +${lines.length - 2} more`;
}

export function groupWorkoutEntries(entries: WorkoutEntry[]): {
    sessions: WorkoutSession[];
    standalone: WorkoutEntry[];
} {
    const sessionMap = new Map<string, WorkoutEntry[]>();
    const standalone: WorkoutEntry[] = [];

    for (const entry of entries) {
        if (entry.sessionId) {
            const list = sessionMap.get(entry.sessionId) ?? [];
            list.push(entry);
            sessionMap.set(entry.sessionId, list);
        } else {
            standalone.push(entry);
        }
    }

    const sessions: WorkoutSession[] = [];
    for (const [sessionId, exercises] of sessionMap) {
        sessions.push({
            sessionId,
            sessionLabel: exercises.find((e) => e.sessionLabel)?.sessionLabel ?? null,
            date: exercises[0].date,
            exercises,
        });
    }

    sessions.sort((a, b) => b.sessionId.localeCompare(a.sessionId));
    return { sessions, standalone };
}

export function listSameDaySessions(
    allEntries: WorkoutEntry[],
    date: string
): { sessionId: string; sessionLabel: string | null }[] {
    const seen = new Map<string, string | null>();
    for (const entry of allEntries) {
        if (entry.date === date && entry.sessionId && !seen.has(entry.sessionId)) {
            seen.set(entry.sessionId, entry.sessionLabel);
        }
    }
    return [...seen.entries()].map(([sessionId, sessionLabel]) => ({
        sessionId,
        sessionLabel,
    }));
}

export type WorkoutDisplayItem =
    | { type: 'session'; session: WorkoutSession }
    | { type: 'standalone'; entry: WorkoutEntry };

export function toWorkoutDisplayItems(entries: WorkoutEntry[]): WorkoutDisplayItem[] {
    const { sessions, standalone } = groupWorkoutEntries(entries);
    const items: WorkoutDisplayItem[] = sessions.map((session) => ({
        type: 'session',
        session,
    }));
    for (const entry of standalone) {
        items.push({ type: 'standalone', entry });
    }
    return items;
}
