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
    const palette = ['#167d8d', '#6656be', '#c36a26', '#3275b5', '#ad487f', '#50842e'];
    const seriesColor = /income/i.test(title) ? '#23835e' : /monthly spending/i.test(title) ? '#c36a26' : /net cashflow/i.test(title) ? '#6656be' : null;
    return `<h2>${escapeHtml(title)}</h2>${items.length ? items.map(([label, n], index) => `<div class="bar-row"><div class="bar-label"><span>${escapeHtml(label)}</span><b>${escapeHtml(format(n))}</b></div><div class="track"><div class="bar" style="width:${Math.abs(n) / max * 100}%;background:${n < 0 ? '#c24455' : seriesColor ?? palette[index % palette.length]}"></div></div></div>`).join('') : '<p class="muted">No records for this period.</p>'}`;
}

export const note = (text: string) => `<p class="muted">${escapeHtml(text)}</p>`;

/** Paired bars keep every category label and exact value visible. */
export function comparisonBars(title: string, points: { label: string; first: number; second: number | null }[], firstLabel: string, secondLabel: string, format: (n: number) => string) {
    const max = Math.max(1, ...points.flatMap(p => [Math.abs(p.first), Math.abs(p.second ?? 0)]));
    return `<h2>${escapeHtml(title)}</h2>${points.length ? points.map(p => `<div class="bar-row"><b>${escapeHtml(p.label)}</b>${[[firstLabel, p.first, '#167d8d'], [secondLabel, p.second, '#c36a26']].map(([label, value, color]) => `<div class="bar-label"><span>${escapeHtml(label)}</span><b>${value == null ? 'Not configured' : escapeHtml(format(Number(value)))}</b></div><div class="track"><div class="bar" style="width:${Math.abs(Number(value ?? 0)) / max * 100}%;background:${color}"></div></div>`).join('')}</div>`).join('') : '<p class="muted">No records for this period.</p>'}`;
}

