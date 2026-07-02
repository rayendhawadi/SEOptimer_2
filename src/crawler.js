// Crawls a website starting from one URL: discovers internal pages via on-page
// links and an optional sitemap.xml, fetches each (raw HTTP), and renders the
// home page with headless Chrome for screenshots + performance metrics.

import * as cheerio from 'cheerio';
import { rawFetch, renderWithChrome, normalizeUrl } from './fetcher.js';

const SKIP_EXT = /\.(jpg|jpeg|png|gif|webp|svg|ico|css|js|json|xml|txt|pdf|zip|gz|mp4|mp3|avi|mov|woff2?|ttf|eot|webmanifest)(\?|$)/i;

function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// Canonical key for dedup: drop hash, trailing slash, default ports; keep query.
function dedupKey(u) {
  try {
    const x = new URL(u);
    x.hash = '';
    let s = x.toString();
    return s.replace(/\/$/, '').toLowerCase();
  } catch { return u; }
}

function isCrawlable(u) {
  if (!/^https?:\/\//i.test(u)) return false;
  if (SKIP_EXT.test(u)) return false;
  return true;
}

// Pull internal URLs out of a sitemap.xml (handles sitemap index too, one level).
async function fetchSitemapUrls(origin, baseHost, limit) {
  const urls = [];
  try {
    const res = await rawFetch(new URL('/sitemap.xml', origin).toString());
    if (!res.ok) return urls;
    const $ = cheerio.load(res.html, { xmlMode: true });
    const locs = $('loc').map((_, e) => $(e).text().trim()).get();
    // If it's a sitemap index, fetch the first couple of child sitemaps.
    const childSitemaps = locs.filter((l) => /\.xml/i.test(l)).slice(0, 3);
    if (childSitemaps.length && $('sitemap').length) {
      for (const sm of childSitemaps) {
        try {
          const r2 = await rawFetch(sm);
          const $2 = cheerio.load(r2.html, { xmlMode: true });
          $2('url > loc').each((_, e) => urls.push($2(e).text().trim()));
        } catch {}
        if (urls.length >= limit) break;
      }
    } else {
      for (const l of locs) urls.push(l);
    }
  } catch {}
  return urls
    .filter((u) => hostOf(u) === baseHost && isCrawlable(u))
    .slice(0, limit);
}

/**
 * @returns {{ pages: Array, baseHost: string, start: string, sitemapFound: boolean }}
 *   each page = { url, status, ok, isHtml, html, $, raw, render|null, error? }
 */
export async function crawl(startUrl, { maxPages = 20, render = true, onProgress } = {}) {
  const start = normalizeUrl(startUrl);
  const origin = new URL(start);
  const baseHost = origin.hostname.replace(/^www\./, '');

  const seen = new Set();
  const queue = [];
  const enqueue = (u) => {
    const key = dedupKey(u);
    if (seen.has(key)) return;
    seen.add(key);
    queue.push(u);
  };
  enqueue(start);

  // robots.txt presence + whether it references a sitemap.
  let robotsTxt = { found: false, hasSitemap: false, body: '' };
  try {
    const r = await rawFetch(new URL('/robots.txt', origin).toString());
    if (r.ok && /text\/plain|robots/i.test((r.headers['content-type'] || '') + r.html.slice(0, 50))) {
      robotsTxt = {
        found: r.html.trim().length > 0 && !/<html/i.test(r.html),
        hasSitemap: /^\s*sitemap:/im.test(r.html),
        body: r.html.slice(0, 2000),
      };
    }
  } catch {}

  // Seed from sitemap.xml for better coverage.
  const sitemapUrls = await fetchSitemapUrls(origin, baseHost, maxPages * 2);
  const sitemapFound = sitemapUrls.length > 0 || robotsTxt.hasSitemap;
  for (const u of sitemapUrls) enqueue(u);

  const pages = [];
  let isFirst = true;

  while (queue.length && pages.length < maxPages) {
    const url = queue.shift();
    if (onProgress) onProgress({ crawled: pages.length, total: maxPages, url });

    let raw;
    try {
      raw = await rawFetch(url);
    } catch (e) {
      pages.push({ url, ok: false, status: 0, isHtml: false, error: e.message });
      continue;
    }

    const ctype = raw.headers['content-type'] || '';
    const isHtml = /text\/html|application\/xhtml/i.test(ctype) || /<html[\s>]/i.test(raw.html);

    let rendered = null;
    if (isFirst && render && isHtml) {
      try { rendered = await renderWithChrome(raw.finalUrl || url); } catch {}
    }
    isFirst = false;

    const html = (rendered && rendered.renderedHtml) || raw.html || '';
    const $ = isHtml ? cheerio.load(html) : cheerio.load('<html></html>');

    pages.push({
      url: raw.finalUrl || url,
      status: raw.status,
      ok: raw.ok,
      isHtml,
      html,
      $,
      raw,
      render: rendered,
    });

    // Discover more internal links from this page.
    if (isHtml && pages.length + queue.length < maxPages * 3) {
      $('a[href]').each((_, a) => {
        const href = ($(a).attr('href') || '').trim();
        if (!href || /^(mailto:|tel:|javascript:|#)/i.test(href)) return;
        let abs;
        try { abs = new URL(href, raw.finalUrl || url).toString(); } catch { return; }
        if (hostOf(abs) !== baseHost) return;
        if (!isCrawlable(abs)) return;
        enqueue(abs);
      });
    }
  }

  return { pages, baseHost, start, sitemapFound, robotsTxt, origin: origin.origin };
}
