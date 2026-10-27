import { useId } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { BalancePoint } from '../api';
import { formatShortDate } from '../utils/accountHistory';
import { niceTicks } from '../utils/chartTicks';

interface Props {
    /** One point per day. */
    data: BalancePoint[];
    tone: 'balance' | 'owed';
    /** Tooltip name, e.g. "Balance" or "Owed". */
    valueName: string;
    formatValue: (value: number) => string;
    formatAxis: (value: number) => string;
}

/** The 1st of each month in the data, or every 7th day when it covers less than two months. */
function dateTicks(data: BalancePoint[]): { ticks: string[]; monthly: boolean } {
    const firsts = data.filter((p) => p.date.endsWith('-01')).map((p) => p.date);
    if (firsts.length >= 2) return { ticks: firsts, monthly: true };
    return { ticks: data.filter((_, i) => i % 7 === 0).map((p) => p.date), monthly: false };
}

function tickLabel(date: string, monthly: boolean) {
    const d = new Date(`${date}T12:00:00`);
    if (!monthly) return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
    return `${d.toLocaleDateString('en-US', { month: 'short' })} ${date.slice(2, 4)}`;
}

export default function BalanceHistoryChart({ data, tone, valueName, formatValue, formatAxis }: Props) {
    const gradientId = `balance-fill-${useId().replace(/:/g, '')}`;
    const color = tone === 'owed' ? 'var(--danger)' : 'var(--ok)';
    const values = niceTicks(data.map((p) => p.value));
    const { ticks, monthly } = dateTicks(data);
    // Non-breaking space so "RM 10k" stays on one line.
    const axisLabel = (value: number) => formatAxis(value).replace(/ /g, ' ');

    return (
        <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity={0.18} />
                        <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                    </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                    dataKey="date"
                    ticks={ticks}
                    tickFormatter={(date: string) => tickLabel(date, monthly)}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                    minTickGap={12}
                />
                <YAxis
                    ticks={values}
                    domain={[values[0], values[values.length - 1]]}
                    tickFormatter={axisLabel}
                    tickLine={false}
                    axisLine={false}
                    width={72}
                    tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                />
                <Tooltip
                    cursor={{ stroke: 'var(--border-hover)' }}
                    contentStyle={{
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                    }}
                    labelStyle={{ color: 'var(--text-heading)', fontWeight: 700 }}
                    labelFormatter={(date) => formatShortDate(String(date))}
                    formatter={(value: number) => [formatValue(value), valueName]}
                />
                <Area
                    dataKey="value"
                    type="stepAfter"
                    stroke={color}
                    strokeWidth={2}
                    fill={`url(#${gradientId})`}
                    dot={false}
                    activeDot={{ r: 4, fill: color, stroke: 'var(--surface-2)', strokeWidth: 2 }}
                    isAnimationActive={false}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
}
