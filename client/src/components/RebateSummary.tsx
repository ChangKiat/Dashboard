import { useEffect, useState } from 'react';

import type { RebateSummary as RebateSummaryData } from '../api';
import { fetchAccountRebate, syncAccountRebate } from '../api';

interface Props {
    accountId: number;
    month: string;
    formatAmount: (amount: number) => string;
}

function formatRate(rate: number): string {
    return `${(rate * 100).toFixed(rate >= 0.01 ? 0 : 1)}%`;
}

export default function RebateSummary({ accountId, month, formatAmount }: Props) {
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [summary, setSummary] = useState<RebateSummaryData | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetchAccountRebate(accountId, month)
            .then((res) => {
                if (cancelled) return;
                setSummary(res);
            })
            .catch((err) => {
                if (cancelled) return;
                setError(err instanceof Error ? err.message : 'Failed to load rebate');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [accountId, month]);

    async function handleGenerate() {
        setGenerating(true);
        setError(null);
        try {
            const res = await syncAccountRebate(accountId, month);
            setSummary(res);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate cashback');
        } finally {
            setGenerating(false);
        }
    }

    if (loading) return <p className="muted rebate-summary-loading">Loading cashback…</p>;
    if (error && !summary) return <p className="error">{error}</p>;
    if (!summary) return null;

    const isTiered = summary.ruleType === 'tiered';

    return (
        <div className="rebate-summary">
            <div className="rebate-summary-header">
                <h5>Cashback</h5>
                <button
                    type="button"
                    className="btn-primary"
                    onClick={handleGenerate}
                    disabled={generating}
                >
                    {generating ? 'Generating…' : 'Generate cashback'}
                </button>
            </div>
            <p className="muted rebate-summary-note">
                Incomes are written for this period when you generate
            </p>
            {error && <p className="error">{error}</p>}
            {isTiered ? (
                <p className="rebate-summary-threshold">
                    Total spend: <strong>{formatAmount(summary.totalSpend)}</strong>
                    {summary.activeTier ? (
                        <>
                            {' · '}
                            <span className="rebate-tier-badge">{summary.activeTier.label}</span>
                        </>
                    ) : (
                        <span className="rebate-requirement-unmet"> · No tier reached</span>
                    )}
                </p>
            ) : (
                <p className="rebate-summary-threshold">
                    Total spend: <strong>{formatAmount(summary.totalSpend)}</strong>
                    {' / '}
                    {formatAmount(summary.minSpendThreshold ?? 0)}
                    {' · '}
                    {summary.minSpendMet
                        ? `${formatRate(summary.rate ?? 0)} rate applies`
                        : `${formatRate(summary.rate ?? 0)} rate (below min spend)`}
                </p>
            )}
            <table className="data-table rebate-summary-table">
                <thead>
                    <tr>
                        <th>Category</th>
                        <th className="num">Spend</th>
                        <th className="num">Rate</th>
                        <th className="num">Earned</th>
                        <th className="num">Cap</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {summary.categories.map((row) => (
                        <tr
                            key={row.category}
                            className={
                                row.fullyClaimed
                                    ? 'rebate-maxed'
                                    : row.requirementMet === false
                                      ? 'rebate-requirement-row-unmet'
                                      : 'rebate-not-maxed'
                            }
                        >
                            <td>
                                {row.category}
                                {row.isDefault && (
                                    <span className="rebate-default-badge">Default</span>
                                )}
                                {isTiered && row.requirementNote && (
                                    <span
                                        className={
                                            row.requirementMet
                                                ? 'rebate-requirement-note'
                                                : 'rebate-requirement-unmet rebate-requirement-note'
                                        }
                                    >
                                        {row.requirementNote}
                                    </span>
                                )}
                            </td>
                            <td className="num">{formatAmount(row.spend)}</td>
                            <td className="num">{formatRate(row.rate)}</td>
                            <td className="num">{formatAmount(row.earned)}</td>
                            <td className="num">
                                {row.cap == null ? 'Unlimited' : formatAmount(row.cap)}
                            </td>
                            <td>
                                {!row.requirementMet ? (
                                    <span className="rebate-requirement-unmet">Not eligible</span>
                                ) : row.cap == null ? (
                                    <span className="rebate-status-unlimited">Unlimited</span>
                                ) : row.fullyClaimed ? (
                                    <span className="rebate-status-maxed">Maxed</span>
                                ) : (
                                    <span className="rebate-status-remaining">
                                        {formatAmount(row.remaining ?? 0)} left
                                    </span>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className="rebate-summary-total">
                Total earned: <strong>{formatAmount(summary.totalEarned)}</strong>
            </p>
        </div>
    );
}
