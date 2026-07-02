// Accessibility audit (WCAG 2.1 AA), built on axe-core.
//
// Design goals:
//  1. Zero extra cost: runs inside the Puppeteer page that fetcher.js already
//     has open (renderWithChrome) — no new browser, no new request.
//  2. Never breaks the rest of the audit: every function here degrades to a
//     safe empty/null value instead of throwing.
//  3. Scope-honest: only the rendered page is audited (currently the
//     homepage — see crawler.js `isFirst`). Callers should surface that
//     limitation in the report UI.
//
// Public API:
//   runAxe(page)                -> raw axe-core result | null
//   buildAccessibilityChecks(r) -> array of check() objects, category 'accessibility'

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// A focused subset of axe-core's ~90 rules: the ones with the clearest
// SEO/legal relevance and the lowest false-positive rate. Keeping this list
// explicit (rather than running the full rule set) keeps report noise down
// and keeps the 8 checks below stable and predictable.
const RULE_IDS = [
    'color-contrast',
    'image-alt',
    'heading-order',
    'label',
    'link-name',
    'button-name',
    'aria-valid-attr',
    'aria-valid-attr-value',
    'aria-required-attr',
    'html-has-lang',
    'html-lang-valid',
    'document-title',
];

// Maps each axe-core rule to one of our 8 report-facing checks.
const CHECK_MAP = {
    a11y_contrast: {
        label: 'Color Contrast',
        rules: ['color-contrast'],
    },
    a11y_alt_text: {
        label: 'Image Alt Text (WCAG)',
        rules: ['image-alt'],
    },
    a11y_heading_order: {
        label: 'Heading Order (WCAG)',
        rules: ['heading-order'],
    },
    a11y_form_labels: {
        label: 'Form Labels',
        rules: ['label'],
    },
    a11y_accessible_names: {
        label: 'Accessible Names (Links & Buttons)',
        rules: ['link-name', 'button-name'],
    },
    a11y_aria: {
        label: 'ARIA Attributes',
        rules: ['aria-valid-attr', 'aria-valid-attr-value', 'aria-required-attr'],
    },
    a11y_lang: {
        label: 'Page Language',
        rules: ['html-has-lang', 'html-lang-valid'],
    },
    a11y_page_title: {
        label: 'Document Title (WCAG)',
        rules: ['document-title'],
    },
};

const IMPACT_ORDER = ['minor', 'moderate', 'serious', 'critical'];

function worstImpact(impacts) {
    return impacts.reduce((worst, cur) => {
        if (!cur) return worst;
        if (!worst) return cur;
        return IMPACT_ORDER.indexOf(cur) > IMPACT_ORDER.indexOf(worst) ? cur : worst;
    }, null);
}

/**
 * Injects axe-core into an already-open Puppeteer page and runs it,
 * restricted to RULE_IDS. Intended to be called from fetcher.js's
 * renderWithChrome(), between page.content() and browser.close().
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
            return axe.run({ runOnly: { type: 'rule', values: ruleIds } });
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
 * Mapping of axe "impact" to our pass/warn/fail:
 *   critical / serious -> fail
 *   moderate            -> warn
 *   minor               -> pass (informational only, not weighted down)
 *
 * @param {object|null} axeResult - return value of runAxe(). If null
 *   (Chrome/axe unavailable), returns an empty array — the "Accessibility"
 *   category simply has no checks that run, rather than a broken report.
 * @returns {Array<object>}
 */
export function buildAccessibilityChecks(axeResult) {
    if (!axeResult) return [];

    const violationsByRule = new Map();
    for (const v of axeResult.violations || []) {
        violationsByRule.set(v.id, v);
    }

    const checks = [];
    for (const [checkId, def] of Object.entries(CHECK_MAP)) {
        const hits = def.rules.map((r) => violationsByRule.get(r)).filter(Boolean);

        if (hits.length === 0) {
            checks.push({
                category: 'accessibility',
                id: checkId,
                label: def.label,
                status: 'pass',
                value: 'No issues found',
                detail: 'axe-core found no violations for this rule on the rendered page.',
            });
            continue;
        }

        const nodeCount = hits.reduce((n, h) => n + (h.nodes ? h.nodes.length : 0), 0);
        const impact = worstImpact(hits.map((h) => h.impact));
        const status = impact === 'critical' || impact === 'serious' ? 'fail'
            : impact === 'moderate' ? 'warn'
                : 'pass'; // minor-only issues stay informational, per scoring policy

        checks.push({
            category: 'accessibility',
            id: checkId,
            label: def.label,
            status,
            value: `${nodeCount} element(s) affected (${impact})`,
            detail: hits.map((h) => h.help).join(' — '),
        });
    }

    return checks;
}