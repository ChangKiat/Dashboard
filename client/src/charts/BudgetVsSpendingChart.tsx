import {
    Bar,
    CartesianGrid,
    ComposedChart,
    Legend,
    Line,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

interface Row {
    category: string;
    monthlyBudget: number;
    spending: number;
}

interface Props {
    rows: Row[];
    valueFormatter?: (v: number) => string;
}

export default function BudgetVsSpendingChart({
    rows,
    valueFormatter = (v) => String(v),
}: Props) {
    const data = rows.map((row) => ({
        category: row.category,
        budget: row.monthlyBudget,
        spending: row.spending,
    }));

    if (data.length === 0) {
        return <p className="empty-chart">No budget categories configured.</p>;
    }

    return (
        <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3a" />
                <XAxis
                    dataKey="category"
                    tick={{ fill: '#9aa0a6', fontSize: 11 }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={60}
                />
                <YAxis tick={{ fill: '#9aa0a6', fontSize: 11 }} width={48} />
                <Tooltip
                    contentStyle={{
                        background: '#1a1f2b',
                        border: '1px solid #2a2f3a',
                        borderRadius: 8,
                    }}
                    formatter={(value: number, name: string) => [
                        valueFormatter(value),
                        name === 'budget' ? 'Budget' : 'Spending',
                    ]}
                />
                <Legend
                    wrapperStyle={{ fontSize: 12, color: '#9aa0a6' }}
                    formatter={(value) => (value === 'budget' ? 'Budget' : 'Spending')}
                />
                <Bar dataKey="budget" fill="#60a5fa" radius={[4, 4, 0, 0]} name="budget" />
                <Line
                    type="monotone"
                    dataKey="spending"
                    stroke="#f87171"
                    strokeWidth={2}
                    dot={{ fill: '#f87171', r: 4 }}
                    name="spending"
                />
            </ComposedChart>
        </ResponsiveContainer>
    );
}
