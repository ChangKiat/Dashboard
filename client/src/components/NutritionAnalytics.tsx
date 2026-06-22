import type { NutritionDailyPoint } from '../api';
import NutritionLineChart from '../charts/NutritionLineChart';

interface Props {
    series: NutritionDailyPoint[];
}

export default function NutritionAnalytics({ series }: Props) {
    return (
        <div className="health-nutrition-parts">
            <div className="chart-card health-macros-chart">
                <h3>Daily macros</h3>
                <NutritionLineChart series={series} />
            </div>
        </div>
    );
}
