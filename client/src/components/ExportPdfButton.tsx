import { useState } from 'react';
import { useAmountVisibility } from '../hooks/useAmountVisibility';
import { reportHtml, type Report } from '../utils/pdfReport';

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
        // Reserve the window during the click, before asynchronous report loading.
        const preview = window.open('', '_blank');
        if (!preview) { setError('Allow pop-ups for this dashboard, then try again.'); return; }
        preview.opener = null;
        preview.document.body.textContent = 'Preparing report…';
        setBusy(true);
        try {
            const report = await build();
            if (preview.closed) return;
            preview.document.open();
            preview.document.write(reportHtml(report));
            preview.document.close();
            preview.document.getElementById('print-report')?.addEventListener('click', () => preview.print());
            await preview.document.fonts.ready;
            if (!preview.closed) { preview.focus(); preview.print(); }
        } catch (err) {
            preview.close();
            setError(err instanceof Error ? err.message : 'Could not prepare PDF. Please try again.');
        } finally { setBusy(false); }
    }
    return <div>
        <button type="button" className="btn btn-secondary" onClick={() => void exportReport()}
            disabled={disabled || busy || (sensitive && hidden)}
            title={sensitive && hidden ? 'Show amounts to export a financial report' : 'Open report and save as PDF from the print dialog'}>
            {busy ? 'Preparing PDF…' : label}
        </button>
        {error && <p className="error" role="alert">{error}</p>}
    </div>;
}
