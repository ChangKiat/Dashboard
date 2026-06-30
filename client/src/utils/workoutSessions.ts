import type { WorkoutEntry, WorkoutSession } from '../api';

export function formatExerciseLine(entry: WorkoutEntry): string {
    if (entry.weightKg != null) {
        return `${entry.exercise} · ${entry.weightKg} kg`;
    }
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
    if (entry.weightKg != null) parts.push(`${entry.weightKg} kg`);
    if (entry.caloriesBurned != null) parts.push(`${entry.caloriesBurned} kcal`);
    if (entry.fatBurnG != null) parts.push(`${entry.fatBurnG}g fat`);
    return parts.length > 0 ? parts.join(' · ') : '—';
}

export function formatSessionSummary(session: WorkoutSession): string {
    const count = session.exercises.length;
    const countLabel = `${count} exercise${count === 1 ? '' : 's'}`;
    const setsReps = formatSessionSetsReps(session.exercises);
    if (setsReps) return `${setsReps} · ${countLabel}`;

    if (count <= 2) {
        return session.exercises.map((e) => e.exercise).join(', ');
    }
    const preview = session.exercises
        .slice(0, 2)
        .map((e) => e.exercise)
        .join(', ');
    return `${preview} +${count - 2} more`;
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
