// Accessibility audit (WCAG 2.1 AA), built on axe-core.
//
// Design goals:
//  1. Zero extra cost: runs inside the Puppeteer page that fetcher.js already
//     has open (renderWithChrome) — no new browser, no new request.
//  2. Never breaks the rest of the audit: every function here degrades to a
//     safe empty/null value instead of throwing.
//  3. Scope-honest: only the rendered page is audited (currently the
//     homepage — see crawler.js `isFirst`). The report surfaces that limit.
//  4. Honest scoring: axe "incomplete" results (things axe cannot decide
//     automatically) are reported as "needs review" (warn), not silent passes —
//     so a page rarely earns a perfect 100 it doesn't deserve.
//
// Public API:
//   runAxe(page)                      -> raw axe-core result | null
//   buildAccessibilityChecks(r, lang) -> array of check() objects, category 'accessibility'

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const tr = (lang, en, fr) => (lang === 'fr' ? fr : en);

// Report-facing accessibility checks. Each maps to one or more axe-core rules.
// This is a curated, expanded subset of axe-core's ~90 rules — the ones with
// clear SEO/legal relevance and low false-positive rates. Labels are bilingual.
const CHECK_MAP = {
  a11y_contrast: {
    label: { en: 'Color Contrast', fr: 'Contraste des couleurs' },
    rules: ['color-contrast'],
  },
  a11y_alt_text: {
    label: { en: 'Image Alt Text (WCAG)', fr: 'Texte alternatif des images (WCAG)' },
    rules: ['image-alt', 'input-image-alt', 'area-alt'],
  },
  a11y_heading_order: {
    label: { en: 'Heading Order (WCAG)', fr: 'Ordre des titres (WCAG)' },
    rules: ['heading-order', 'empty-heading', 'p-as-heading'],
  },
  a11y_form_labels: {
    label: { en: 'Form Labels', fr: 'Étiquettes de formulaire' },
    rules: ['label', 'select-name', 'form-field-multiple-labels', 'autocomplete-valid'],
  },
  a11y_accessible_names: {
    label: { en: 'Accessible Names (Links & Buttons)', fr: 'Noms accessibles (liens & boutons)' },
    rules: ['link-name', 'button-name'],
  },
  a11y_aria: {
    label: { en: 'ARIA Attributes', fr: 'Attributs ARIA' },
    rules: [
      'aria-valid-attr', 'aria-valid-attr-value', 'aria-required-attr',
      'aria-allowed-attr', 'aria-required-children', 'aria-required-parent',
      'aria-roles', 'aria-allowed-role', 'aria-command-name',
      'aria-input-field-name', 'aria-toggle-field-name', 'aria-hidden-focus',
      'aria-hidden-body',
    ],
  },
  a11y_lang: {
    label: { en: 'Page Language', fr: 'Langue de la page' },
    rules: ['html-has-lang', 'html-lang-valid', 'html-xml-lang-mismatch'],
  },
  a11y_page_title: {
    label: { en: 'Document Title (WCAG)', fr: 'Titre du document (WCAG)' },
    rules: ['document-title'],
  },
  // ---- expanded coverage --------------------------------------------------
  a11y_landmarks: {
    label: { en: 'Landmarks & Skip Links', fr: 'Repères & liens d’évitement' },
    rules: ['landmark-one-main', 'landmark-unique', 'region', 'bypass'],
  },
  a11y_lists: {
    label: { en: 'List Structure', fr: 'Structure des listes' },
    rules: ['list', 'listitem', 'definition-list', 'dlitem'],
  },
  a11y_tables: {
    label: { en: 'Data Tables', fr: 'Tableaux de données' },
    rules: ['td-headers-attr', 'th-has-data-cells', 'scope-attr-valid', 'td-has-header'],
  },
  a11y_frames: {
    label: { en: 'Frame Titles', fr: 'Titres des cadres (iframes)' },
    rules: ['frame-title', 'frame-title-unique'],
  },
  a11y_zoom: {
    label: { en: 'Zoom & Text Resize', fr: 'Zoom & redimensionnement du texte' },
    rules: ['meta-viewport'],
  },
  a11y_media_alt: {
    label: { en: 'Non-Text Content (SVG / media)', fr: 'Contenu non textuel (SVG / média)' },
    rules: ['role-img-alt', 'svg-img-alt', 'object-alt'],
  },
  a11y_ids: {
    label: { en: 'Unique IDs', fr: 'Identifiants uniques' },
    rules: ['duplicate-id-active', 'duplicate-id-aria'],
  },
  a11y_interactive: {
    label: { en: 'Interactive & Focus', fr: 'Éléments interactifs & focus' },
    rules: ['nested-interactive', 'scrollable-region-focusable', 'link-in-text-block', 'tabindex'],
  },
};

// Derive the flat rule list from CHECK_MAP so the two never drift apart.
const RULE_IDS = [...new Set(Object.values(CHECK_MAP).flatMap((d) => d.rules))];

