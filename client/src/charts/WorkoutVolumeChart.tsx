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
                    labelStyle={{ color: '#e8eaed' }}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ''}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: '#9aa0a6' }} />
                <Bar dataKey="sessions" fill="#a78bfa" radius={[4, 4, 0, 0]} name="Sessions" />
                <Bar dataKey="sets" fill="#60a5fa" radius={[4, 4, 0, 0]} name="Sets" />
            </BarChart>
        </ResponsiveContainer>
    );
}
