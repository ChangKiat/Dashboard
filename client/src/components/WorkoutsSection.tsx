import { useCallback, useEffect, useState } from 'react';
import type {
    DateRange,
    PersonalRecord,
    WorkoutEntry,
} from '../api';
import {
    fetchWorkoutDaily,
    fetchWorkoutExercises,
    fetchWorkoutHistory,
    fetchWorkoutPRs,
} from '../api';
import DailyBarChart from '../charts/DailyBarChart';
import ExerciseBarChart from '../charts/ExerciseBarChart';
import WeightTrendChart from '../charts/WeightTrendChart';
import PersonalRecordsTable from './PersonalRecordsTable';
import SummaryCard from './SummaryCard';
import WorkoutHistoryTable from './WorkoutHistoryTable';

interface Props {
    range: DateRange;
}

export default function WorkoutsSection({ range }: Props) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [totalSessions, setTotalSessions] = useState(0);
    const [totalSets, setTotalSets] = useState(0);
    const [mostTrained, setMostTrained] = useState<string | null>(null);
    const [heaviestPr, setHeaviestPr] = useState<PersonalRecord | null>(null);
    const [dailySessions, setDailySessions] = useState<{ date: string; value: number }[]>([]);
    const [dailySets, setDailySets] = useState<{ date: string; value: number }[]>([]);
    const [topExercises, setTopExercises] = useState<{ exercise: string; count: number }[]>([]);
    const [weightTrend, setWeightTrend] = useState<
        Record<string, { date: string; weightKg: number }[]>
    >({});
    const [prs, setPrs] = useState<PersonalRecord[]>([]);
    const [history, setHistory] = useState<WorkoutEntry[]>([]);

    const loadData = useCallback(async () => {
        const [dailyRes, exRes, prsRes, historyRes] = await Promise.all([
            fetchWorkoutDaily(range),
            fetchWorkoutExercises(range),
            fetchWorkoutPRs(),
            fetchWorkoutHistory(range),
        ]);
        setTotalSessions(dailyRes.totalSessions);
        setTotalSets(dailyRes.totalSets);
        setMostTrained(exRes.mostTrained);
        setHeaviestPr(prsRes.heaviest);
        setDailySessions(
            dailyRes.series.map((d) => ({ date: d.date, value: d.sessionCount }))
        );
        setDailySets(
            dailyRes.series.map((d) => ({ date: d.date, value: d.totalSets }))
        );
        setTopExercises(exRes.top);
        setWeightTrend(exRes.weightTrend);
        setPrs(prsRes.prs);
        setHistory(historyRes.entries);
    }, [range]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        loadData()
            .catch((err) => {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [loadData]);

    const handleChanged = useCallback(() => {
        loadData().catch((err) => {
            setError(err instanceof Error ? err.message : 'Failed to refresh');
        });
    }, [loadData]);

    if (loading) return <section className="panel"><p className="muted">Loading workouts…</p></section>;
    if (error) return <section className="panel"><p className="error">{error}</p></section>;

    const heaviestLabel = heaviestPr
        ? `${heaviestPr.exercise} · ${heaviestPr.weightKg} kg`
        : '—';

    return (
        <section className="panel">
            <h2>Workouts</h2>
            <div className="summary-row">
                <SummaryCard label="Total sessions" value={String(totalSessions)} />
                <SummaryCard label="Total sets" value={String(totalSets)} />
                <SummaryCard label="Heaviest PR" value={heaviestLabel} sub="All-time" />
                <SummaryCard label="Most trained" value={mostTrained ?? '—'} />
            </div>
            <div className="chart-grid">
                <div className="chart-card">
                    <h3>Sessions per day</h3>
                    <DailyBarChart data={dailySessions} color="#a78bfa" label="Sessions" />
                </div>
                <div className="chart-card">
                    <h3>Sets per day</h3>
                    <DailyBarChart data={dailySets} color="#60a5fa" label="Sets" />
                </div>
                <div className="chart-card">
                    <h3>Top exercises</h3>
                    <ExerciseBarChart data={topExercises} />
                </div>
                <div className="chart-card">
                    <h3>Weight trend</h3>
                    <WeightTrendChart weightTrend={weightTrend} />
                </div>
            </div>
            <div className="chart-card full-width">
                <h3>Personal records</h3>
                <PersonalRecordsTable prs={prs} />
            </div>
            <div className="chart-card full-width">
                <h3>Workout log</h3>
                <WorkoutHistoryTable entries={history} onChanged={handleChanged} />
            </div>
        </section>
    );
}
