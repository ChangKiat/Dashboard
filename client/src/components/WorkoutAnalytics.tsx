import type { PersonalRecord, WorkoutEntry } from '../api';
import ExerciseBarChart from '../charts/ExerciseBarChart';
import WeightTrendChart from '../charts/WeightTrendChart';
import WorkoutVolumeChart from '../charts/WorkoutVolumeChart';
import PersonalRecordsTable from './PersonalRecordsTable';
import WorkoutHistoryTable from './WorkoutHistoryTable';

interface Props {
    volumeData: { date: string; sessions: number; sets: number }[];
    topExercises: { exercise: string; count: number }[];
    weightTrend: Record<string, { date: string; weightKg: number }[]>;
    prs: PersonalRecord[];
    history: WorkoutEntry[];
    onChanged: () => void;
}

export default function WorkoutAnalytics({
    volumeData,
    topExercises,
    weightTrend,
    prs,
    history,
    onChanged,
}: Props) {
    return (
        <div className="health-workout-parts">
            <div className="chart-card health-volume-chart">
                <h3>Workout volume</h3>
                <WorkoutVolumeChart data={volumeData} />
            </div>
            <div className="chart-card health-top-exercises">
                <h3>Top exercises</h3>
                <ExerciseBarChart data={topExercises} />
            </div>
            <div className="chart-card health-weight-trend">
                <h3>Weight trend</h3>
                <WeightTrendChart weightTrend={weightTrend} />
            </div>
            <div className="chart-card health-workout-log">
                <h3>Workout log</h3>
                <WorkoutHistoryTable entries={history} onChanged={onChanged} />
            </div>
            <div className="chart-card health-pr-table">
                <h3>Personal records</h3>
                <PersonalRecordsTable prs={prs} />
            </div>
        </div>
    );
}
