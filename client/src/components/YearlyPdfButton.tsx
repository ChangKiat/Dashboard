import { fetchMonthlyCashflow } from '../api';
import { useFormatMYR } from '../hooks/useAmountVisibility';
import { cashflowReport } from '../utils/dashboardReports';
import ExportPdfButton from './ExportPdfButton';

export default function YearlyPdfButton({ month, disabled = false }: { month: string; disabled?: boolean }) {
    const money = useFormatMYR();
    const year = month.slice(0, 4);
    return <ExportPdfButton sensitive disabled={disabled} label={`Export ${year} PDF`} build={async () => {
        const monthly = await fetchMonthlyCashflow(`${year}-12`, 12);
        return cashflowReport(year, monthly.series, money);
    }} />;
}
