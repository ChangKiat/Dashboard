const PERIODS = [
    { id: 'month', label: 'Month' },
    { id: '3m', label: '3M' },
    { id: '6m', label: '6M' },
    { id: 'ytd', label: 'YTD' },
    { id: 'year', label: 'Year' },
    { id: 'all', label: 'All' },
];

/** Only Month works today; the multi-month ranges need range support in /api/expenses/overview. */
export default function PeriodPills() {
    return (
        <div className="pill-group" role="group" aria-label="Period">
            {PERIODS.map((period) =>
                period.id === 'month' ? (
                    <button key={period.id} type="button" className="pill-group-btn active" aria-pressed="true">
                        {period.label}
                    </button>
                ) : (
                    <button
                        key={period.id}
                        type="button"
                        className="pill-group-btn"
                        disabled
                        title="Coming soon"
                    >
                        {period.label}
                    </button>
                )
            )}
        </div>
    );
}
