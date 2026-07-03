import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAudit } from './src/audit.js';
import { renderReport } from './src/report.js';
import { htmlToPdf } from './src/pdf.js';
import { runComparison } from './src/compare.js';
import { renderComparison } from './src/compareReport.js';
import { getBrand } from './src/config.js';
import { addEntry, getHistory } from './src/history.js';
import { normalizeLang } from './src/i18n.js';

// Report language: per-request (body/query) → env default → French.
const reqLang = (req) => normalizeLang(
  req.body?.lang || req.query?.lang || process.env.REPORT_LANG);

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Simple in-memory cache of the last audits so /pdf can reuse the result.
const cache = new Map();
const compareCache = new Map();
const cacheKey = (url) => url.toLowerCase().replace(/\/+$/, '');

// JSON API: run an audit and return structured data + rendered report HTML.
// Crawl the site automatically up to this many pages — a sensible cap so large
// sites still finish in reasonable time. Not user-selectable.
const DEFAULT_MAX_PAGES = 30;

app.post('/api/audit', async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Missing "url".' });
  const lang = reqLang(req);
  try {
    const result = await runAudit(url, { render: true, checkLinks: true, maxPages: DEFAULT_MAX_PAGES, lang });

    // Score history: read prior entries (for the trend), then record this one.
    const host = hostOf(result.analysis.url);
    const history = getHistory(host);
    addEntry({
      host, url: result.analysis.url, ts: Date.now(),
      overall: result.scored.overall, grade: result.scored.overallGrade,
      categories: Object.fromEntries(Object.values(result.scored.categories).map((c) => [c.key, c.score])),
    });
    result.history = history;
    result.brand = getBrand();

    cache.set(cacheKey(result.analysis.url), result);
    cache.set(cacheKey(url), result);
    const reportHtml = renderReport(result);
    res.json({
      url: result.analysis.url,
      overall: result.scored.overall,
      grade: result.scored.overallGrade,
      categories: Object.values(result.scored.categories).map((c) => ({
        key: c.key, label: c.label, score: c.score, grade: c.grade, counts: c.counts,
      })),
      ai: result.ai,
      reportHtml,
    });
  } catch (err) {
    console.error('[audit] error:', err);
    res.status(500).json({ error: err.message || 'Audit failed.' });
  }
});

// Download the report as a PDF. Re-runs the audit if not cached.
app.get('/api/pdf', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('Missing url');
  try {
    let result = cache.get(cacheKey(url));
    if (!result) {
      result = await runAudit(url, { render: true, lang: reqLang(req) });
      result.history = getHistory(hostOf(result.analysis.url));
      cache.set(cacheKey(result.analysis.url), result);
    }
    result.brand = result.brand || getBrand();
    const html = renderReport(result); // result.lang carries the audited language
    const pdf = await htmlToPdf(html, { footer: `${result.brand.name} · ${result.brand.agent || 'Atlas'}` });
    const host = new URL(result.analysis.url).hostname.replace(/^www\./, '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename="seo-report-${host}.pdf"`);
    res.end(pdf);
  } catch (err) {
    console.error('[pdf] error:', err);
    res.status(500).send('Could not generate PDF: ' + err.message);
  }
});

// Competitor comparison: audit your site + competitors side by side.
app.post('/api/compare', async (req, res) => {
  const { url, competitors } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Missing "url".' });
  const list = [url, ...(Array.isArray(competitors) ? competitors : [])]
    .map((u) => String(u || '').trim())
    .filter(Boolean)
    .slice(0, 4);
  if (list.length < 2) return res.status(400).json({ error: 'Add at least one competitor URL.' });
  const lang = reqLang(req);
  try {
    // Lighter per-site crawl so N audits finish in reasonable time.
    const cmp = await runComparison(list, { maxPages: 5, checkLinks: false, lang });
    compareCache.set(cacheKey(cmp.sites[0].url || url), cmp);
    compareCache.set(cacheKey(url), cmp);
    res.json({
      primaryHost: cmp.primaryHost,
      sites: cmp.sites.map((s) => ({ host: s.host, url: s.url, overall: s.overall, grade: s.grade, error: s.error })),
      winners: cmp.winners,
      reportHtml: renderComparison(cmp, { brand: getBrand(), lang }),
    });
  } catch (err) {
    console.error('[compare] error:', err);
    res.status(500).json({ error: err.message || 'Comparison failed.' });
  }
});

app.get('/api/compare-pdf', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('Missing url');
  try {
    let cmp = compareCache.get(cacheKey(url));
    if (!cmp) return res.status(404).send('Run the comparison first, then download.');
    const cmpBrand = getBrand();
    const pdf = await htmlToPdf(renderComparison(cmp, { brand: cmpBrand, lang: cmp.lang }),
      { footer: `${cmpBrand.name} · ${cmpBrand.agent || 'Atlas'}` });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="seo-comparison-${cmp.primaryHost}.pdf"`);
    res.end(pdf);
  } catch (err) {
    console.error('[compare-pdf] error:', err);
    res.status(500).send('Could not generate PDF: ' + err.message);
  }
});

// Export raw audit data as JSON or CSV.
app.get('/api/export', async (req, res) => {
  const url = req.query.url;
  const format = (req.query.format || 'json').toLowerCase();
  if (!url) return res.status(400).send('Missing url');
  const result = cache.get(cacheKey(url));
  if (!result) return res.status(404).send('Run the audit first, then export.');

  const host = hostOf(result.analysis.url);
  if (format === 'csv') {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Category', 'Check', 'Status', 'Value', 'Detail']];
    for (const c of result.analysis.checks) {
      rows.push([result.analysis.categories[c.category] || c.category, c.label, c.status, c.value, c.detail]);
    }
    const csv = rows.map((r) => r.map(esc).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="seo-audit-${host}.csv"`);
    return res.end(csv);
  }

  const data = {
    url: result.analysis.url,
    generatedAt: result.generatedAt,
    overall: result.scored.overall,
    grade: result.scored.overallGrade,
    categories: Object.values(result.scored.categories).map((c) => ({
      key: c.key, label: c.label, score: c.score, grade: c.grade, counts: c.counts,
    })),
    checks: result.analysis.checks,
    meta: result.analysis.meta,
    site: { ...result.analysis.site, summaries: result.analysis.site?.summaries?.map((s) => ({ ...s, links: undefined })) },
    pageSpeed: result.analysis.psi || null,
    recommendations: result.ai?.recommendations || [],
  };
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="seo-audit-${host}.json"`);
  res.end(JSON.stringify(data, null, 2));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  SEO Optimizer running →  http://localhost:${PORT}\n`);
});
