// Validates JSON-LD structured data (schema.org) found on a page: catches
// syntax errors per-block (the basic check in analyzer.js only detects
// *presence*, not validity) and checks whether each recognized @type has
// the fields Google needs to show rich results for it.
// Runs on the same cheerio `$` analyzer.js already built — no extra
// network or DOM work needed.

// Required fields Google generally expects per type. This is a practical
// subset for the most common rich-result types, not the full spec.
const REQUIRED_FIELDS = {
    Product: ['name', 'image'],
    Article: ['headline', 'image', 'datePublished'],
    NewsArticle: ['headline', 'image', 'datePublished'],
    BlogPosting: ['headline', 'image', 'datePublished'],
    Recipe: ['name', 'image', 'recipeIngredient', 'recipeInstructions'],
    FAQPage: ['mainEntity'],
    LocalBusiness: ['name', 'address'],
    Organization: ['name', 'url'],
    BreadcrumbList: ['itemListElement'],
    VideoObject: ['name', 'description', 'thumbnailUrl', 'uploadDate'],
    JobPosting: ['title', 'description', 'datePosted', 'hiringOrganization'],
    Review: ['reviewRating', 'author'],
    Event: ['name', 'startDate', 'location'],
};

function checkObj(id, label, status, value, detail) {
    return { category: 'onpage', id, label, status, value: value ?? '', detail: detail ?? '' };
}

/**
 * @param {CheerioAPI} $ - the already-loaded page DOM
 * @returns {Array} check objects, same shape used everywhere else in analyzer.js
 */
export function validateSchema($) {
    const checks = [];
    const blocks = $('script[type="application/ld+json"]').toArray();
    console.log('[schema.js] blocks found:', blocks.length); // ← ajoute cette ligne

    if (blocks.length === 0) return checks;

    // --- 1. Syntax: does each JSON-LD block actually parse? ------------------
    let parseErrors = 0;
    const entities = [];
    blocks.forEach((el) => {
        const raw = $(el).text();
        try {
            flatten(JSON.parse(raw)).forEach((e) => entities.push(e));
        } catch {
            parseErrors++;
        }
    });

    checks.push(checkObj(
        'schema_syntax', 'Structured Data Syntax',
        parseErrors === 0 ? 'pass' : 'fail',
        parseErrors === 0
            ? `${blocks.length} block(s), all valid JSON`
            : `${parseErrors}/${blocks.length} block(s) invalid`,
        parseErrors === 0
            ? 'All JSON-LD blocks are syntactically valid — Google can parse them.'
            : `${parseErrors} JSON-LD block(s) contain a syntax error and are silently ignored by Google. Validate them with Google's Rich Results Test.`
    ));

    // --- 2. Completeness: do recognized types have the fields Google needs? --
    const problems = [];
    const okTypes = [];
    for (const entity of entities) {
        const types = [].concat(entity['@type'] || []).map(String);
        for (const type of types) {
            const required = REQUIRED_FIELDS[type];
            if (!required) continue; // unrecognized/uncommon type — not an error
            const missing = required.filter((f) => entity[f] === undefined || entity[f] === null || entity[f] === '');
            if (missing.length) problems.push(`${type}: missing ${missing.join(', ')}`);
            else okTypes.push(type);
        }
    }

    if (problems.length || okTypes.length) {
        checks.push(checkObj(
            'schema_completeness', 'Structured Data Completeness',
            problems.length === 0 ? 'pass' : 'warn',
            problems.length === 0 ? `${okTypes.length} type(s) complete` : `${problems.length} issue(s) found`,
            problems.length === 0
                ? `All recognized schema types (${[...new Set(okTypes)].join(', ')}) have the fields Google requires.`
                : problems.slice(0, 6).join(' · ') + (problems.length > 6 ? ` (+${problems.length - 6} more)` : '')
        ));
    }

    return checks;
}

// JSON-LD can be a single object, an array, or wrapped in an @graph — this
// walks all three shapes and returns a flat list of entities that have a
// @type, which is all we need for validation.
function flatten(node, out = []) {
    if (!node || typeof node !== 'object') return out;
    if (Array.isArray(node)) { node.forEach((n) => flatten(n, out)); return out; }
    if (node['@graph']) flatten(node['@graph'], out);
    if (node['@type']) out.push(node);
    return out;
}