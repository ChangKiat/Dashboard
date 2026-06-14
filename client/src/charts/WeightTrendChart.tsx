import { useMemo, useState } from 'react';
import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

interface Props {
    weightTrend: Record<string, { date: string; weightKg: number }[]>;
}

function shortDate(date: string) {
    return date.slice(5);
}

export default function WeightTrendChart({ weightTrend }: Props) {
    const exercises = useMemo(() => Object.keys(weightTrend).sort(), [weightTrend]);
    const [selected, setSelected] = useState(exercises[0] ?? '');

    const activeExercise = exercises.includes(selected) ? selected : exercises[0] ?? '';
    const chartData = (weightTrend[activeExercise] ?? []).map((d) => ({
        ...d,
        shortDate: shortDate(d.date),
    }));

    if (exercises.length === 0) {
        return <p className="empty-chart">No weight data in this range.</p>;
    }

    return (
        <>
            <select
                className="chart-select"
                value={activeExercise}
                onChange={(e) => setSelected(e.target.value)}
                aria-label="Select exercise"
            >
                {exercises.map((ex) => (
                    <option key={ex} value={ex}>
                        {ex}
                    </option>
                ))}
            </select>
            <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3a" />
                    <XAxis
                        dataKey="shortDate"
                        tick={{ fill: '#9aa0a6', fontSize: 11 }}
                        interval="preserveStartEnd"
                    />
                    <YAxis
                        tick={{ fill: '#9aa0a6', fontSize: 11 }}
                        width={48}
                        unit=" kg"
                    />
                    <Tooltip
                        contentStyle={{
                            background: '#1a1f2b',
                            border: '1px solid #2a2f3a',
                            borderRadius: 8,
                        }}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ''}
                        formatter={(value: number) => [`${value} kg`, 'Weight']}
                    />
                    <Line
                        type="monotone"
                        dataKey="weightKg"
                        stroke="#f472b6"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#f472b6' }}
                        name="Weight (kg)"
                    />
                </LineChart>
            </ResponsiveContainer>
        </>
    );
}
