interface Row {
    category: string;
    monthlyBudget: number;
    spending: number;
    overBudget: boolean;
}

interface Props {
    rows: Row[];
    formatAmount: (amount: number) => string;
}

export default function VariableExpensesTable({ rows, formatAmount }: Props) {
    return (
        <div className="expenses-table-card">
            <h3>Variable Expenses</h3>
            <div className="table-scroll">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Category</th>
                            <th>Monthly Budget</th>
                            <th>Spending</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.category}>
                                <td>{row.category}</td>
                                <td>{formatAmount(row.monthlyBudget)}</td>
                                <td className={row.overBudget ? 'over-budget' : undefined}>
                                    {formatAmount(row.spending)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
