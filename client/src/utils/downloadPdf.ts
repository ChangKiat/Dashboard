import { reportHtml, type Report } from './pdfReport';

/** Render one bounded A4 page at a time to avoid canvas size limits on long reports. */
export async function downloadPdf(report: Report) {
    const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:-12000px;top:0;width:794px;height:1123px;border:0';
    document.body.appendChild(frame);
    try {
        const doc = frame.contentDocument!;
        doc.open(); doc.write(reportHtml(report)); doc.close();
        doc.querySelector('.controls')?.remove();
        const generatedAt = doc.querySelector('footer')?.textContent ?? '';
        doc.querySelector('footer')?.remove();
        const style = doc.createElement('style');
        style.textContent = 'body{padding:0;width:688px;max-width:none;margin:0;background:white}.month{break-before:auto}.pdf-page{display:flow-root;width:688px;padding:0;background:white}';
        doc.head.appendChild(style);
        await doc.fonts.ready;
        await Promise.all([...doc.images].map(img => img.decode()));
        const source = [...doc.body.children];
        const pages: HTMLElement[] = [];
        let page!: HTMLElement;
        const newPage = () => { page = doc.createElement('div'); page.className = 'pdf-page'; doc.body.appendChild(page); pages.push(page); };
        source.forEach((e) => e.remove());
        newPage();
        const limit = 970;
        const append = (node: Element) => {
            page.appendChild(node);
            if (page.scrollHeight > limit && page.children.length > 1) { node.remove(); newPage(); page.appendChild(node); }
        };
        for (const node of source) {
            if (node.classList.contains('month') && page.children.length) newPage();
            if (node.tagName !== 'TABLE') { append(node); continue; }
            const rows = [...node.querySelectorAll('tbody tr')];
            let table: Element;
            let tbody: HTMLTableSectionElement;
            const startTable = () => {
                table = node.cloneNode(true) as Element;
                tbody = table.querySelector('tbody')!; tbody.replaceChildren(); page.appendChild(table);
            };
            startTable();
            for (const row of rows) {
                tbody!.appendChild(row);
                if (page.scrollHeight > limit && (tbody!.children.length > 1 || page.children.length > 1)) {
                    row.remove(); if (!tbody!.children.length) table!.remove();
                    newPage(); startTable(); tbody!.appendChild(row);
                }
            }
        }
        // Keep section titles with the following content.
        for (let i = 0; i < pages.length - 1; i++) {
            const last = pages[i].lastElementChild;
            if (last?.tagName === 'H2') pages[i + 1].prepend(last);
        }
        const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
        for (let i = 0; i < pages.length; i++) {
            const canvas = await html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff', logging: false, windowWidth: 794 });
            if (i) pdf.addPage();
            pdf.addImage(canvas, 'PNG', 14, 16, 182, canvas.height / canvas.width * 182, undefined, 'FAST');
            pdf.setFontSize(8); pdf.setTextColor(82, 103, 123); pdf.text(`Page ${i + 1} / ${pages.length}`, 182, 288);
            pdf.setFontSize(7); pdf.text(generatedAt, 14, 288);
        }
        pdf.save(`${report.title}-${report.subtitle}`.replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 140) + '.pdf');
    } finally { frame.remove(); }
}
