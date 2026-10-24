import {
    Bar,
    CartesianGrid,
    ComposedChart,
    Line,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import type { MonthlyCashflowPoint } from '../api';
import { formatMonthLabel } from '../hooks/useMonth';

interface Props {
    data: MonthlyCashflowPoint[];
    /** Tooltip values. */
    formatValue: (value: number) => string;
    /** Y-axis ticks. */
    formatAxis: (value: number) => string;
}

function shortMonth(month: string) {
    const [yearStr, monthStr] = month.split('-');
    return new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1).toLocaleDateString('en-US', {
        month: 'short',
    });
}

/** Round tick values (steps of 1, 2, 2.5 or 5 × 10ⁿ) covering zero and every value. */
function niceTicks(values: number[], targetCount = 5): number[] {
    const min = Math.min(0, ...values);
    const max = Math.max(0, ...values);
    if (min === max) return [0];
    const rough = (max - min) / (targetCount - 1);
    const magnitude = 10 ** Math.floor(Math.log10(rough));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? 10 * magnitude;
    const first = Math.floor(min / step);
    const last = Math.ceil(max / step);
    const ticks: number[] = [];
    for (let i = first; i <= last; i += 1) {
        ticks.push(Math.round(i * step * 100) / 100);
    }
    return ticks;
}

export default function CashflowTrendChart({ data, formatValue, formatAxis }: Props) {
    const chartData = data.map((point) => ({
        ...point,
        label: shortMonth(point.month),
        fullLabel: formatMonthLabel(point.month),
    }));
    const ticks = niceTicks(data.flatMap((p) => [p.income, p.spending, p.net]));
    // Non-breaking space so "RM 10k" stays on one line.
    const axisLabel = (value: number) => formatAxis(value).replace(/ /g, ' ');

    return (
        <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                />
                <YAxis
                    ticks={ticks}
                    domain={[ticks[0], ticks[ticks.length - 1]]}
                    tickFormatter={axisLabel}
                    tickLine={false}
                    axisLine={false}
                    width={72}
                    tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                />
                <ReferenceLine y={0} stroke="var(--border-hover)" />
                <Tooltip
                    cursor={{ fill: 'var(--surface-hover)', opacity: 0.6 }}
                    contentStyle={{
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                    }}
                    labelStyle={{ color: 'var(--text-heading)', fontWeight: 700 }}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.fullLabel ?? ''}
                    formatter={(value: number, name: string) => [formatValue(value), name]}
                />
                <Bar dataKey="income" name="Income" fill="var(--ok)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="spending" name="Spending" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Line
                    dataKey="net"
                    name="Net"
                    type="linear"
                    stroke="var(--series-amber)"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: 'var(--surface-2)', stroke: 'var(--series-amber)', strokeWidth: 2 }}
                    activeDot={{ r: 5 }}
                />
            </ComposedChart>
        </ResponsiveContainer>
    );
}
