import { useState } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

export interface WorkoutVolumePoint {
    date: string;
    sessions: number;
    sets: number;
    trainingLoadKg: number | null;
}

const metrics = {
    sets: { label: 'Sets', color: 'var(--series-blue)', unit: '' },
    sessions: { label: 'Sessions', color: 'var(--series-purple)', unit: '' },
    trainingLoadKg: { label: 'Training load', color: 'var(--series-blue)', unit: ' kg' },
} as const;

type Metric = keyof typeof metrics;
const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

export default function WorkoutVolumeChart({ data }: { data: WorkoutVolumePoint[] }) {
    const [metric, setMetric] = useState<Metric>('sets');
    const { label, color, unit } = metrics[metric];
    const total = data.reduce((sum, day) => sum + (day[metric] ?? 0), 0);
    const formatValue = (value: number) => numberFormat.format(value) + unit;

    return (
        <>
            <div role="group" aria-label="Workout volume metric" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(Object.keys(metrics) as Metric[]).map((key) => (
                    <button
                        key={key}
                        type="button"
                        className="btn-secondary"
                        aria-pressed={metric === key}
                        style={metric === key ? { borderColor: color, color } : undefined}
                        onClick={() => setMetric(key)}
                    >
                        {metrics[key].label}
                    </button>
                ))}
            </div>
            {total > 0 ? (
                <>
                    <p aria-live="polite"><strong>{formatValue(total)}</strong> total for the selected period</p>
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart accessibilityLayer data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                            <XAxis
                                dataKey="date"
                                tickFormatter={(date: string) => date.slice(5)}
                                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                                minTickGap={20}
                            />
                            <YAxis
                                allowDecimals={metric === 'trainingLoadKg'}
                                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                                width={64}
                            />
                            <Tooltip
                                contentStyle={{
                                    background: 'var(--surface-2)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 8,
                                }}
                                labelStyle={{ color: 'var(--text)' }}
                                formatter={(value: number) => [formatValue(value), label]}
                            />
                            <Bar dataKey={metric} fill={color} radius={[4, 4, 0, 0]} maxBarSize={32} />
                        </BarChart>
                    </ResponsiveContainer>
                </>
            ) : (
                <p className="empty-chart" aria-live="polite">
                    {metric === 'trainingLoadKg' ? 'No weighted sets with recorded reps in this period.' : `No ${label.toLowerCase()} logged in this period.`}
                </p>
            )}
            {metric === 'trainingLoadKg' && (
                <p>Training load sums weight × reps across sets with recorded weights and reps.</p>
            )}
        </>
    );
}
