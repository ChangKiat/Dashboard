import { forwardRef, useEffect, useMemo, useState } from 'react';

import type { AccountActivityEntry, AccountBalanceHistory, HoldingPosition, PaymentAccount } from '../api';
import { fetchAccountActivity, fetchPortfolio } from '../api';
import BalanceHistoryChart from '../charts/BalanceHistoryChart';
import { addDays, dailyValues, formatShortDate } from '../utils/accountHistory';
import { todayInKL } from '../utils/dateRange';
import AccountActivityList from './AccountActivityList';
import AccountIcon from './AccountIcon';
import RowActions from './RowActions';

interface Props {
    account: PaymentAccount;
    /** Not loaded yet, or an investment (no history). */
    history: AccountBalanceHistory | undefined;
    formatAmount: (amount: number) => string;
    formatAxis: (amount: number) => string;
    onEdit: () => void;
    onDelete: () => void;
    /** Month view with statement totals, cashback, fixed deposits and Pay off. */
    onOpenStatement: () => void;
    onOpenPortfolio: () => void;
}

function ordinal(n: number) {
    const suffixes = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return `${n}${suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]}`;
}

export function accountTypeLabel(account: PaymentAccount): string {
    if (account.accountType === 'credit') {
        return account.statementDay ? `Credit card · statement on the ${ordinal(account.statementDay)}` : 'Credit card';
    }
    if (account.accountType === 'investment') {
        const count = account.holdings?.length ?? 0;
        return count > 0 ? `Investment · ${count} ${count === 1 ? 'holding' : 'holdings'}` : 'Investment';
    }
    return (account.fdLocked ?? 0) > 0 ? 'Account · with fixed deposits' : 'Account';
}

function signed(amount: number, formatAmount: (amount: number) => string) {
    return `${amount < 0 ? '−' : '+'}${formatAmount(Math.abs(amount))}`;
}

