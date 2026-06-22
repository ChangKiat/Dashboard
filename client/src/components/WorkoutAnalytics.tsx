import type { PersonalRecord } from '../api';
import WeightTrendChart from '../charts/WeightTrendChart';
import WorkoutVolumeChart from '../charts/WorkoutVolumeChart';
import PersonalRecordsTable from './PersonalRecordsTable';

interface Props {
    volumeData: { date: string; sessions: number; sets: number }[];
    weightTrend: Record<string, { date: string; weightKg: number }[]>;
    prs: PersonalRecord[];
}

export default function WorkoutAnalytics({
    volumeData,
    weightTrend,
    prs,
}: Props) {
    return (
        <div className="health-workout-parts">
            <div className="chart-card health-volume-chart">
                <h3>Workout volume</h3>
                <WorkoutVolumeChart data={volumeData} />
            </div>
            <div className="chart-card health-weight-trend">
                <h3>Weight trend</h3>
                <WeightTrendChart weightTrend={weightTrend} />
            </div>
            <div className="chart-card health-pr-table">
                <h3>Personal records</h3>
                <PersonalRecordsTable prs={prs} />
            </div>
        </div>
    );
}
