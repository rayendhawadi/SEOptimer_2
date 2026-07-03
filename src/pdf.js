// Converts a report HTML string into a PDF buffer using headless Chrome.

import puppeteer from 'puppeteer';

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export async function htmlToPdf(html, { footer = 'AI Commandos · Atlas' } = {}) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    // Running footer: brand on the left, page numbers on the right (AI Commandos green).
    const footerTemplate = `
      <div style="width:100%;font-size:8px;font-family:Arial,sans-serif;color:#94a3b8;
        padding:0 10mm;display:flex;justify-content:space-between;align-items:center;">
        <span style="color:#0abe9f;font-weight:700;letter-spacing:.3px;">${esc(footer)}</span>
        <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
      </div>`;
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate,
      margin: { top: '12mm', bottom: '16mm', left: '8mm', right: '8mm' },
    });
    return pdf;
  } finally {
    await browser.close().catch(() => {});
  }
}
