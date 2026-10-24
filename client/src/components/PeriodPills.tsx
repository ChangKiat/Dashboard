import { PERIODS, type Period } from '../hooks/usePeriod';

interface Props {
    value: Period;
    onChange: (period: Period) => void;
}

export default function PeriodPills({ value, onChange }: Props) {
    return (
        <div className="pill-group" role="group" aria-label="Period">
            {PERIODS.map((period) => (
                <button
                    key={period.id}
                    type="button"
                    className={value === period.id ? 'pill-group-btn active' : 'pill-group-btn'}
                    aria-pressed={value === period.id}
                    onClick={() => onChange(period.id)}
                >
                    {period.label}
                </button>
            ))}
        </div>
    );
}
