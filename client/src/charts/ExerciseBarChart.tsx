import {
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

interface Props {
    data: { exercise: string; count: number }[];
}

export default function ExerciseBarChart({ data }: Props) {
    if (data.length === 0) {
        return <p className="empty-chart">No workouts in this range.</p>;
    }

    return (
        <ResponsiveContainer width="100%" height={280}>
            <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
            >
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3a" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#9aa0a6', fontSize: 11 }} />
                <YAxis
                    type="category"
                    dataKey="exercise"
                    tick={{ fill: '#9aa0a6', fontSize: 11 }}
                    width={100}
                />
                <Tooltip
                    contentStyle={{
                        background: '#1a1f2b',
                        border: '1px solid #2a2f3a',
                        borderRadius: 8,
                    }}
                />
                <Bar dataKey="count" fill="#a78bfa" radius={[0, 4, 4, 0]} name="Sessions" />
            </BarChart>
        </ResponsiveContainer>
    );
}
