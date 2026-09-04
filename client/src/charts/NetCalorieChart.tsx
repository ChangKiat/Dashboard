import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

export interface NetCalorieDay {
    date: string;
    calories: number;
    caloriesBurned: number;
    net: number;
    target: number;
}

interface Props {
    data: NetCalorieDay[];
}

function shortDate(date: string) {
    return date.slice(5);
}

function colorForNet(net: number, target: number) {
    if (target <= 0) return '#60a5fa';
    const ratio = net / target;
    if (ratio > 1.1) return '#f87171';
    if (ratio < 0.9) return '#60a5fa';
    return '#34d399';
}

export default function NetCalorieChart({ data }: Props) {
    const chartData = data
        .filter((d) => d.calories > 0 || d.caloriesBurned > 0)
        .map((d) => ({ ...d, shortDate: shortDate(d.date) }));

    if (chartData.length === 0) {
        return <p className="empty-chart">No calorie data in this range.</p>;
    }

    const target = data.find((d) => d.target > 0)?.target;

    return (
        <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                    dataKey="shortDate"
                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    interval="preserveStartEnd"
                />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} width={48} />
                <Tooltip
                    contentStyle={{
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                    }}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ''}
                    formatter={(value: number) => [`${value} kcal`, 'Net']}
                />
                {target != null && (
                    <ReferenceLine
                        y={target}
                        stroke="#f87171"
                        strokeDasharray="4 4"
                        label={{ value: 'Target', fill: '#f87171', fontSize: 10 }}
                    />
                )}
                <Bar dataKey="net" name="Net" radius={[4, 4, 0, 0]}>
                    {chartData.map((d) => (
                        <Cell key={d.date} fill={colorForNet(d.net, d.target)} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}
