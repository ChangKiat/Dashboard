import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface Props {
    breakdown: Record<string, number>;
    valueFormatter?: (v: number) => string;
}

const COLORS = [
    '#60a5fa',
    '#34d399',
    '#fbbf24',
    '#f87171',
    '#a78bfa',
    '#fb923c',
    '#2dd4bf',
    '#e879f9',
];

export default function CategoryPieChart({
    breakdown,
    valueFormatter = (v) => String(v),
}: Props) {
    const data = Object.entries(breakdown)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

    if (data.length === 0) {
        return <p className="empty-chart">No category data in this range.</p>;
    }

    return (
        <ResponsiveContainer width="100%" height={280}>
            <PieChart>
                <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={2}
                >
                    {data.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                </Pie>
                <Tooltip
                    contentStyle={{
                        background: '#1a1f2b',
                        border: '1px solid #2a2f3a',
                        borderRadius: 8,
                    }}
                    formatter={(value: number) => valueFormatter(value)}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: '#9aa0a6' }} />
            </PieChart>
        </ResponsiveContainer>
    );
}
