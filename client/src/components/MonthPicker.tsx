import { useCallback, useRef } from 'react';
import { formatMonthLabel, shiftMonth } from '../hooks/useMonth';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';

interface Props {
    month: string;
    onChange: (month: string) => void;
}

export default function MonthPicker({ month, onChange }: Props) {
    const inputRef = useRef<HTMLInputElement>(null);
    const goPrev = useCallback(() => onChange(shiftMonth(month, -1)), [month, onChange]);
    const goNext = useCallback(() => onChange(shiftMonth(month, 1)), [month, onChange]);
    const label = formatMonthLabel(month);

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
            <button type="button" className="month-nav" onClick={goPrev} aria-label="Previous month">
                <ChevronLeftIcon size={18} />
            </button>
            <span className="month-picker-label">
                <button
                    type="button"
                    className="month-picker-current"
                    onClick={openPicker}
                    aria-label={`Choose month, ${label} selected`}
                >
                    {label}
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
            <button type="button" className="month-nav" onClick={goNext} aria-label="Next month">
                <ChevronRightIcon size={18} />
            </button>
        </div>
    );
}
