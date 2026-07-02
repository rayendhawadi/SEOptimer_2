// Orchestrates a full multi-page audit:
//   crawl -> aggregate (analyze pages, content, links) -> PageSpeed -> score -> AI.

import { crawl } from './crawler.js';
import { buildSite } from './site.js';
import { score } from './scoring.js';
import { generateRecommendations } from './ai.js';
import { fetchPageSpeed, psiChecks } from './psi.js';

function envBool(v, dflt) {
  if (v == null) return dflt;
  return /^(1|true|yes|on)$/i.test(String(v));
}

export async function runAudit(inputUrl, {
  maxPages = 20,
  render = true,
  checkLinks = true,
  usePsi,
  onProgress,
} = {}) {
  const crawlResult = await crawl(inputUrl, { maxPages, render, onProgress });
  if (!crawlResult.pages.length) {
    throw new Error('Could not fetch the URL.');
  }

  const analysis = await buildSite(crawlResult, { checkLinksEnabled: checkLinks });

  // --- Google PageSpeed Insights (real Lighthouse + Core Web Vitals) ---
  const wantPsi = usePsi != null ? usePsi : envBool(process.env.USE_PSI, true);
  if (wantPsi) {
    if (onProgress) onProgress({ phase: 'pagespeed', url: analysis.url });
    const apiKey = process.env.GOOGLE_PSI_API_KEY || '';
    const strategy = (process.env.PSI_STRATEGY || 'mobile').toLowerCase();
    try {
      if (strategy === 'both') {
        const [mobile, desktop] = await Promise.all([
          fetchPageSpeed(analysis.url, { strategy: 'mobile', apiKey }),
          fetchPageSpeed(analysis.url, { strategy: 'desktop', apiKey }),
        ]);
        analysis.psi = { mobile, desktop };
        const primary = mobile || desktop;
        if (primary) analysis.checks.push(...psiChecks(primary));
      } else {
        const psi = await fetchPageSpeed(analysis.url, { strategy, apiKey });
        if (psi) {
          analysis.psi = { [strategy]: psi };
          analysis.checks.push(...psiChecks(psi));
        }
      }
    } catch (e) {
      console.warn('[audit] PSI failed:', e.message);
    }
  }

  const scored = score(analysis);
  const ai = await generateRecommendations(analysis, scored);

  const home = crawlResult.pages.find((p) => p.render) || crawlResult.pages[0];

  return {
    analysis,
    scored,
    ai,
    screenshots: home?.render?.screenshots || null,
    generatedAt: new Date().toUTCString(),
  };
}
