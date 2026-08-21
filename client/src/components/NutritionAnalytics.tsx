import type { NutritionDailyPoint } from '../api';
import NutritionLineChart from '../charts/NutritionLineChart';
import MacroAdherenceStrip from './MacroAdherenceStrip';

interface Props {
    series: NutritionDailyPoint[];
}

export default function NutritionAnalytics({ series }: Props) {
    return (
        <div className="health-nutrition-parts">
            <div className="card health-macros-chart">
                <h3>Daily macros</h3>
                <NutritionLineChart series={series} />
            </div>
            <div className="card health-macro-adherence">
                <h3>Macro adherence</h3>
                <MacroAdherenceStrip series={series} />
            </div>
        </div>
    );
}
