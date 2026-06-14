interface Props {
    label: string;
    value: string;
    sub?: string;
}

export default function SummaryCard({ label, value, sub }: Props) {
    return (
        <div className="summary-card">
            <span className="summary-label">{label}</span>
            <span className="summary-value">{value}</span>
            {sub && <span className="summary-sub">{sub}</span>}
        </div>
    );
}
