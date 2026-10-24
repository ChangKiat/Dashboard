import type { ReactNode } from 'react';

type Variant = 'default' | 'highlight' | 'warning' | 'danger';
/** Colour of the strip along the top of the card. */
type Tone = 'none' | 'spend' | 'income' | 'net';

interface Props {
    label: string;
    value: string;
    sub?: ReactNode;
    variant?: Variant;
    tone?: Tone;
    icon?: ReactNode;
}

export default function SummaryCard({ label, value, sub, variant = 'default', tone = 'none', icon }: Props) {
    return (
        <div className={`summary-card summary-card--${variant} summary-card--tone-${tone}`}>
            {icon && <span className="summary-icon">{icon}</span>}
            <div className="summary-body">
                <span className="summary-label">{label}</span>
                <span className="summary-value">{value}</span>
                {sub && <span className="summary-sub">{sub}</span>}
            </div>
        </div>
    );
}
