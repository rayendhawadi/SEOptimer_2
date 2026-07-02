// Compares visible content (text + links) captured at the desktop viewport
// vs the mobile viewport (see fetcher.js -> viewportContent). Google indexes
// mobile-first, so content/links that exist on desktop but are hidden or
// removed on mobile are invisible to a normal single-viewport audit and can
// silently hurt rankings.

function normalizeHref(href) {
    try {
        const u = new URL(href);
        u.hash = '';
        return u.toString();
    } catch {
        return href;
    }
}

function dedupeByHref(links) {
    const seen = new Set();
    const out = [];
    for (const l of links) {
        const key = normalizeHref(l.href);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(l);
    }
    return out;
}

/**
 * @param {{links: {href:string,text:string}[], text: string, wordCount: number}} desktop
 * @param {{links: {href:string,text:string}[], text: string, wordCount: number}} mobile
 * @returns {object|null} comparison result, or null if inputs are missing/invalid
 */
export function compareMobileDesktop(desktop, mobile) {
    if (!desktop || !mobile || !Array.isArray(desktop.links) || !Array.isArray(mobile.links)) {
        return null;
    }

    const desktopHrefs = new Set(desktop.links.map((l) => normalizeHref(l.href)));
    const mobileHrefs = new Set(mobile.links.map((l) => normalizeHref(l.href)));

    const missingOnMobile = dedupeByHref(
        desktop.links.filter((l) => !mobileHrefs.has(normalizeHref(l.href)))
    );
    const missingOnDesktop = dedupeByHref(
        mobile.links.filter((l) => !desktopHrefs.has(normalizeHref(l.href)))
    );

    const desktopWordCount = desktop.wordCount || 0;
    const mobileWordCount = mobile.wordCount || 0;
    const textRatio = desktopWordCount > 0
        ? Math.min(1, mobileWordCount / desktopWordCount)
        : 1;

    const linkRatio = desktopHrefs.size > 0
        ? Math.max(0, 1 - missingOnMobile.length / desktopHrefs.size)
        : 1;

    return {
        desktopWordCount,
        mobileWordCount,
        textRatio,
        desktopLinkCount: desktopHrefs.size,
        mobileLinkCount: mobileHrefs.size,
        linkRatio,
        // Capped so a huge nav/footer diff doesn't bloat the report payload.
        missingOnMobile: missingOnMobile.slice(0, 25),
        missingOnDesktop: missingOnDesktop.slice(0, 25),
        missingOnMobileCount: missingOnMobile.length,
        missingOnDesktopCount: missingOnDesktop.length,
    };
}