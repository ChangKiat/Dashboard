import type { PersonalRecord } from '../api';
import { formatCell } from '../utils/tableFormat';

interface Props {
    prs: PersonalRecord[];
}

export default function PersonalRecordsTable({ prs }: Props) {
    if (prs.length === 0) {
        return <p className="muted">No personal records yet — log exercises with weight to track PRs.</p>;
    }

    return (
        <div className="table-scroll">
            <table className="data-table">
                <thead>
                    <tr>
                        <th>Exercise</th>
                        <th>Max weight (kg)</th>
                        <th>Reps</th>
                        <th>Sets</th>
                        <th>Date</th>
                    </tr>
                </thead>
                <tbody>
                    {prs.map((pr) => (
                        <tr key={pr.exercise}>
                            <td>{pr.exercise}</td>
                            <td>{pr.weightKg}</td>
                            <td>{formatCell(pr.reps)}</td>
                            <td>{formatCell(pr.sets)}</td>
                            <td>{pr.date}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
