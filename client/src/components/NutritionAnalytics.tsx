import type { NutritionDailyPoint } from '../api';
import NutritionLineChart from '../charts/NutritionLineChart';
import NetCalorieChart, { type NetCalorieDay } from '../charts/NetCalorieChart';
import MacroAdherenceStrip from './MacroAdherenceStrip';

interface Props {
    series: NutritionDailyPoint[];
    netCalorieSeries: NetCalorieDay[];
}

export default function NutritionAnalytics({ series, netCalorieSeries }: Props) {
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
            <div className="card health-net-calories-chart">
                <h3>Net calorie balance</h3>
                <NetCalorieChart data={netCalorieSeries} />
            </div>
        </div>
    );
}
