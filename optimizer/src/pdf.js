// Converts a report HTML string into a PDF buffer using headless Chrome.

import puppeteer from 'puppeteer';

export async function htmlToPdf(html) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', bottom: '12mm', left: '8mm', right: '8mm' },
    });
    return pdf;
  } finally {
    await browser.close().catch(() => {});
  }
}
