import { useState } from 'react';
import { useAmountVisibility } from '../hooks/useAmountVisibility';
import type { Report } from '../utils/pdfReport';
import { downloadPdf } from '../utils/downloadPdf';

export default function ExportPdfButton({ build, disabled = false, sensitive = false, label = 'Export PDF' }: {
    build: () => Report | Promise<Report>;
    disabled?: boolean;
    sensitive?: boolean;
    label?: string;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { hidden } = useAmountVisibility();
    async function exportReport() {
        setError(null);
        setBusy(true);
        try {
            await downloadPdf(await build());
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not prepare PDF. Please try again.');
        } finally { setBusy(false); }
    }
    return <div className="export-pdf-control">
        <button type="button" className="btn-secondary export-pdf-button" onClick={() => void exportReport()}
            disabled={disabled || busy || (sensitive && hidden)}
            title={sensitive && hidden ? 'Show amounts to export a financial report' : 'Download PDF report'}>
            {busy ? 'Preparing PDF…' : label}
        </button>
        {error && <p className="error" role="alert">{error}</p>}
    </div>;
}
