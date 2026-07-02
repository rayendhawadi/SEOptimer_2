// Competitor comparison: audits the primary site + competitors, then builds a
// side-by-side scorecard with per-category winners and a gap analysis.

import { runAudit } from './audit.js';
import { generateComparison } from './ai.js';

export const COMPARE_CATEGORIES = [
  'onpage', 'content', 'links', 'usability', 'performance', 'social', 'security',
];

function toSite(res) {
  const s = res.scored;
  const host = (() => { try { return new URL(res.analysis.url).hostname.replace(/^www\./, ''); } catch { return res.analysis.url; } })();
  const psi = res.analysis.psi && (res.analysis.psi.mobile || res.analysis.psi.desktop);
  return {
    url: res.analysis.url,
    host,
    overall: s.overall,
    grade: s.overallGrade,
    categories: Object.fromEntries(
      Object.values(s.categories).map((c) => [c.key, { label: c.label, score: c.score, grade: c.grade }])
    ),
    screenshot: res.screenshots?.desktop || null,
    metrics: {
      pageKb: res.analysis.meta.pageKb,
      loadMs: res.analysis.meta.loadMs,
      words: res.analysis.meta.wordCount,
      readability: res.analysis.meta.readability,
      lighthouse: psi ? psi.scores.performance : null,
      https: res.analysis.meta.isHttps,
      brokenLinks: (res.analysis.site?.broken || []).length,
    },
  };
}

export async function runComparison(urls, { maxPages = 5, checkLinks = false, onProgress } = {}) {
  const sites = [];
  // Sequential to avoid spawning many headless Chrome instances at once.
  for (let i = 0; i < urls.length; i++) {
    if (onProgress) onProgress({ index: i, total: urls.length, url: urls[i] });
    try {
      const res = await runAudit(urls[i], { maxPages, render: true, checkLinks });
      sites.push(toSite(res));
    } catch (e) {
      sites.push({ url: urls[i], host: urls[i], error: e.message });
    }
  }

  const valid = sites.filter((s) => !s.error);

  // Winner per category + overall (highest score). Ties → first site.
  const winners = {};
  const best = (getScore) => {
    let bi = -1, bv = -1;
    valid.forEach((s) => {
      const idx = sites.indexOf(s);
      const v = getScore(s);
      if (v > bv) { bv = v; bi = idx; }
    });
    return bi;
  };
  winners.overall = best((s) => s.overall);
  for (const cat of COMPARE_CATEGORIES) {
    winners[cat] = best((s) => s.categories[cat]?.score ?? -1);
  }

  // Primary is index 0. Where does it lose, and to whom?
  const primary = sites[0];
  const gaps = [];
  if (primary && !primary.error) {
    for (const cat of COMPARE_CATEGORIES) {
      const mine = primary.categories[cat]?.score ?? 0;
      let bestRival = null, bestScore = mine;
      valid.forEach((s) => {
        if (s === primary) return;
        const v = s.categories[cat]?.score ?? 0;
        if (v > bestScore) { bestScore = v; bestRival = s; }
      });
      if (bestRival) {
        gaps.push({
          category: primary.categories[cat]?.label || cat,
          mine, theirs: bestScore, rival: bestRival.host, delta: bestScore - mine,
        });
      }
    }
    gaps.sort((a, b) => b.delta - a.delta);
  }

  let ai = { summary: '', recommendations: [] };
  try { ai = await generateComparison(sites); } catch {}

  return {
    sites,
    categories: COMPARE_CATEGORIES,
    winners,
    gaps,
    ai,
    primaryHost: primary?.host || '',
    generatedAt: new Date().toUTCString(),
  };
}
