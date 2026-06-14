import {
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import type { NutritionDailyPoint } from '../api';

interface Props {
    series: NutritionDailyPoint[];
}

function shortDate(date: string) {
    return date.slice(5);
}

export default function NutritionLineChart({ series }: Props) {
    const targets = series[0]?.targets;
    const chartData = series.map((d) => ({
        ...d,
        shortDate: shortDate(d.date),
    }));

    return (
        <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3a" />
                <XAxis
                    dataKey="shortDate"
                    tick={{ fill: '#9aa0a6', fontSize: 11 }}
                    interval="preserveStartEnd"
                />
                <YAxis tick={{ fill: '#9aa0a6', fontSize: 11 }} width={48} />
                <Tooltip
                    contentStyle={{
                        background: '#1a1f2b',
                        border: '1px solid #2a2f3a',
                        borderRadius: 8,
                    }}
                    labelFormatter={(_, payload) =>
                        payload?.[0]?.payload?.date ?? ''
                    }
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {targets && (
                    <>
                        <ReferenceLine
                            y={targets.calories}
                            stroke="#f87171"
                            strokeDasharray="4 4"
                            label={{ value: 'Cal target', fill: '#f87171', fontSize: 10 }}
                        />
                        <ReferenceLine
                            y={targets.protein}
                            stroke="#60a5fa"
                            strokeDasharray="4 4"
                            label={{ value: 'Protein target', fill: '#60a5fa', fontSize: 10 }}
                        />
                    </>
                )}
                <Line
                    type="monotone"
                    dataKey="calories"
                    stroke="#f87171"
                    strokeWidth={2}
                    dot={false}
                    name="Calories"
                />
                <Line
                    type="monotone"
                    dataKey="protein"
                    stroke="#60a5fa"
                    strokeWidth={2}
                    dot={false}
                    name="Protein (g)"
                />
                <Line
                    type="monotone"
                    dataKey="carbs"
                    stroke="#fbbf24"
                    strokeWidth={2}
                    dot={false}
                    name="Carbs (g)"
                />
                <Line
                    type="monotone"
                    dataKey="fat"
                    stroke="#34d399"
                    strokeWidth={2}
                    dot={false}
                    name="Fat (g)"
                />
            </LineChart>
        </ResponsiveContainer>
    );
}
