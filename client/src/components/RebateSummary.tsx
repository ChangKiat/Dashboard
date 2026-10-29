import { useEffect, useState } from 'react';

import type { RebateSummary as RebateSummaryData } from '../api';
import { fetchAccountRebate, syncAccountRebate } from '../api';
import { useAmountVisibility } from '../hooks/useAmountVisibility';

interface Props {
    accountId: number;
    month: string;
    formatAmount: (amount: number) => string;
}

function formatRate(rate: number): string {
    return `${(rate * 100).toFixed(rate >= 0.01 ? 0 : 1)}%`;
}

/** Empty counts as 0; anything else must be a non-negative number. */
function parseAmountInput(value: string): number | null {
    const trimmed = value.trim();
    if (trimmed === '') return 0;
    const n = Number(trimmed);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Prefill with what was already generated, falling back to the computed earned value. */
function initialAmounts(summary: RebateSummaryData): Record<string, string> {
    return Object.fromEntries(
        summary.categories.map((row) => [row.category, (row.generatedAmount ?? row.earned).toFixed(2)])
    );
}

export default function RebateSummary({ accountId, month, formatAmount }: Props) {
    const { hidden } = useAmountVisibility();
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [summary, setSummary] = useState<RebateSummaryData | null>(null);
    const [amounts, setAmounts] = useState<Record<string, string>>({});

    function applySummary(res: RebateSummaryData) {
        setSummary(res);
        setAmounts(initialAmounts(res));
    }

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetchAccountRebate(accountId, month)
            .then((res) => {
                if (cancelled) return;
                applySummary(res);
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
        if (!summary) return;
        const parsed: Record<string, number> = {};
        for (const row of summary.categories) {
            const value = parseAmountInput(amounts[row.category] ?? '');
            if (value == null) {
                setError(`Invalid amount for ${row.category}`);
                return;
            }
            parsed[row.category] = value;
        }

        setGenerating(true);
        setError(null);
        try {
            const res = await syncAccountRebate(accountId, month, parsed);
            applySummary(res);
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
    const totalToGenerate = summary.categories.reduce(
        (sum, row) => sum + (parseAmountInput(amounts[row.category] ?? '') ?? 0),
        0
    );
    const hasGenerated = summary.categories.some((row) => row.generatedAmount != null);

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
                    {generating
                        ? 'Generating…'
                        : hasGenerated
                          ? 'Update cashback'
                          : 'Generate cashback'}
                </button>
            </div>
            <p className="muted rebate-summary-note">
                {hidden
                    ? 'Show amounts to edit cashback before generating'
                    : 'Adjust the cashback amounts if needed, then generate to write them as incomes for this period'}
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
                        <th className="num rebate-cashback-col">Cashback</th>
                    </tr>
                </thead>
                <tbody>
                    {summary.categories.map((row) => {
                        const input = amounts[row.category] ?? '';
                        const parsedInput = parseAmountInput(input);
                        const edited =
                            parsedInput == null || Math.abs(parsedInput - row.earned) >= 0.005;
                        return (
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
                                <td className="num">
                                    {hidden ? (
                                        formatAmount(parsedInput ?? 0)
                                    ) : (
                                        <div className="rebate-amount-cell">
                                            {edited && (
                                                <button
                                                    type="button"
                                                    className="btn-link"
                                                    title={`Reset to earned (${formatAmount(row.earned)})`}
                                                    onClick={() =>
                                                        setAmounts((a) => ({
                                                            ...a,
                                                            [row.category]: row.earned.toFixed(2),
                                                        }))
                                                    }
                                                >
                                                    Reset
                                                </button>
                                            )}
                                            <input
                                                type="number"
                                                inputMode="decimal"
                                                min="0"
                                                step="0.01"
                                                className="rebate-amount-input"
                                                aria-label={`${row.category} cashback amount`}
                                                aria-invalid={parsedInput == null}
                                                value={input}
                                                disabled={generating}
                                                onChange={(e) => {
                                                    const value = e.target.value;
                                                    setAmounts((a) => ({ ...a, [row.category]: value }));
                                                }}
                                            />
                                        </div>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            <p className="rebate-summary-total">
                Total earned: <strong>{formatAmount(summary.totalEarned)}</strong>
                {Math.abs(totalToGenerate - summary.totalEarned) >= 0.005 && (
                    <>
                        {' · '}
                        Cashback: <strong>{formatAmount(totalToGenerate)}</strong>
                    </>
                )}
            </p>
        </div>
    );
}
