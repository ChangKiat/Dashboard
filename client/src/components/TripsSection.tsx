import { useEffect, useState } from 'react';

import { fetchExpenseOverview } from '../api';
import { useFormatMYR } from '../hooks/useAmountVisibility';
import { currentMonthInKL } from '../hooks/useMonth';
import { useRefreshSignal } from '../hooks/useRefreshSignal';
import TripsPanel from './TripsPanel';

export default function TripsSection() {
    const formatMYR = useFormatMYR();
    const [variableCategories, setVariableCategories] = useState<string[]>([]);
    const [salaryAfterTax, setSalaryAfterTax] = useState<number | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        fetchExpenseOverview(currentMonthInKL())
            .then((overview) => {
                setVariableCategories(overview.variable.map((v) => v.category));
                setSalaryAfterTax(overview.salaryAfterTax);
            })
            .catch(() => {
                /* trips still work without categories or a salary */
            });
    }, []);

    useRefreshSignal(async () => setReloadKey((k) => k + 1));

    // A workday is 1/260 of a year's take-home pay (52 weeks × 5 days).
    const workdayValue = salaryAfterTax && salaryAfterTax > 0 ? (salaryAfterTax * 12) / 260 : null;

    return (
        <section className="panel">
            <TripsPanel
                variableCategories={variableCategories}
                formatAmount={formatMYR}
                reloadKey={reloadKey}
                workdayValue={workdayValue}
            />
        </section>
    );
}
