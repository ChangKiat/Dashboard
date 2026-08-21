import type { BodyWeightLogEntry } from '../api';
import BodyWeightTrendChart from '../charts/BodyWeightTrendChart';
import BurnTrendChart from '../charts/BurnTrendChart';

interface Props {
    bodyWeightLogs: BodyWeightLogEntry[];
    burnSeries: { date: string; caloriesBurned: number }[];
}

export default function BodyAnalytics({ bodyWeightLogs, burnSeries }: Props) {
    return (
        <div className="health-body-parts">
            <div className="card health-body-weight-chart">
                <h3>Body weight</h3>
                <BodyWeightTrendChart data={bodyWeightLogs} />
            </div>
            <div className="card health-burn-chart">
                <h3>Calories burned</h3>
                <BurnTrendChart data={burnSeries} />
            </div>
        </div>
    );
}
