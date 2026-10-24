import { useEffect, useRef, useState } from 'react';
import {
    isValidHoursPerWeek,
    MAX_HOURS_PER_WEEK,
    MIN_HOURS_PER_WEEK,
    type AmountUnit,
} from '../hooks/useAmountUnit';

interface Props {
    unit: AmountUnit;
    onUnitChange: (unit: AmountUnit) => void;
    hoursPerWeek: number;
    onHoursPerWeekChange: (hours: number) => void;
    /** e.g. "RM 45.74/h"; null hides the rate button. */
    rateLabel: string | null;
    /** e.g. "RM 7,929.15 take-home ÷ 173 h a month". */
    rateExplanation: string | null;
    /** Set when Hours can't be used yet. */
    hoursDisabledReason?: string;
}

export default function AmountUnitToggle({
    unit,
    onUnitChange,
    hoursPerWeek,
    onHoursPerWeekChange,
    rateLabel,
    rateExplanation,
    hoursDisabledReason,
}: Props) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(String(hoursPerWeek));
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (open) setDraft(String(hoursPerWeek));
    }, [open, hoursPerWeek]);

    useEffect(() => {
        if (!open) return;

        function onPointerDown(e: PointerEvent) {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        }

        function onKeyDown(e: KeyboardEvent) {
            if (e.key === 'Escape') setOpen(false);
        }

        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    const draftValue = parseFloat(draft);
    const draftValid = isValidHoursPerWeek(draftValue);

    return (
        <div className="amount-unit" ref={rootRef}>
            {unit === 'hours' && rateLabel && (
                <button
                    type="button"
                    className="rate-chip"
                    aria-expanded={open}
                    aria-controls="rate-popover"
                    onClick={() => setOpen((o) => !o)}
                >
                    {rateLabel}
                </button>
            )}
            <div className="pill-group" role="group" aria-label="Show amounts as">
                <button
                    type="button"
                    className={unit === 'rm' ? 'pill-group-btn active' : 'pill-group-btn'}
                    aria-pressed={unit === 'rm'}
                    onClick={() => onUnitChange('rm')}
                >
                    RM
                </button>
                <button
                    type="button"
                    className={unit === 'hours' ? 'pill-group-btn active' : 'pill-group-btn'}
                    aria-pressed={unit === 'hours'}
                    disabled={Boolean(hoursDisabledReason)}
                    title={hoursDisabledReason ?? 'Show amounts as hours of work'}
                    onClick={() => onUnitChange('hours')}
                >
                    Hours
                </button>
            </div>
            {open && (
                <div id="rate-popover" className="rate-popover" role="dialog" aria-label="Hourly rate">
                    <label htmlFor="work-hours-per-week">Hours worked per week</label>
                    <input
                        id="work-hours-per-week"
                        type="number"
                        inputMode="decimal"
                        min={MIN_HOURS_PER_WEEK}
                        max={MAX_HOURS_PER_WEEK}
                        step={0.5}
                        value={draft}
                        aria-invalid={!draftValid}
                        onChange={(e) => {
                            setDraft(e.target.value);
                            const next = parseFloat(e.target.value);
                            if (isValidHoursPerWeek(next)) onHoursPerWeekChange(next);
                        }}
                    />
                    {draftValid ? (
                        rateExplanation && <p className="rate-popover-note">{rateExplanation}</p>
                    ) : (
                        <p className="rate-popover-note rate-popover-note--error">
                            Enter {MIN_HOURS_PER_WEEK}–{MAX_HOURS_PER_WEEK} hours.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
