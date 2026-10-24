import { useMemo, type CSSProperties } from 'react';
import { spendLevels, type DaySpend } from '../utils/spendingStats';

interface Props {
    /** One entry per day, oldest first, with no gaps. */
    series: DaySpend[];
    formatAmount: (amount: number) => string;
    /** Read out instead of the squares, e.g. "Spent on 120 of 365 days…". */
    summary: string;
}

const DAY_MS = 86_400_000;
const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];

function parseIsoDate(iso: string) {
    return new Date(`${iso}T12:00:00`);
}

function toIsoDate(date: Date) {
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${m}-${d}`;
}

/** A year of days as week columns (Monday on top), shaded by how much was spent. */
export default function SpendingHeatmap({ series, formatAmount, summary }: Props) {
    const layout = useMemo(() => {
        if (series.length === 0) return null;
        const level = spendLevels(series);
        const totals = new Map(series.map((d) => [d.date, d.total]));
        const first = parseIsoDate(series[0].date);
        const last = series[series.length - 1].date;
        // Start the grid on the Monday on or before the first day.
        const gridStart = new Date(first.getTime() - ((first.getDay() + 6) % 7) * DAY_MS);
        const cells: { date: string; total: number | null; level: number }[] = [];
        for (let t = gridStart.getTime(); ; t += DAY_MS) {
            const date = toIsoDate(new Date(t));
            if (date > last && cells.length % 7 === 0) break;
            const total = totals.get(date);
            cells.push({ date, total: total ?? null, level: total == null ? -1 : level(total) });
        }
        const weeks = cells.length / 7;
        // Label a week column with the month whose 1st falls in it.
        const months: { column: number; text: string }[] = [];
        for (let w = 0; w < weeks; w += 1) {
            const firstOfMonth = cells
                .slice(w * 7, w * 7 + 7)
                .find((c) => c.total != null && c.date.endsWith('-01'));
            if (firstOfMonth) {
                months.push({
                    column: w + 1,
                    text: parseIsoDate(firstOfMonth.date).toLocaleDateString('en-US', { month: 'short' }),
                });
            }
        }
        return { cells, weeks, months };
    }, [series]);

    if (!layout) return null;

    return (
        <div className="heatmap-scroll">
            <div className="heatmap" style={{ '--weeks': layout.weeks } as CSSProperties}>
                <span aria-hidden="true" />
                <div className="heatmap-months" aria-hidden="true">
                    {layout.months.map((m) => (
                        <span key={`${m.column}-${m.text}`} style={{ gridColumn: m.column }}>
                            {m.text}
                        </span>
                    ))}
                </div>
                <div className="heatmap-days" aria-hidden="true">
                    {DAY_LABELS.map((label, i) => (
                        <span key={i}>{label}</span>
                    ))}
                </div>
                <div className="heatmap-grid" role="img" aria-label={summary}>
                    {layout.cells.map((cell) =>
                        cell.total == null ? (
                            <span key={cell.date} className="heat-cell heat-out" />
                        ) : (
                            <span
                                key={cell.date}
                                className={`heat-cell heat-${cell.level}`}
                                title={`${parseIsoDate(cell.date).toLocaleDateString('en-MY', {
                                    weekday: 'short',
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                })} · ${cell.total > 0 ? formatAmount(cell.total) : 'nothing spent'}`}
                            />
                        )
                    )}
                </div>
            </div>
            <div className="heatmap-legend" aria-hidden="true">
                Less
                {[0, 1, 2, 3, 4].map((level) => (
                    <span key={level} className={`heat-cell heat-${level}`} />
                ))}
                More
            </div>
        </div>
    );
}
