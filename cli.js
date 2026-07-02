// Command-line usage:
//   node cli.js https://example.com               -> prints score summary
//   node cli.js https://example.com report.pdf    -> also saves a PDF report

import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { runAudit } from './src/audit.js';
import { renderReport } from './src/report.js';
import { htmlToPdf } from './src/pdf.js';

const [, , url, pdfPath, pagesArg] = process.argv;

if (!url) {
  console.error('Usage: node cli.js <url> [output.pdf] [maxPages]');
  process.exit(1);
}

const maxPages = Math.min(Math.max(parseInt(pagesArg, 10) || 20, 1), 50);
console.log(`\nAuditing ${url}  (crawling up to ${maxPages} pages) …\n`);
const result = await runAudit(url, {
  render: true,
  checkLinks: true,
  maxPages,
  onProgress: ({ crawled, total, url, phase }) =>
    process.stdout.write((phase === 'pagespeed'
      ? `\r  running Google PageSpeed (this can take 20-40s)…`
      : `\r  crawling ${crawled}/${total}: ${String(url).slice(0, 60)}`).padEnd(80)),
});
process.stdout.write('\r'.padEnd(82) + '\r');
const { analysis, scored, ai } = result;

console.log(`URL:     ${analysis.url}`);
console.log(`Overall: ${scored.overall}/100  (Grade ${scored.overallGrade})\n`);
for (const c of Object.values(scored.categories)) {
  console.log(
    `  ${c.label.padEnd(22)} ${String(c.score).padStart(3)}/100  (${c.grade})  ` +
    `✓${c.counts.pass} !${c.counts.warn} ✗${c.counts.fail}`
  );
}
console.log(`\nSummary: ${ai.executiveSummary}\n`);
if (ai.quickWins?.length) {
  console.log('Quick wins:');
  ai.quickWins.forEach((q) => console.log('  • ' + q));
  console.log('');
}

if (pdfPath) {
  const html = renderReport(result);
  const pdf = await htmlToPdf(html);
  await writeFile(pdfPath, pdf);
  console.log(`PDF saved → ${pdfPath}\n`);
}
// Let the event loop drain so Chrome subprocesses close cleanly (avoids a
// libuv teardown assertion on Windows from a forced process.exit).
