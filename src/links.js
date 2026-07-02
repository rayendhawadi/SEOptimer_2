// Link extraction (per page) and site-wide link verification (broken-link
// detection) with a bounded concurrency pool.

const GENERIC_ANCHORS = new Set([
  'click here', 'here', 'read more', 'more', 'link', 'this', 'this page',
  'learn more', 'continue', 'go', 'click', 'details', 'view', 'see more',
]);

function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
}

/** Extract all links from one page. Returns rich link descriptors. */
export function extractLinks($, pageUrl, baseHost) {
  const out = [];
  $('a[href]').each((_, a) => {
    const rawHref = ($(a).attr('href') || '').trim();
    if (!rawHref) return;
    const text = $(a).text().replace(/\s+/g, ' ').trim();
    const rel = ($(a).attr('rel') || '').toLowerCase();

    if (/^mailto:/i.test(rawHref)) { out.push({ kind: 'mailto', href: rawHref, text, pageUrl }); return; }
    if (/^tel:/i.test(rawHref)) { out.push({ kind: 'tel', href: rawHref, text, pageUrl }); return; }
    if (/^(javascript:|#)/i.test(rawHref)) { out.push({ kind: 'anchor', href: rawHref, text, pageUrl }); return; }

    let abs;
    try { abs = new URL(rawHref, pageUrl).toString(); } catch { return; }
    const kind = hostOf(abs) === baseHost ? 'internal' : 'external';
    // An <a> with no text is only "empty" if it has no image/aria label either.
    const hasAlt = $(a).find('img').length > 0 || !!$(a).attr('aria-label') || !!$(a).attr('title');
    out.push({
      kind,
      href: abs,
      text,
      pageUrl,
      nofollow: /\bnofollow\b/.test(rel),
      empty: text.length === 0 && !hasAlt,
      generic: GENERIC_ANCHORS.has(text.toLowerCase()),
    });
  });
  return out;
}

// Simple bounded-concurrency map.
async function pool(items, concurrency, worker) {
  const results = new Array(items.length);
  let i = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

async function probe(url, timeout) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout);
  const headers = {
    'User-Agent': 'Mozilla/5.0 (compatible; SEO-Optimizer/1.0; +https://welyne.com/bot)',
  };
  try {
    // Try HEAD first (cheap); some servers reject it → fall back to GET.
    let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal, headers });
    if (res.status === 405 || res.status === 501 || res.status === 403) {
      res = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal, headers });
    }
    return { status: res.status, ok: res.ok, finalUrl: res.url, redirected: res.redirected };
  } catch (e) {
    return { status: 0, ok: false, error: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Verify a set of links. Dedups by absolute URL, caps total checked.
 * @returns {{ checked, results: Map<url,{status,ok,...}>, broken: [] }}
 */
export async function checkLinks(links, { concurrency = 12, max = 250, timeout = 12000 } = {}) {
  const httpLinks = links.filter((l) => l.kind === 'internal' || l.kind === 'external');
  const unique = [...new Map(httpLinks.map((l) => [l.href, l])).values()];
  const capped = unique.slice(0, max);

  const probed = await pool(capped, concurrency, (l) => probe(l.href, timeout));
  const results = new Map();
  capped.forEach((l, idx) => results.set(l.href, probed[idx]));

  // Build broken list with the source pages where each broken link appears.
  const sourceMap = new Map();
  for (const l of httpLinks) {
    if (!sourceMap.has(l.href)) sourceMap.set(l.href, new Set());
    sourceMap.get(l.href).add(l.pageUrl);
  }

  const broken = [];
  for (const [href, r] of results.entries()) {
    if (!r.ok && (r.status >= 400 || r.status === 0)) {
      const sample = httpLinks.find((l) => l.href === href) || {};
      broken.push({
        href,
        status: r.status || (r.error || 'error'),
        kind: sample.kind || 'external',
        text: sample.text || '',
        on: [...(sourceMap.get(href) || [])].slice(0, 3),
      });
    }
  }
  broken.sort((a, b) => String(a.kind).localeCompare(String(b.kind)));

  return { checkedCount: capped.length, uniqueCount: unique.length, results, broken };
}
