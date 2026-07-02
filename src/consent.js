// Detects whether the page has a cookie-consent banner (CMP) and whether
// known tracking scripts (Google Analytics, Facebook Pixel, etc.) are
// present without any consent mechanism — a common GDPR violation.
// Reuses the third-party hits already computed by thirdParty.js — no extra
// network calls or renders needed.

// substring (lowercase) found in the HTML -> CMP name
const KNOWN_CMPS = {
    'cookiebot.com': 'Cookiebot',
    'cdn.cookielaw.org': 'OneTrust',
    'onetrust.com': 'OneTrust',
    'sdk.privacy-center.org': 'Didomi',
    'didomi.io': 'Didomi',
    'static.axept.io': 'Axeptio',
    'axeptio.eu': 'Axeptio',
    'tarteaucitron': 'Tarteaucitron',
    'cdn.iubenda.com': 'Iubenda',
    'iubenda.com': 'Iubenda',
    'app.termly.io': 'Termly',
    'cookieyes.com': 'CookieYes',
    'consentmanager.net': 'Consentmanager',
    'usercentrics.eu': 'Usercentrics',
    'complianz': 'Complianz',
    'quantcast.com/choice': 'Quantcast Choice',
};

// Categories from thirdParty.js that count as "tracking" for GDPR purposes.
// Widgets (Google Fonts, Maps, reCAPTCHA...) are excluded to avoid false positives.
const TRACKING_CATEGORIES = new Set(['analytics', 'ads']);

// Fallback for hand-rolled banners (no known CMP script): look for common
// wording + an accept button in the raw HTML.
const GENERIC_BANNER_PATTERN =
    /cookie[- ]?(consent|banner|notice|policy)|accept[- ]?(all)?[- ]?cookies|g[ée]rer\s+(les\s+)?cookies|consentement|param[eè]tres\s+de\s+confidentialit[ée]/i;
const GENERIC_ACCEPT_BUTTON = /(accept(er)?|tout accepter|j'accepte|autoriser)/i;

function detectCmp(html) {
    for (const [needle, name] of Object.entries(KNOWN_CMPS)) {
        if (html.includes(needle)) return name;
    }
    return null;
}

function detectGenericBanner(html) {
    return GENERIC_BANNER_PATTERN.test(html) && GENERIC_ACCEPT_BUTTON.test(html);
}

/**
 * @param {string} html - rendered HTML of the page
 * @param {{service:string, category:string, url:string}[]} thirdPartyHits - hits from detectThirdPartyScripts()
 * @returns {{status:'pass'|'warn'|'fail', hasBanner:boolean, cmp:string|null, trackers:string[], summary:string, recommendation:string}}
 */
export function checkCookieConsent(html, thirdPartyHits = []) {
    const lowerHtml = (html || '').toLowerCase();
    const cmp = detectCmp(lowerHtml);
    const genericBanner = !cmp && detectGenericBanner(lowerHtml);
    const hasBanner = Boolean(cmp || genericBanner);

    const trackers = Array.from(new Set(
        (thirdPartyHits || [])
            .filter((h) => TRACKING_CATEGORIES.has(h.category))
            .map((h) => h.service)
    ));

    let status, summary, recommendation;

    if (trackers.length === 0) {
        // No known tracking script detected — nothing that needs consent.
        status = 'pass';
        summary = hasBanner
            ? `Bannière de consentement détectée (${cmp || 'générique'}), aucun script de tracking connu.`
            : 'Aucun script de tracking connu détecté sur la page.';
        recommendation = 'Aucune action requise pour le moment.';
    } else if (hasBanner) {
        // Banner present, but we can't verify pre-click timing from a single
        // render — so we warn instead of passing outright (limitation noted
        // as "faisabilité moyenne" for the timing check).
        status = 'warn';
        summary = `Bannière détectée (${cmp || 'générique'}), mais ${trackers.length} script(s) de tracking ` +
            `présent(s) sur la page (${trackers.join(', ')}) — à vérifier manuellement.`;
        recommendation = 'Confirmer (ex: en navigation privée, sans cliquer sur "Accepter") que ces scripts ' +
            'ne se déclenchent qu\'après consentement explicite de l\'utilisateur.';
    } else {
        // Tracking scripts loading with no banner at all — clear violation.
        status = 'fail';
        summary = `${trackers.join(', ')} se charge(nt) sans qu'aucune bannière de consentement n'ait été détectée.`;
        recommendation = 'Mettre en place une bannière de consentement (CMP) et bloquer les scripts de tracking ' +
            'tant que l\'utilisateur n\'a pas donné son accord — obligatoire sous le RGPD.';
    }

    return { status, hasBanner, cmp, trackers, summary, recommendation };
}