/** The picked account: today's figure, its balance over time (or holdings), and every transaction. */
const AccountDetailPanel = forwardRef<HTMLDivElement, Props>(function AccountDetailPanel(
    { account, history, formatAmount, formatAxis, onEdit, onDelete, onOpenStatement, onOpenPortfolio },
    ref
) {
    const isCredit = account.accountType === 'credit';
    const isInvestment = account.accountType === 'investment';
    // Keyed by account id so a refresh keeps the old list on screen until the new one arrives.
    const [activity, setActivity] = useState<{ id: number; entries: AccountActivityEntry[] } | null>(null);
    const [holdings, setHoldings] = useState<{ id: number; rows: HoldingPosition[] } | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setError(null);
        fetchAccountActivity(account.id)
            .then((res) => {
                if (!cancelled) setActivity({ id: account.id, entries: res.entries });
            })
            .catch((err) => {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load activity');
            });
        if (account.accountType === 'investment') {
            fetchPortfolio(account.id)
                .then((res) => {
                    if (!cancelled) setHoldings({ id: account.id, rows: res.holdings });
                })
                .catch(() => {
                    if (!cancelled) setHoldings({ id: account.id, rows: [] });
                });
        }
        return () => {
            cancelled = true;
        };
    }, [account]);

    const entries = activity?.id === account.id ? activity.entries : null;
    const holdingRows = holdings?.id === account.id ? holdings.rows : null;

    const chartData = useMemo(() => {
        if (!history || history.points.length === 0) return [];
        const lastPoint = history.points[history.points.length - 1].date;
        const today = todayInKL();
        return dailyValues(history.points, history.points[0].date, lastPoint > today ? lastPoint : today);
    }, [history]);

    let label: string;
    let value: number;
    let sub: string | null = null;
    if (isCredit) {
        label = 'Owed';
        value = account.amountOwed ?? 0;
        if (account.creditLimit) {
            sub = `Limit ${formatAmount(account.creditLimit)} · ${formatAmount(account.availableCredit ?? 0)} available`;
        }
    } else if (isInvestment) {
        label = 'Value';
        value = account.nav ?? account.balance ?? 0;
        const gain = account.unrealizedGain ?? 0;
        sub = `Deposited ${formatAmount(account.totalCostBasis ?? 0)} · ${signed(gain, formatAmount)} ${
            gain < 0 ? 'loss' : 'gain'
        }`;
    } else {
        label = 'Balance';
        value = account.balance ?? 0;
        if ((account.fdLocked ?? 0) > 0) {
            sub = `${formatAmount(account.available ?? 0)} available · ${formatAmount(
                account.fdLocked ?? 0
            )} in fixed deposits`;
        }
    }

    const lastActivity = history?.lastActivity ?? entries?.[0]?.date ?? null;
    const meta = [
        history && history.points.length > 0
            ? `Tracked since ${formatShortDate(addDays(history.points[0].date, 1))}`
            : null,
        lastActivity ? `last activity ${formatShortDate(lastActivity)}` : null,
    ]
        .filter(Boolean)
        .join(' · ');

    const sortedHoldings = holdingRows ? [...holdingRows].sort((a, b) => b.marketValue - a.marketValue) : null;

    return (
        <div ref={ref} className="account-detail-column">
            <section className="card account-detail" aria-labelledby="account-detail-title">
                <div className="account-detail-head">
                    <AccountIcon name={account.name} accountType={account.accountType} />
                    <div className="account-detail-name">
                        <h3 id="account-detail-title">{account.name}</h3>
                        <p>{accountTypeLabel(account)}</p>
                    </div>
                    <div className="account-detail-actions">
                        {isInvestment ? (
                            <button type="button" className="btn-add" onClick={onOpenPortfolio}>
                                Portfolio
                            </button>
                        ) : (
                            <button type="button" className="btn-add" onClick={onOpenStatement}>
                                {isCredit ? 'Statements' : 'Monthly statement'}
                            </button>
                        )}
                        <RowActions onEdit={onEdit} onDelete={onDelete} deleteLabel={account.name} />
                    </div>
                </div>

                <p className="account-detail-label">{label}</p>
                <p className={`account-detail-value${!isCredit && value < 0 ? ' negative' : ''}`}>
                    {formatAmount(value)}
                </p>
                {sub && <p className="account-detail-sub">{sub}</p>}
                {meta && <p className="account-detail-meta">{meta}</p>}

                {isInvestment ? (
                    <div className="account-holdings">
                        <h4>Holdings</h4>
                        {sortedHoldings == null ? (
                            <p className="muted">Loading holdings…</p>
                        ) : sortedHoldings.length === 0 ? (
                            <p className="muted">No holdings yet. Open the portfolio to add one.</p>
                        ) : (
                            <ul>
                                {sortedHoldings.map((h) => (
                                    <li key={h.instrument.id}>
                                        <span className="account-holding-name">{h.instrument.name}</span>
                                        <span className="account-holding-figures">
                                            <span>{formatAmount(h.marketValue)}</span>
                                            <small
                                                className={
                                                    h.unrealizedGain < 0
                                                        ? 'account-activity-out'
                                                        : 'account-activity-in'
                                                }
                                            >
                                                {signed(h.unrealizedGain, formatAmount)}
                                            </small>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                ) : chartData.length >= 2 ? (
                    <div className="account-detail-chart">
                        <BalanceHistoryChart
                            data={chartData}
                            tone={isCredit ? 'owed' : 'balance'}
                            valueName={isCredit ? 'Owed' : 'Balance'}
                            formatValue={formatAmount}
                            formatAxis={formatAxis}
                        />
                    </div>
                ) : history ? (
                    <p className="muted account-detail-chart-empty">
                        The chart fills in once this account has a few days of transactions.
                    </p>
                ) : null}
            </section>

            {error ? (
                <p className="error">{error}</p>
            ) : entries == null ? (
                <section className="card account-activity-card">
                    <p className="muted">Loading activity…</p>
                </section>
            ) : (
                <AccountActivityList
                    key={account.id}
                    entries={entries}
                    accountType={account.accountType}
                    formatAmount={formatAmount}
                />
            )}
        </div>
    );
});

export default AccountDetailPanel;
