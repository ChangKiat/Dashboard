import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import type { BodyWeightLogEntry } from '../api';

interface Props {
    data: BodyWeightLogEntry[];
}

function shortDate(date: string) {
    return date.slice(5);
}

export default function BodyWeightTrendChart({ data }: Props) {
    const chartData = data.map((d) => ({
        ...d,
        shortDate: shortDate(d.date),
    }));

    if (chartData.length === 0) {
        return <p className="empty-chart">No body weight logs in this range.</p>;
    }

    return (
        <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                    dataKey="shortDate"
                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    interval="preserveStartEnd"
                />
                <YAxis
                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    width={48}
                    unit=" kg"
                    domain={['auto', 'auto']}
                />
                <Tooltip
                    contentStyle={{
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                    }}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ''}
                    formatter={(value: number) => [`${value} kg`, 'Body weight']}
                />
                <Line
                    type="monotone"
                    dataKey="weightKg"
                    stroke="#34d399"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#34d399' }}
                    name="Body weight (kg)"
                />
            </LineChart>
        </ResponsiveContainer>
    );
}
