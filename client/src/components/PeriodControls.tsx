import { periodLabel, type Period } from '../hooks/usePeriod';
import MonthPicker from './MonthPicker';
import PeriodPills from './PeriodPills';

interface Props {
    period: Period;
    onPeriodChange: (period: Period) => void;
    month: string;
    onMonthChange: (month: string) => void;
    /** First month with entries, for the "Since …" label under All. */
    firstDataMonth: string | null;
    /** Last month of the All period (this month). */
    allEndMonth: string;
}

/** Period pills plus the month arrows (or "Since …" for All). */
export default function PeriodControls({
    period,
    onPeriodChange,
    month,
    onMonthChange,
    firstDataMonth,
    allEndMonth,
}: Props) {
    return (
        <>
            <PeriodPills value={period} onChange={onPeriodChange} />
            {period === 'all' ? (
                <span className="period-label">{periodLabel('all', allEndMonth, firstDataMonth)}</span>
            ) : (
                <MonthPicker
                    month={month}
                    onChange={onMonthChange}
                    label={period === 'month' ? undefined : periodLabel(period, month, null)}
                    step={period === 'year' ? 12 : 1}
                />
            )}
        </>
    );
}
