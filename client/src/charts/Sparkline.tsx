interface Props {
    values: number[];
    /** "balance" draws in green; "owed" (a credit card's debt) in red. */
    tone: 'balance' | 'owed';
}

const WIDTH = 96;
const HEIGHT = 28;
const PAD = 3;

/** A tiny trend line with a dot on today's value. Decorative: the amount sits beside it. */
export default function Sparkline({ values, tone }: Props) {
    if (values.length === 0) return <span className="sparkline" aria-hidden="true" />;

    const series = values.length === 1 ? [values[0], values[0]] : values;
    const min = Math.min(...series);
    const max = Math.max(...series);
    const span = max - min;
    const x = (i: number) => PAD + (i / (series.length - 1)) * (WIDTH - PAD * 2);
    const y = (v: number) => (span === 0 ? HEIGHT / 2 : PAD + (1 - (v - min) / span) * (HEIGHT - PAD * 2));
    const path = series.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const last = series.length - 1;

    return (
        <svg
            className={`sparkline sparkline--${tone}`}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            width={WIDTH}
            height={HEIGHT}
            aria-hidden="true"
            focusable="false"
        >
            <path
                d={path}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
            <circle cx={x(last)} cy={y(series[last])} r={2.75} fill="currentColor" />
        </svg>
    );
}
