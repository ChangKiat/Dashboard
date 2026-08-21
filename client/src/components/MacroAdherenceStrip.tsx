import type { NutritionDailyPoint } from '../api';

interface Props {
    series: NutritionDailyPoint[];
}

export function computeMacroAdherence(series: NutritionDailyPoint[]) {
    const logged = series.filter((d) => d.mealCount > 0 || d.calories > 0 || d.protein > 0);
    if (logged.length === 0) {
        return { proteinHitPct: 0, calorieHitPct: 0, loggedDays: 0 };
    }
    const proteinHits = logged.filter((d) => d.protein >= d.targets.protein).length;
    const calorieHits = logged.filter((d) => d.calories >= d.targets.calories * 0.9 && d.calories <= d.targets.calories * 1.1).length;
    return {
        proteinHitPct: Math.round((proteinHits / logged.length) * 100),
        calorieHitPct: Math.round((calorieHits / logged.length) * 100),
        loggedDays: logged.length,
    };
}

export default function MacroAdherenceStrip({ series }: Props) {
    const { proteinHitPct, calorieHitPct, loggedDays } = computeMacroAdherence(series);

    if (loggedDays === 0) {
        return <p className="empty-chart">No meal days logged yet.</p>;
    }

    return (
        <div className="macro-adherence-strip">
            <div className="macro-adherence-item">
                <div className="macro-adherence-header">
                    <span>Protein target hit</span>
                    <strong>{proteinHitPct}%</strong>
                </div>
                <div className="macro-adherence-bar" aria-hidden>
                    <div
                        className="macro-adherence-fill macro-adherence-fill--protein"
                        style={{ width: `${proteinHitPct}%` }}
                    />
                </div>
            </div>
            <div className="macro-adherence-item">
                <div className="macro-adherence-header">
                    <span>Calorie band (±10%)</span>
                    <strong>{calorieHitPct}%</strong>
                </div>
                <div className="macro-adherence-bar" aria-hidden>
                    <div
                        className="macro-adherence-fill macro-adherence-fill--calories"
                        style={{ width: `${calorieHitPct}%` }}
                    />
                </div>
            </div>
            <p className="muted macro-adherence-note">{loggedDays} logged day{loggedDays === 1 ? '' : 's'}</p>
        </div>
    );
}
