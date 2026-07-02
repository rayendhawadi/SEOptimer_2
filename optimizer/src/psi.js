// Google PageSpeed Insights client — real Lighthouse scores + Core Web Vitals.
// Works without an API key at low volume; a key raises the quota.
// Docs: https://developers.google.com/speed/docs/insights/v5/get-started

const ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

// Google's official Core Web Vitals thresholds.
const THRESHOLDS = {
  LCP: { good: 2500, ni: 4000, unit: 'ms' },   // Largest Contentful Paint
  INP: { good: 200, ni: 500, unit: 'ms' },     // Interaction to Next Paint
  CLS: { good: 0.1, ni: 0.25, unit: '' },      // Cumulative Layout Shift
  FCP: { good: 1800, ni: 3000, unit: 'ms' },   // First Contentful Paint
  TBT: { good: 200, ni: 600, unit: 'ms' },     // Total Blocking Time (lab only)
};

export function rate(metric, value) {
  const t = THRESHOLDS[metric];
  if (!t || value == null) return 'unknown';
  if (value <= t.good) return 'good';
  if (value <= t.ni) return 'needs-improvement';
  return 'poor';
}

function pct(score) { return score == null ? null : Math.round(score * 100); }

/**
 * @returns null on failure, otherwise:
 *  { strategy, scores:{performance,seo,accessibility,bestPractices},
 *    lab:{LCP,FCP,CLS,TBT,SI,TTI}, field:{LCP,INP,CLS,FCP,overall}|null, opportunities:[] }
 */
export async function fetchPageSpeed(url, { strategy = 'mobile', apiKey = '', timeout = 60000 } = {}) {
  const params = new URLSearchParams({ url, strategy });
  for (const c of ['PERFORMANCE', 'SEO', 'ACCESSIBILITY', 'BEST_PRACTICES']) params.append('category', c);
  if (apiKey) params.set('key', apiKey);

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${ENDPOINT}?${params}`, { signal: controller.signal });
    if (!res.ok) {
      const body = await res.text();
      console.warn(`[psi] ${strategy} ${res.status}: ${body.slice(0, 180)}`);
      return null;
    }
    const data = await res.json();
    const lr = data.lighthouseResult || {};
    const cats = lr.categories || {};
    const a = lr.audits || {};

    const num = (id) => a[id]?.numericValue;
    const disp = (id) => a[id]?.displayValue;

    const lab = {
      LCP: num('largest-contentful-paint'),
      FCP: num('first-contentful-paint'),
      CLS: num('cumulative-layout-shift'),
      TBT: num('total-blocking-time'),
      SI: num('speed-index'),
      TTI: num('interactive'),
      display: {
        LCP: disp('largest-contentful-paint'),
        FCP: disp('first-contentful-paint'),
        CLS: disp('cumulative-layout-shift'),
        TBT: disp('total-blocking-time'),
        SI: disp('speed-index'),
        TTI: disp('interactive'),
      },
    };

    // Field data (CrUX) — real-world 28-day data, if Google has enough samples.
    let field = null;
    const le = data.loadingExperience?.metrics;
    if (le) {
      field = {
        overall: data.loadingExperience.overall_category,
        LCP: le.LARGEST_CONTENTFUL_PAINT_MS?.percentile,
        INP: (le.INTERACTION_TO_NEXT_PAINT || le.EXPERIMENTAL_INTERACTION_TO_NEXT_PAINT)?.percentile,
        CLS: le.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile != null
          ? le.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 : null,
        FCP: le.FIRST_CONTENTFUL_PAINT_MS?.percentile,
      };
    }

    // Top opportunities (potential savings) from Lighthouse.
    const opportunities = Object.values(a)
      .filter((x) => x.details?.type === 'opportunity' && (x.numericValue || 0) > 50)
      .sort((x, y) => (y.numericValue || 0) - (x.numericValue || 0))
      .slice(0, 6)
      .map((x) => ({ title: x.title, savingsMs: Math.round(x.numericValue || 0) }));

    // Failing audits per Lighthouse category (deeper, specific issues).
    const cleanDesc = (d) => (d || '').replace(/\s*\[[^\]]*\]\([^)]*\)/g, '').replace(/\s+/g, ' ').trim().slice(0, 180);
    const categoryIssues = (catKey) => (cats[catKey]?.auditRefs || [])
      .map((r) => a[r.id])
      .filter((x) => x && x.score !== null && x.score < 0.9 &&
        x.scoreDisplayMode !== 'notApplicable' && x.scoreDisplayMode !== 'informative' &&
        x.scoreDisplayMode !== 'manual')
      .map((x) => ({ title: x.title, description: cleanDesc(x.description) }))
      .slice(0, 8);
    const issues = {
      accessibility: categoryIssues('accessibility'),
      bestPractices: categoryIssues('best-practices'),
      seo: categoryIssues('seo'),
    };

    return {
      strategy,
      scores: {
        performance: pct(cats.performance?.score),
        seo: pct(cats.seo?.score),
        accessibility: pct(cats.accessibility?.score),
        bestPractices: pct(cats['best-practices']?.score),
      },
      lab,
      field,
      opportunities,
      issues,
    };
  } catch (e) {
    console.warn('[psi] request failed:', e.name === 'AbortError' ? 'timeout' : e.message);
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Build performance checks from PSI results (uses field data when available, else lab). */
export function psiChecks(psi) {
  const checks = [];
  const src = psi.field && psi.field.LCP != null ? psi.field : psi.lab;
  const origin = psi.field && psi.field.LCP != null ? 'field (real users)' : 'lab';
  const mk = (id, label, metric, value, fmt) => {
    if (value == null) return;
    const r = rate(metric, value);
    const status = r === 'good' ? 'pass' : r === 'needs-improvement' ? 'warn' : 'fail';
    checks.push({
      category: 'performance', id, label,
      status, value: `${fmt(value)} — ${r} (${origin})`,
      detail: `Core Web Vital. Google targets ${metric === 'CLS'
        ? '< 0.1' : '< ' + THRESHOLDS[metric].good + ' ms'} for "good".`,
    });
  };

  mk('cwv_lcp', 'Largest Contentful Paint (LCP)', 'LCP', src.LCP, (v) => (v / 1000).toFixed(2) + ' s');
  mk('cwv_cls', 'Cumulative Layout Shift (CLS)', 'CLS', src.CLS, (v) => v.toFixed(3));
  if (src.INP != null) mk('cwv_inp', 'Interaction to Next Paint (INP)', 'INP', src.INP, (v) => Math.round(v) + ' ms');
  else mk('cwv_fcp', 'First Contentful Paint (FCP)', 'FCP', src.FCP, (v) => (v / 1000).toFixed(2) + ' s');

  // Lighthouse performance score as an informational check.
  if (psi.scores.performance != null) {
    const s = psi.scores.performance;
    checks.push({
      category: 'performance', id: 'lighthouse_perf', label: 'Lighthouse Performance Score',
      status: s >= 90 ? 'pass' : s >= 50 ? 'warn' : 'fail',
      value: `${s}/100 (${psi.strategy})`,
      detail: 'Google Lighthouse lab performance score.',
    });
  }
  return checks;
}
