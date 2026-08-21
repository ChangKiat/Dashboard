import type { PersonalRecord } from '../api';
import ExerciseBarChart from '../charts/ExerciseBarChart';
import WeightTrendChart from '../charts/WeightTrendChart';
import WorkoutVolumeChart from '../charts/WorkoutVolumeChart';
import PersonalRecordsTable from './PersonalRecordsTable';

interface Props {
    volumeData: { date: string; sessions: number; sets: number }[];
    topExercises: { exercise: string; count: number }[];
    weightTrend: Record<string, { date: string; weightKg: number }[]>;
    prs: PersonalRecord[];
}

export default function WorkoutAnalytics({
    volumeData,
    topExercises,
    weightTrend,
    prs,
}: Props) {
    return (
        <div className="health-workout-parts">
            <div className="card health-volume-chart">
                <h3>Workout volume</h3>
                <WorkoutVolumeChart data={volumeData} />
            </div>
            <div className="card health-top-exercises">
                <h3>Top exercises</h3>
                <ExerciseBarChart data={topExercises} />
            </div>
            <div className="card health-weight-trend">
                <h3>Lift progress</h3>
                <WeightTrendChart weightTrend={weightTrend} />
            </div>
            <div className="card health-pr-table">
                <h3>Personal records</h3>
                <PersonalRecordsTable prs={prs} />
            </div>
        </div>
    );
}
