type Variant = 'default' | 'highlight' | 'warning' | 'danger';

interface Props {
    label: string;
    value: string;
    sub?: string;
    variant?: Variant;
}

export default function SummaryCard({ label, value, sub, variant = 'default' }: Props) {
    return (
        <div className={`summary-card summary-card--${variant}`}>
            <span className="summary-label">{label}</span>
            <span className="summary-value">{value}</span>
            {sub && <span className="summary-sub">{sub}</span>}
        </div>
    );
}
