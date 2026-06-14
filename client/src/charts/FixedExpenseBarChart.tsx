import {

    Bar,

    BarChart,

    CartesianGrid,

    ResponsiveContainer,

    Tooltip,

    XAxis,

    YAxis,

} from 'recharts';



interface Row {

    category: string;

    amount: number;

}



interface Props {

    rows: Row[];

    valueFormatter?: (v: number) => string;

}



export default function FixedExpenseBarChart({

    rows,

    valueFormatter = (v) => String(v),

}: Props) {

    const total = rows.reduce((sum, row) => sum + row.amount, 0);

    const data = rows

        .map((row) => ({

            category: row.category,

            amount: row.amount,

            pct: total > 0 ? (row.amount / total) * 100 : 0,

        }))

        .sort((a, b) => b.amount - a.amount);



    if (data.length === 0) {

        return <p className="empty-chart">No fixed expense data.</p>;

    }



    const chartHeight = Math.max(280, data.length * 36);



    return (

        <ResponsiveContainer width="100%" height={chartHeight}>

            <BarChart

                data={data}

                layout="vertical"

                margin={{ top: 8, right: 16, left: 8, bottom: 0 }}

            >

                <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3a" horizontal={false} />

                <XAxis type="number" tick={{ fill: '#9aa0a6', fontSize: 11 }} />

                <YAxis

                    type="category"

                    dataKey="category"

                    tick={{ fill: '#9aa0a6', fontSize: 11 }}

                    width={120}

                />

                <Tooltip

                    contentStyle={{

                        background: '#1a1f2b',

                        border: '1px solid #2a2f3a',

                        borderRadius: 8,

                    }}

                    formatter={(value: number, _name, item) => [

                        `${valueFormatter(value)} (${item.payload.pct.toFixed(1)}%)`,

                        item.payload.category,

                    ]}

                />

                <Bar dataKey="amount" fill="#60a5fa" radius={[0, 4, 4, 0]} name="Amount" />

            </BarChart>

        </ResponsiveContainer>

    );

}


