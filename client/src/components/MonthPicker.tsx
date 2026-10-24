import { useCallback, useRef } from 'react';
import { formatMonthLabel, shiftMonth } from '../hooks/useMonth';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';

interface Props {
    month: string;
    onChange: (month: string) => void;
    /** Shown instead of the month name, e.g. "Aug – Oct 2026" for a 3-month period. */
    label?: string;
    /** Months the arrows move by (12 steps a year at a time). */
    step?: number;
}

export default function MonthPicker({ month, onChange, label, step = 1 }: Props) {
    const inputRef = useRef<HTMLInputElement>(null);
    const goPrev = useCallback(() => onChange(shiftMonth(month, -step)), [month, onChange, step]);
    const goNext = useCallback(() => onChange(shiftMonth(month, step)), [month, onChange, step]);
    const text = label ?? formatMonthLabel(month);
    const unit = step === 12 ? 'year' : 'month';

    const openPicker = useCallback(() => {
        const input = inputRef.current;
        if (!input) return;
        try {
            input.showPicker();
        } catch {
            input.focus();
        }
    }, []);

    return (
        <div className="month-picker">
            <button type="button" className="month-nav" onClick={goPrev} aria-label={`Previous ${unit}`}>
                <ChevronLeftIcon size={18} />
            </button>
            <span className="month-picker-label">
                <button
                    type="button"
                    className="month-picker-current"
                    onClick={openPicker}
                    aria-label={`Choose month, ${text} selected`}
                >
                    {text}
                </button>
                <input
                    ref={inputRef}
                    type="month"
                    className="month-picker-input"
                    value={month}
                    tabIndex={-1}
                    aria-hidden="true"
                    onChange={(e) => onChange(e.target.value)}
                />
            </span>
            <button type="button" className="month-nav" onClick={goNext} aria-label={`Next ${unit}`}>
                <ChevronRightIcon size={18} />
            </button>
        </div>
    );
}
