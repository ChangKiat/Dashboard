import { useCallback } from 'react';
import { shiftMonth } from '../hooks/useMonth';

interface Props {
    month: string;
    onChange: (month: string) => void;
}

export default function MonthPicker({ month, onChange }: Props) {
    const goPrev = useCallback(() => onChange(shiftMonth(month, -1)), [month, onChange]);
    const goNext = useCallback(() => onChange(shiftMonth(month, 1)), [month, onChange]);

    return (
        <div className="month-picker">
            <button type="button" className="month-nav" onClick={goPrev} aria-label="Previous month">
                ←
            </button>
            <input
                type="month"
                value={month}
                aria-label="Month"
                onChange={(e) => onChange(e.target.value)}
            />
            <button type="button" className="month-nav" onClick={goNext} aria-label="Next month">
                →
            </button>
        </div>
    );
}
