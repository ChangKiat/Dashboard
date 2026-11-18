/** Print-native reports preserve Unicode text and searchable, paginated tables. */
export interface Report {
    title: string;
    subtitle: string;
    body: string;
}

export const escapeHtml = (value: unknown): string => String(value ?? '-').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function cards(items: [string, string | number][]) {
    return `<div class="cards">${items.map(([label, value]) => `<div class="card"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`).join('')}</div>`;
}

export function table(title: string, headers: string[], rows: unknown[][]) {
    const weights = headers.map((h) => /description/i.test(h) ? 3 : /exercise/i.test(h) ? 2.4 : /date/i.test(h) ? 1.3 : 1.1);
    const total = weights.reduce((a, b) => a + b, 0);
    const columns = `<colgroup>${weights.map((w) => `<col style="width:${w / total * 100}%">`).join('')}</colgroup>`;
    return `<h2>${escapeHtml(title)}</h2>${rows.length ? `<table>${columns}<thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="muted">No records for this period.</p>'}`;
}

/** Signed bars share an absolute scale; negative values remain explicitly labelled. */
export function bars(title: string, items: [string, number][], format: (n: number) => string) {
    const max = Math.max(1, ...items.map(([, n]) => Math.abs(n)));
    return `<h2>${escapeHtml(title)}</h2>${items.length ? items.map(([label, n]) => `<div class="bar-row"><div class="bar-label"><span>${escapeHtml(label)}</span><b>${escapeHtml(format(n))}</b></div><div class="track"><div class="bar${n < 0 ? ' negative' : ''}" style="width:${Math.abs(n) / max * 100}%"></div></div></div>`).join('') : '<p class="muted">No records for this period.</p>'}`;
}

export const note = (text: string) => `<p class="muted">${escapeHtml(text)}</p>`;

export function reportHtml(report: Report) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(report.title)} - ${escapeHtml(report.subtitle)}</title><style>
    @page { size: A4; margin: 16mm 14mm; @bottom-right { content: "Page " counter(page) " / " counter(pages); font: 9px Arial, sans-serif; color: #52677b; } }
    * { box-sizing: border-box; } body { font: 12px/1.5 Arial, sans-serif; color: #172b42; margin: 0 auto; max-width: 900px; padding: 28px; }
    h1 { font-size: 28px; margin: 0; } h2 { font-size: 17px; margin: 26px 0 12px; break-after: avoid; }
    header { border-bottom: 3px solid #087f8c; padding-bottom: 16px; margin-bottom: 20px; } .muted, small { color: #52677b; }
    .cards { display: flex; flex-wrap: wrap; gap: 10px; margin: 18px 0; } .card { flex: 1 1 140px; border: 1px solid #cbd8e2; border-top: 3px solid #087f8c; padding: 13px; break-inside: avoid; }
    small, strong { display: block; } strong { font-size: 20px; overflow-wrap: anywhere; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 18px; } th { background: #edf4f7; text-align: left; } th, td { border-bottom: 1px solid #dce4eb; padding: 8px 6px; vertical-align: top; overflow-wrap: anywhere; }
    thead { display: table-header-group; } tr, .bar-row { break-inside: avoid; } .bar-row { margin: 10px 0; } .bar-label { display: flex; justify-content: space-between; gap: 16px; } .track { background: #edf4f7; height: 8px; margin-top: 4px; } .bar { height: 8px; background: #087f8c; } .negative { background: #b44945; }
    .month { break-before: page; } button { cursor: pointer; padding: 10px 16px; background: #087f8c; color: white; border: 0; border-radius: 6px; } .controls { padding: 12px 0 24px; }
    footer { margin-top: 28px; border-top: 1px solid #cbd8e2; padding-top: 10px; color: #52677b; }
    @media print { body { padding: 0; max-width: none; } .controls { display: none; } * { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
    </style></head><body><div class="controls"><button id="print-report">Save as PDF / Print</button><p>Select “Save as PDF” in the print destination. Close this tab when finished.</p></div><header><small>PERSONAL DASHBOARD / REPORT</small><h1>${escapeHtml(report.title)}</h1><div>${escapeHtml(report.subtitle)}</div></header>${report.body}<footer>Generated ${escapeHtml(new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' }))} (Asia/Kuala_Lumpur)</footer></body></html>`;
}
