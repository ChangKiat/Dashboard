import { useCallback } from 'react';
import { formatMonthLabel, shiftMonth } from '../hooks/useMonth';

interface Props {
    month: string;
    onChange: (month: string) => void;
}

export default function MonthPicker({ month, onChange }: Props) {
    const goPrev = useCallback(() => onChange(shiftMonth(month, -1)), [month, onChange]);
    const goNext = useCallback(() => onChange(shiftMonth(month, 1)), [month, onChange]);

    return (
        <div className="month-picker">
            <div className="month-picker-controls">
                <button type="button" className="preset" onClick={goPrev} aria-label="Previous month">
                    ←
                </button>
                <label className="month-input-label">
                    Month
                    <input
                        type="month"
                        value={month}
                        onChange={(e) => onChange(e.target.value)}
                    />
                </label>
                <button type="button" className="preset" onClick={goNext} aria-label="Next month">
                    →
                </button>
            </div>
            <span className="range-label">{formatMonthLabel(month)}</span>
        </div>
    );
}