export function reportHtml(report: Report) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(report.title)} - ${escapeHtml(report.subtitle)}</title><style>
    @page { size: A4; margin: 16mm 14mm; @bottom-right { content: "Page " counter(page) " / " counter(pages); font: 9px Arial, sans-serif; color: #52677b; } }
    * { box-sizing: border-box; } body { font: 12px/1.5 Arial, sans-serif; color: #172b42; margin: 0 auto; max-width: 900px; padding: 28px; }
    h1 { font-size: 28px; margin: 6px 0; line-height: 1.25; } h2 { font-size: 17px; margin: 16px 0 8px; padding: 6px 12px; color: #344978; background: #eef0fb; border-left: 4px solid #7763c5; border-radius: 0 7px 7px 0; break-after: avoid; }
    header { color: #fff; background: linear-gradient(115deg, #194f78, #167d8d 65%, #6656be); border-bottom: 5px solid #f0b85b; border-radius: 12px; padding: 20px; margin-bottom: 20px; break-inside: avoid; } header small { color: #e0f5ff; letter-spacing: 1.6px; font-weight: 700; font-size: 10px; } header div { color: #eefaff; } .muted, small { color: #52677b; }
    .cards { display: flex; flex-wrap: wrap; gap: 10px; margin: 14px 0; } .card { flex: 1 1 140px; border: 1px solid #b9dcd5; border-top: 4px solid #23835e; background: #edf8f2; color: #176344; border-radius: 8px; padding: 11px; break-inside: avoid; }
    .card:nth-child(4n+2) { background: #fff3e7; border-color: #efd0ae; border-top-color: #c36a26; color: #99501c; }
    .card:nth-child(4n+3) { background: #f2effc; border-color: #d4caee; border-top-color: #7763c5; color: #554197; }
    .card:nth-child(4n+4) { background: #edf5fd; border-color: #c4daf0; border-top-color: #3275b5; color: #245e95; }
    .card small { color: inherit; font-weight: 700; margin-bottom: 6px; }
    small, strong { display: block; } strong { font-size: 20px; overflow-wrap: anywhere; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 18px; } th { background: #245a7a; color: #fff; text-align: left; } tbody tr:nth-child(even) { background: #eff6fa; } th, td { border-bottom: 1px solid #dce4eb; padding: 7px 6px; vertical-align: top; overflow-wrap: anywhere; }
    thead { display: table-header-group; } tr, .bar-row { break-inside: avoid; } .bar-row { margin: 10px 0; } .bar-label { display: flex; justify-content: space-between; gap: 16px; } .track { background: #edf4f7; height: 8px; margin-top: 4px; } .bar { height: 8px; background: #087f8c; } .negative { background: #b44945; }
    .month { break-before: page; } button { cursor: pointer; padding: 10px 16px; background: #087f8c; color: white; border: 0; border-radius: 6px; } .controls { padding: 12px 0 24px; }
    .track, .bar { border-radius: 5px; } .bar-label b { color: #344978; }
    footer { margin-top: 16px; border-top: 3px solid #76bdc5; padding: 12px; background: #eff7f9; border-radius: 0 0 8px 8px; color: #52677b; }
    @media print { body { padding: 0; max-width: none; } .controls { display: none; } * { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
    </style></head><body><div class="controls"><button id="print-report">Save as PDF / Print</button><p>Select “Save as PDF” in the print destination. Close this tab when finished.</p></div><header><small>PERSONAL DASHBOARD / REPORT</small><h1>${escapeHtml(report.title)}</h1><div>${escapeHtml(report.subtitle)}</div></header>${report.body}<footer>Generated ${escapeHtml(new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' }))} (Asia/Kuala_Lumpur)</footer></body></html>`;
}

export function comboChart(title: string, points: { label: string; actual: number; target: number }[], actualLabel = 'Expenses', targetLabel = 'Budget') {
    if (!points.length) return `<h2>${escapeHtml(title)}</h2><p class="muted">No records for this period.</p>`;
    const max = Math.max(1,...points.flatMap(p=>[p.actual,p.target]));
    const step=600/points.length, x=(i:number)=>65+step*(i+.5), y=(n:number)=>205-n/max*160;
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="688" height="280"><rect width="688" height="280" fill="white"/>${[0,.5,1].map(f=>`<line x1="65" x2="665" y1="${y(max*f)}" y2="${y(max*f)}" stroke="#dce4eb"/><text x="58" y="${y(max*f)+4}" text-anchor="end" font-family="Arial" font-size="11" fill="#52677b">${Math.round(max*f)}</text>`).join('')}${points.map((p,i)=>`<rect x="${x(i)-step*.27}" y="${y(p.actual)}" width="${step*.54}" height="${Math.max(0,p.actual/max*160)}" fill="#167d8d"/>${i%Math.max(1,Math.ceil(points.length/12))===0?`<text x="${x(i)}" y="225" text-anchor="middle" font-family="Arial" font-size="10">${escapeHtml(p.label)}</text>`:''}`).join('')}<polyline points="${points.length === 1 ? `65,${y(points[0].target)} 665,${y(points[0].target)}` : points.map((p,i)=>`${x(i)},${y(p.target)}`).join(' ')}" fill="none" stroke="#c36a26" stroke-width="3"/><rect x="150" y="250" width="12" height="12" fill="#167d8d"/><text x="170" y="261" font-family="Arial" font-size="12">${escapeHtml(actualLabel)}</text><line x1="370" x2="390" y1="256" y2="256" stroke="#c36a26" stroke-width="3"/><text x="400" y="261" font-family="Arial" font-size="12">${escapeHtml(targetLabel)}</text></svg>`;
    return `<h2>${escapeHtml(title)}</h2><img alt="${escapeHtml(title)}" style="display:block;width:100%;height:auto" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}"/>`;
}

export function columnChart(title: string, points: { label: string; first: number; second: number }[], firstLabel: string, secondLabel: string) {
    if (!points.length) return `<h2>${escapeHtml(title)}</h2><p class="muted">No records for this period.</p>`;
    const max = Math.max(1, ...points.flatMap(p => [p.first, p.second]));
    const step = 600 / points.length;
    const y = (n: number) => 205 - n / max * 160;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="688" height="280"><rect width="688" height="280" fill="white"/>${[0,.5,1].map(f=>`<line x1="65" x2="665" y1="${y(max*f)}" y2="${y(max*f)}" stroke="#dce4eb"/><text x="58" y="${y(max*f)+4}" text-anchor="end" font-family="Arial" font-size="11" fill="#52677b">${Math.round(max*f).toLocaleString('en-MY')}</text>`).join('')}${points.map((p,i)=>{
        const x = 65 + step * (i + .5);
        return `<rect x="${x-step*.35}" y="${y(p.first)}" width="${step*.3}" height="${p.first/max*160}" fill="#23835e"/><rect x="${x+step*.05}" y="${y(p.second)}" width="${step*.3}" height="${p.second/max*160}" fill="#c36a26"/><text x="${x}" y="225" text-anchor="middle" font-family="Arial" font-size="11">${escapeHtml(p.label)}</text>`;
    }).join('')}<rect x="150" y="250" width="12" height="12" fill="#23835e"/><text x="170" y="261" font-family="Arial" font-size="12">${escapeHtml(firstLabel)}</text><rect x="370" y="250" width="12" height="12" fill="#c36a26"/><text x="390" y="261" font-family="Arial" font-size="12">${escapeHtml(secondLabel)}</text></svg>`;
    return `<h2>${escapeHtml(title)}</h2><img alt="${escapeHtml(title)}" style="display:block;width:100%;height:auto" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}"/>`;
}
