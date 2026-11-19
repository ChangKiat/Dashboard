import { escapeHtml, note } from './pdfReport';

const image = (title: string, svg: string) => `<h2>${escapeHtml(title)}</h2><img alt="${escapeHtml(title)}" style="display:block;width:100%;height:auto" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}"/>`;

/** Keep every category in one chart; angle labels when the axis is crowded. */
export function categoryExpenseChart(points: { category: string; budget: number | null; expenses: number }[], money: (n: number) => string) {
    if (!points.length) return '<h2>Expense graph</h2>' + note('No expense categories for this period.');
    const max = Math.max(1, ...points.flatMap(p => [p.budget ?? 0, p.expenses])) * 1.2;
    const dense = points.length > 6;
    const height = dense ? 450 : 360;
    const group = points;
        const step = 570 / group.length;
        const x = (i: number) => 100 + step * (i + .5);
        const y = (n: number) => 235 - n / max * 170;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="688" height="${height}"><rect width="688" height="${height}" fill="white"/><rect x="190" y="14" width="12" height="12" fill="#5384df"/><text x="210" y="25" font-family="Arial" font-size="12">Budget</text><line x1="355" x2="380" y1="20" y2="20" stroke="#df5146" stroke-width="3"/><text x="390" y="25" font-family="Arial" font-size="12">Expenses</text>${[0,.25,.5,.75,1].map(f => `<line x1="100" x2="670" y1="${y(max*f)}" y2="${y(max*f)}" stroke="#dce4eb"/><text x="92" y="${y(max*f)+4}" text-anchor="end" font-family="Arial" font-size="10" fill="#52677b">${escapeHtml(money(max*f))}</text>`).join('')}${group.map((p,i) => `<rect x="${x(i)-Math.min(step*.3,30)}" y="${y(p.budget ?? 0)}" width="${Math.min(step*.6,60)}" height="${(p.budget ?? 0)/max*170}" rx="2" fill="#5384df"/>`).join('')}<polyline points="${group.map((p,i) => `${x(i)},${y(p.expenses)}`).join(' ')}" fill="none" stroke="#df5146" stroke-width="3"/>${group.map((p,i) => {
            // Wrap at word boundaries, including long single-word category names.
            const words = p.category.match(/.{1,14}(?:\s|$)|.{1,14}/g) ?? [p.category];
            return `<circle cx="${x(i)}" cy="${y(p.expenses)}" r="3" fill="#df5146"/><text x="${x(i)}" y="${y(p.expenses)-10}" text-anchor="${dense ? 'start' : 'middle'}" font-family="Arial" font-size="${dense ? 8 : 10}" fill="#b63632" ${dense ? `transform="rotate(-55 ${x(i)} ${y(p.expenses)-10})"` : ''}>${escapeHtml(money(p.expenses))}</text><text x="${x(i)}" y="255" text-anchor="${dense ? 'end' : 'middle'}" ${dense ? `transform="rotate(-55 ${x(i)} 255)"` : ''} font-family="Arial" font-size="${dense ? 10 : 11}" fill="#172b42">${words.map((word,j) => `<tspan x="${x(i)}" dy="${j ? 14 : 0}">${escapeHtml(word.trim())}</tspan>`).join('')}</text><text x="${x(i)}" y="${dense ? 425 : 335}" text-anchor="middle" font-family="Arial" font-size="${dense ? 8 : 10}" fill="#52677b">${p.budget == null ? 'No budget set' : escapeHtml(money(p.budget))}</text>`;
        }).join('')}</svg>`;
    return image('Expense graph', svg);
}

export function fixedExpensePie(points: { category: string; amount: number }[], money: (n: number) => string) {
    const positive = points.filter(p => p.amount > 0);
    const total = positive.reduce((sum,p) => sum+p.amount,0);
    if (!total) return '<h2>Fixed-expense plan breakdown</h2>' + note('No positive fixed-expense amounts configured.');
    const palette = ['#5384df','#f0c344','#55a685','#e38879','#7765bd','#63b6c6','#b2c966','#d78bba'];
    let angle = -Math.PI/2;
    const slices = positive.map((p,i) => {
        const end = angle + p.amount / total * Math.PI * 2;
        const sx = 180+135*Math.cos(angle), sy = 165+135*Math.sin(angle);
        const ex = 180+135*Math.cos(end), ey = 165+135*Math.sin(end);
        const color = palette[i%palette.length];
        const shape = positive.length === 1 ? `<circle cx="180" cy="165" r="135" fill="${color}"/>` : `<path d="M180,165 L${sx},${sy} A135,135 0 ${end-angle>Math.PI ? 1 : 0},1 ${ex},${ey} Z" fill="${color}" stroke="white" stroke-width="2"/>`;
        angle = end; return shape;
    }).join('');
    const legend = positive.map((p,i) => `<rect x="350" y="${28+i*34}" width="12" height="12" fill="${palette[i%palette.length]}"/><text x="370" y="${39+i*34}" font-family="Arial" font-size="12" fill="#172b42">${escapeHtml(p.category)}</text><text x="370" y="${53+i*34}" font-family="Arial" font-size="11" fill="#52677b">${escapeHtml(money(p.amount))} / ${(p.amount/total*100).toFixed(1)}%</text>`).join('');
    return image('Fixed-expense plan breakdown', `<svg xmlns="http://www.w3.org/2000/svg" width="688" height="${Math.max(320,positive.length*34+30)}"><rect width="100%" height="100%" fill="white"/>${slices}${legend}</svg>`) + note('Current configured fixed expenses, shown by category; these are planned amounts, not recorded payments.');
}
