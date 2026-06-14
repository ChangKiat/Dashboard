import type { Preset } from '../hooks/useDateRange';

interface Props {
    preset: Preset;
    start: string;
    end: string;
    onPresetChange: (preset: Preset) => void;
    onCustomChange: (start: string, end: string) => void;
}

const PRESETS: { id: Preset; label: string }[] = [
    { id: '7d', label: '7 days' },
    { id: '30d', label: '30 days' },
    { id: '90d', label: '90 days' },
    { id: 'custom', label: 'Custom' },
];

export default function DateRangePicker({
    preset,
    start,
    end,
    onPresetChange,
    onCustomChange,
}: Props) {
    return (
        <div className="date-picker">
            <div className="preset-group">
                {PRESETS.map((p) => (
                    <button
                        key={p.id}
                        type="button"
                        className={preset === p.id ? 'preset active' : 'preset'}
                        onClick={() => onPresetChange(p.id)}
                    >
                        {p.label}
                    </button>
                ))}
            </div>
            {preset === 'custom' && (
                <div className="custom-range">
                    <label>
                        From
                        <input
                            type="date"
                            value={start}
                            onChange={(e) => onCustomChange(e.target.value, end)}
                        />
                    </label>
                    <label>
                        To
                        <input
                            type="date"
                            value={end}
                            onChange={(e) => onCustomChange(start, e.target.value)}
                        />
                    </label>
                </div>
            )}
            <span className="range-label">
                {start} → {end}
            </span>
        </div>
    );
}
