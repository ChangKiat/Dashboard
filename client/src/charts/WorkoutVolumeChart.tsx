import {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

interface DataPoint {
    date: string;
    sessions: number;
    sets: number;
}

interface Props {
    data: DataPoint[];
}

function shortDate(date: string) {
    return date.slice(5);
}

export default function WorkoutVolumeChart({ data }: Props) {
    const chartData = data.map((d) => ({ ...d, shortDate: shortDate(d.date) }));

    if (chartData.length === 0) {
        return <p className="empty-chart">No workout data in this range.</p>;
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
                    labelStyle={{ color: 'var(--text)' }}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ''}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} />
                <Bar dataKey="sessions" fill="#a78bfa" radius={[4, 4, 0, 0]} name="Sessions" />
                <Bar dataKey="sets" fill="#60a5fa" radius={[4, 4, 0, 0]} name="Sets" />
            </BarChart>
        </ResponsiveContainer>
    );
}
