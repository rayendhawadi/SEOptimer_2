// Detects known third-party scripts (analytics, chat widgets, ads/social
// pixels, embeds) among the resources captured by Puppeteer during render.
// Uses render.resources, which fetcher.js already populates — no extra
// network calls needed.

// domain -> { name, category }
// category is one of: 'analytics' | 'ads' | 'chat' | 'widget'
const THIRD_PARTY_SCRIPTS = {
    // Analytics
    'www.google-analytics.com': { name: 'Google Analytics', category: 'analytics' },
    'www.googletagmanager.com': { name: 'Google Tag Manager', category: 'analytics' },
    'static.hotjar.com': { name: 'Hotjar', category: 'analytics' },
    'script.hotjar.com': { name: 'Hotjar', category: 'analytics' },
    'www.clarity.ms': { name: 'Microsoft Clarity', category: 'analytics' },
    'cdn.mxpnl.com': { name: 'Mixpanel', category: 'analytics' },
    'cdn.segment.com': { name: 'Segment', category: 'analytics' },
    'cdn.amplitude.com': { name: 'Amplitude', category: 'analytics' },

    // Ads / social pixels
    'connect.facebook.net': { name: 'Facebook Pixel/SDK', category: 'ads' },
    'googleads.g.doubleclick.net': { name: 'Google Ads', category: 'ads' },
    'googlesyndication.com': { name: 'Google AdSense', category: 'ads' },
    'analytics.tiktok.com': { name: 'TikTok Pixel', category: 'ads' },
    'snap.licdn.com': { name: 'LinkedIn Insight Tag', category: 'ads' },
    's.pinimg.com': { name: 'Pinterest Tag', category: 'ads' },
    'ct.pinterest.com': { name: 'Pinterest Tag', category: 'ads' },
    'twitter.com/i/adsct': { name: 'Twitter/X Ads', category: 'ads' },

    // Chat / support
    'widget.intercom.io': { name: 'Intercom Chat', category: 'chat' },
    'embed.tawk.to': { name: 'Tawk.to Chat', category: 'chat' },
    'static.zdassets.com': { name: 'Zendesk Chat', category: 'chat' },
    'js.driftt.com': { name: 'Drift Chat', category: 'chat' },
    'client.crisp.chat': { name: 'Crisp Chat', category: 'chat' },

    // Widgets / embeds
    'www.youtube.com': { name: 'YouTube Embed', category: 'widget' },
    'maps.googleapis.com': { name: 'Google Maps', category: 'widget' },
    'fonts.googleapis.com': { name: 'Google Fonts', category: 'widget' },
    'www.google.com/recaptcha': { name: 'reCAPTCHA', category: 'widget' },
    'js.stripe.com': { name: 'Stripe', category: 'widget' },
};

// Rough effective download speed used only to turn KB into a ballpark
// added-seconds estimate. Not a real network measurement.
const ASSUMED_KBPS = 3000;

function matchService(hostname, pathname) {
    // Exact / suffix hostname match first (covers most entries).
    for (const [domain, info] of Object.entries(THIRD_PARTY_SCRIPTS)) {
        if (domain.includes('/')) continue; // handled below
        if (hostname === domain || hostname.endsWith('.' + domain)) return info;
    }
    // Domain+path entries (e.g. google.com/recaptcha, twitter.com/i/adsct).
    for (const [domain, info] of Object.entries(THIRD_PARTY_SCRIPTS)) {
        if (!domain.includes('/')) continue;
        const [host, ...pathParts] = domain.split('/');
        const path = '/' + pathParts.join('/');
        if ((hostname === host || hostname.endsWith('.' + host)) && pathname.startsWith(path)) {
            return info;
        }
    }
    return null;
}

/**
 * @param {{url:string, type:string, bytes:number}[]} resources
 * @returns {{hits: object[], byService: object[], totalBytes: number, count: number, estimatedDelayMs: number}}
 */
export function detectThirdPartyScripts(resources) {
    if (!Array.isArray(resources)) {
        return { hits: [], byService: [], totalBytes: 0, count: 0, estimatedDelayMs: 0 };
    }

    const hits = [];
    for (const r of resources) {
        let hostname, pathname;
        try {
            const u = new URL(r.url);
            hostname = u.hostname;
            pathname = u.pathname;
        } catch {
            continue;
        }
        const match = matchService(hostname, pathname);
        if (match) {
            hits.push({
                url: r.url,
                service: match.name,
                category: match.category,
                bytes: r.bytes || 0,
            });
        }
    }

    // Aggregate by service name (a service can load more than one file).
    const byServiceMap = new Map();
    for (const h of hits) {
        const entry = byServiceMap.get(h.service) || { service: h.service, category: h.category, bytes: 0, requests: 0 };
        entry.bytes += h.bytes;
        entry.requests += 1;
        byServiceMap.set(h.service, entry);
    }
    const byService = Array.from(byServiceMap.values()).sort((a, b) => b.bytes - a.bytes);

    const totalBytes = hits.reduce((s, h) => s + h.bytes, 0);
    const totalKb = totalBytes / 1024;
    const estimatedDelayMs = Math.round((totalKb * 8 / ASSUMED_KBPS) * 1000);

    return { hits, byService, totalBytes, count: hits.length, estimatedDelayMs };
}