const IMPACT_ORDER = ['minor', 'moderate', 'serious', 'critical'];

function worstImpact(impacts) {
  return impacts.reduce((worst, cur) => {
    if (!cur) return worst;
    if (!worst) return cur;
    return IMPACT_ORDER.indexOf(cur) > IMPACT_ORDER.indexOf(worst) ? cur : worst;
  }, null);
}

/**
 * Injects axe-core into an already-open Puppeteer page and runs it, restricted
 * to RULE_IDS. Intended to be called from fetcher.js's renderWithChrome(),
 * between page.content() and browser.close().
 *
 * Never throws — returns null on any failure (Chrome unavailable, axe-core
 * missing, page navigated away, etc.) so callers can degrade gracefully.
 *
 * @param {import('puppeteer').Page} page - an already-loaded Puppeteer page
 * @returns {Promise<object|null>} raw axe-core result, or null
 */
export async function runAxe(page) {
  try {
    const axePath = require.resolve('axe-core/axe.min.js');
    await page.addScriptTag({ path: axePath });
    const result = await page.evaluate((ruleIds) => {
      /* global axe */
      // Only run rules we actually know about in this axe build — passing an
      // unknown rule id to axe.run throws, so filter against axe.getRules().
      const known = new Set((axe.getRules ? axe.getRules() : []).map((r) => r.ruleId));
      const values = known.size ? ruleIds.filter((r) => known.has(r)) : ruleIds;
      return axe.run({ runOnly: { type: 'rule', values } });
    }, RULE_IDS);
    return result;
  } catch (err) {
    console.warn('[accessibility] axe-core run failed, skipping:', err.message);
    return null;
  }
}

/**
 * Turns a raw axe-core result into our standard check() objects
 * (category: 'accessibility').
 *
 * Status mapping:
 *   violation critical / serious -> fail
 *   violation moderate           -> warn
 *   violation minor only         -> pass (informational)
 *   no violation but "incomplete" (axe can't decide) -> warn (needs review)
 *   nothing at all               -> pass
 *
 * @param {object|null} axeResult - return value of runAxe(). If null
 *   (Chrome/axe unavailable), returns an empty array so the "Accessibility"
 *   category simply has no checks rather than a broken report.
 * @param {'en'|'fr'} [lang='fr']
 * @returns {Array<object>}
 */
export function buildAccessibilityChecks(axeResult, lang = 'fr') {
  if (!axeResult) return [];

  const byRule = (arr) => {
    const m = new Map();
    for (const v of arr || []) m.set(v.id, v);
    return m;
  };
  const violations = byRule(axeResult.violations);
  const incompletes = byRule(axeResult.incomplete);

  const noIssueVal = tr(lang, 'No issues found', 'Aucun problème détecté');
  const noIssueDetail = tr(lang,
    'axe-core found no automated violations for this check on the home page.',
    'axe-core n’a détecté aucune violation automatisée pour ce critère sur la page d’accueil.');

  const checks = [];
  for (const [checkId, def] of Object.entries(CHECK_MAP)) {
    const label = def.label[lang] || def.label.en;
    const vHits = def.rules.map((r) => violations.get(r)).filter(Boolean);
    const iHits = def.rules.map((r) => incompletes.get(r)).filter(Boolean);

    // 1) Real violations take precedence.
    if (vHits.length) {
      const nodeCount = vHits.reduce((n, h) => n + (h.nodes ? h.nodes.length : 0), 0);
      const impact = worstImpact(vHits.map((h) => h.impact));
      const status = impact === 'critical' || impact === 'serious' ? 'fail'
        : impact === 'moderate' ? 'warn' : 'pass';
      checks.push({
        category: 'accessibility', id: checkId, label, status,
        value: tr(lang,
          `${nodeCount} element(s) affected (${impact})`,
          `${nodeCount} élément(s) concerné(s) (${impact})`),
        detail: vHits.map((h) => h.help).join(' — '),
      });
      continue;
    }

    // 2) No violation, but axe couldn't decide -> needs manual review.
    if (iHits.length) {
      const nodeCount = iHits.reduce((n, h) => n + (h.nodes ? h.nodes.length : 0), 0);
      checks.push({
        category: 'accessibility', id: checkId, label, status: 'warn',
        value: tr(lang,
          `${nodeCount} element(s) need manual review`,
          `${nodeCount} élément(s) à vérifier manuellement`),
        detail: iHits.map((h) => h.help).join(' — ') + tr(lang,
          ' — axe-core could not verify this automatically; a manual check is recommended.',
          ' — axe-core n’a pas pu le vérifier automatiquement ; une vérification manuelle est recommandée.'),
      });
      continue;
    }

    // 3) Clean.
    checks.push({
      category: 'accessibility', id: checkId, label,
      status: 'pass', value: noIssueVal, detail: noIssueDetail,
    });
  }

  return checks;
}
