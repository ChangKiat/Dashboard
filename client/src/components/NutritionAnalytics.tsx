import type { MealEntry, NutritionDailyPoint } from '../api';
import NutritionLineChart from '../charts/NutritionLineChart';
import MealHistoryTable from './MealHistoryTable';

interface Props {
    series: NutritionDailyPoint[];
    meals: MealEntry[];
    onChanged: () => void;
}

export default function NutritionAnalytics({ series, meals, onChanged }: Props) {
    return (
        <div className="health-nutrition-parts">
            <div className="chart-card health-macros-chart">
                <h3>Daily macros</h3>
                <NutritionLineChart series={series} />
            </div>
            <div className="chart-card health-meal-log">
                <h3>Meal log</h3>
                <MealHistoryTable entries={meals} onChanged={onChanged} />
            </div>
        </div>
    );
}
