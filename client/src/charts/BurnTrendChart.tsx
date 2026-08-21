import {
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

interface DataPoint {
    date: string;
    caloriesBurned: number;
}

interface Props {
    data: DataPoint[];
}

function shortDate(date: string) {
    return date.slice(5);
}

export default function BurnTrendChart({ data }: Props) {
    const chartData = data
        .filter((d) => d.caloriesBurned > 0)
        .map((d) => ({ ...d, shortDate: shortDate(d.date) }));

    if (chartData.length === 0) {
        return <p className="empty-chart">No burn data in this range.</p>;
    }

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
                    formatter={(value: number) => [`${value} kcal`, 'Burned']}
                />
                <Bar
                    dataKey="caloriesBurned"
                    fill="#fb923c"
                    radius={[4, 4, 0, 0]}
                    name="Calories burned"
                />
            </BarChart>
        </ResponsiveContainer>
    );
}
