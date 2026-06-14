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
    data: { date: string; value: number }[];
    color?: string;
    valueFormatter?: (v: number) => string;
    label?: string;
}

function shortDate(date: string) {
    return date.slice(5);
}

export default function DailyBarChart({
    data,
    color = '#60a5fa',
    valueFormatter = (v) => String(v),
    label = 'Value',
}: Props) {
    const chartData = data.map((d) => ({ ...d, shortDate: shortDate(d.date) }));

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
                    formatter={(value: number) => [valueFormatter(value), label]}
                    labelFormatter={(_, payload) =>
                        payload?.[0]?.payload?.date ?? ''
                    }
                />
                <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
            </BarChart>
        </ResponsiveContainer>
    );
}
