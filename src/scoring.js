// Turns the list of checks into per-category scores (0-100), letter grades,
// and an overall score — similar to SEOptimer's A-F grading.

// Some checks are informational only (always "pass" / neutral) and should not
// drag scores. We give them weight 0.
const ZERO_WEIGHT = new Set([
  'headings', 'keywords', 'links', 'server', 'technology', 'nofollow',
]);

// Importance weight per check id (default 1). Higher = more impact on score.
const WEIGHTS = {
  // On-Page
  title: 3, meta_description: 3, h1: 2, image_alt: 2, broken_images: 3,
  canonical: 1, schema: 1, robots: 3, analytics: 1,
  dup_titles: 2, dup_descs: 1, missing_meta: 2,
  robots_txt: 1, sitemap: 1, friendly_urls: 1,
  // Content Quality
  readability: 3, word_count: 2, sentence_length: 1, keyword_density: 2,
  heading_structure: 2, text_ratio: 1, thin_pages: 2,
  // Links
  broken_links: 4, internal_links: 2, anchor_text: 1, empty_anchors: 1,
  // Usability
  viewport: 3, mobile_consistency: 3, favicon: 1, lang: 1, charset: 1, dom_size: 1,
  email_privacy: 1, flash: 2, iframes: 1, deprecated_html: 1,
  // Performance
  page_size: 2, requests: 1, load_time: 3, fcp: 2, compression: 2,
  caching: 1, inline_styles: 1, image_optimization: 2, image_format: 1, minification: 1,
  render_blocking: 2, cdn: 1,
  // Core Web Vitals (Google PageSpeed) — heavily weighted, they're ranking factors
  cwv_lcp: 4, cwv_cls: 3, cwv_inp: 3, cwv_fcp: 2, lighthouse_perf: 3,
  // Social
  open_graph: 2, twitter_card: 1, social_links: 1,
  // Security
  https: 4, hsts: 1, clickjacking: 1, content_type_options: 1,
  mixed_content: 3, jquery_version: 1, cookie_consent: 3, ssl_expiry: 4,
  exposed_files: 4,
  // Accessibility (WCAG 2.1 AA via axe-core)
  a11y_contrast: 3, a11y_alt_text: 2, a11y_heading_order: 2,
  a11y_form_labels: 3, a11y_accessible_names: 2, a11y_aria: 2,
  a11y_lang: 1, a11y_page_title: 1,
};

const STATUS_SCORE = { pass: 1, warn: 0.5, fail: 0 };

export function score(analysis) {
  const byCat = {};
  for (const c of analysis.checks) {
    const w = ZERO_WEIGHT.has(c.id) ? 0 : (WEIGHTS[c.id] ?? 1);
    if (!byCat[c.category]) byCat[c.category] = { sum: 0, max: 0, checks: [] };
    byCat[c.category].checks.push(c);
    if (w === 0) continue;
    byCat[c.category].sum += STATUS_SCORE[c.status] * w;
    byCat[c.category].max += w;
  }

  const categories = {};
  let overallSum = 0, overallMax = 0;
  for (const [cat, d] of Object.entries(byCat)) {
    const pct = d.max ? Math.round((d.sum / d.max) * 100) : 100;
    categories[cat] = {
      key: cat,
      label: analysis.categories[cat] || cat,
      score: pct,
      grade: grade(pct),
      checks: d.checks,
      counts: countStatuses(d.checks),
    };
    overallSum += d.sum;
    overallMax += d.max;
  }

  const overall = overallMax ? Math.round((overallSum / overallMax) * 100) : 0;

  return {
    overall,
    overallGrade: grade(overall),
    categories,
  };
}

function countStatuses(checks) {
  const c = { pass: 0, warn: 0, fail: 0 };
  for (const ch of checks) if (c[ch.status] != null) c[ch.status]++;
  return c;
}

export function grade(pct) {
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B';
  if (pct >= 60) return 'C';
  if (pct >= 50) return 'D';
  if (pct >= 35) return 'E';
  return 'F';
}