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
import type { DailyCashflowPoint, MonthlyCashflowPoint } from '../api';
import { formatMonthLabel } from '../hooks/useMonth';
import { niceTicks } from '../utils/chartTicks';

/** One group of bars: a month or a day. */
export interface TrendPoint {
    key: string;
    /** X-axis text. */
    label: string;
    /** Tooltip heading. */
    fullLabel: string;
    income: number;
    spending: number;
    /** null leaves a gap, e.g. for days that haven't happened yet. */
    net: number | null;
}

interface Props {
    data: TrendPoint[];
    /** Tooltip values. */
    formatValue: (value: number) => string;
    /** Y-axis ticks. */
    formatAxis: (value: number) => string;
    /** What the line shows, e.g. "Net" or "Net so far". */
    netName: string;
}

/** "Oct", or "Oct 26" when the chart spans more than one year. */
function shortMonth(month: string, withYear: boolean) {
    const [yearStr, monthStr] = month.split('-');
    const name = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1).toLocaleDateString('en-US', {
        month: 'short',
    });
    return withYear ? `${name} ${yearStr.slice(2)}` : name;
}

export function monthTrendPoints(series: MonthlyCashflowPoint[]): TrendPoint[] {
    const spansYears =
        series.length > 0 && series[0].month.slice(0, 4) !== series[series.length - 1].month.slice(0, 4);
    return series.map((p) => ({
        key: p.month,
        label: shortMonth(p.month, spansYears),
        fullLabel: formatMonthLabel(p.month),
        income: p.income,
        spending: p.spending,
        net: p.net,
    }));
}

/** Days of a month, with the line as the running net since the 1st, stopping after `lastDay`. */
export function dayTrendPoints(series: DailyCashflowPoint[], lastDay: string): TrendPoint[] {
    let runningNet = 0;
    return series.map((p) => {
        runningNet += p.net;
        return {
            key: p.date,
            label: String(parseInt(p.date.slice(8, 10), 10)),
            fullLabel: new Date(`${p.date}T12:00:00`).toLocaleDateString('en-MY', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
            }),
            income: p.income,
            spending: p.spending,
            net: p.date <= lastDay ? runningNet : null,
        };
    });
}

export default function CashflowTrendChart({ data, formatValue, formatAxis, netName }: Props) {
    const ticks = niceTicks(data.flatMap((p) => (p.net == null ? [p.income, p.spending] : [p.income, p.spending, p.net])));
    // Non-breaking space so "RM 10k" stays on one line.
    const axisLabel = (value: number) => formatAxis(value).replace(/ /g, ' ');
    // Many points (a month of days): smaller dots so the line stays readable.
    const dense = data.length > 16;

    return (
        <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={dense ? 1 : 4}>
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
                    name={netName}
                    type="linear"
                    stroke="var(--series-amber)"
                    strokeWidth={2.5}
                    dot={
                        dense
                            ? false
                            : { r: 4, fill: 'var(--surface-2)', stroke: 'var(--series-amber)', strokeWidth: 2 }
                    }
                    activeDot={{ r: 5 }}
                />
            </ComposedChart>
        </ResponsiveContainer>
    );
}
