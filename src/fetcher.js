// Fetches a page two ways:
//  1) raw HTTP fetch (fast, gets headers + static HTML)
//  2) headless Chrome render (gets final DOM, performance metrics, screenshots)
// The renderer is optional — if Chrome can't launch we degrade gracefully.

import puppeteer from 'puppeteer';
import { runAxe } from './accessibility.js';
/** Normalize a user-supplied URL into something fetchable. */
export function normalizeUrl(input) {
  let url = String(input || '').trim();
  if (!url) throw new Error('No URL provided');
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const u = new URL(url); // throws if invalid
  return u.toString();
}

/** Raw HTTP fetch — returns { ok, status, headers, html, finalUrl, redirected, timing }. */
export async function rawFetch(url) {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; SEO-Optimizer/1.0; +https://welyne.com/bot)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const html = await res.text();
    const ttfbAndDownload = Date.now() - start;
    const headers = {};
    res.headers.forEach((v, k) => (headers[k] = v));
    return {
      ok: res.ok,
      status: res.status,
      headers,
      html,
      finalUrl: res.url,
      redirected: res.redirected,
      bytes: Buffer.byteLength(html, 'utf8'),
      loadTimeMs: ttfbAndDownload,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Try to render with headless Chrome. Returns null if Chrome is unavailable. */
export async function renderWithChrome(url) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
  } catch (err) {
    console.warn('[renderer] Chrome unavailable, skipping render:', err.message);
    return null;
  }

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (compatible; SEO-Optimizer/1.0; +https://welyne.com/bot)'
    );

    // Track all network responses to estimate page weight + request count.
    const resources = [];
    page.on('response', (res) => {
      const req = res.request();
      const headers = res.headers();
      const len = Number(headers['content-length'] || 0);
      resources.push({
        url: res.url(),
        type: req.resourceType(),
        status: res.status(),
        bytes: len,
        fromCache: res.fromCache(),
      });
    });

    const start = Date.now();
    let response;
    try {
      response = await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });
    } catch (e) {
      // networkidle can time out on heavy pages; fall back to domcontentloaded
      response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
    }
    const loadTimeMs = Date.now() - start;

    const renderedHtml = await page.content();
    // Accessibility audit (axe-core) — reuses this already-open page,
    // no extra browser/request. Returns null if it fails; never throws.
    const axeResult = await runAxe(page);
    // Browser-side performance + metrics.
    const perf = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] || {};
      const paints = performance.getEntriesByType('paint') || [];
      const fcp = paints.find((p) => p.name === 'first-contentful-paint');
      return {
        domContentLoaded: nav.domContentLoadedEventEnd || 0,
        loadEvent: nav.loadEventEnd || 0,
        firstContentfulPaint: fcp ? fcp.startTime : 0,
        domNodes: document.getElementsByTagName('*').length,
      };
    });

    // Desktop + mobile screenshots (base64 data URLs for the report).
    await page.setViewport({ width: 1280, height: 800 });
    const desktopShot = await page.screenshot({
      encoding: 'base64',
      type: 'jpeg',
      quality: 60,
    });

    await page.setViewport({ width: 768, height: 1024, deviceScaleFactor: 1 });
    const tabletShot = await page.screenshot({
      encoding: 'base64',
      type: 'jpeg',
      quality: 60,
    });

    await page.setViewport({
      width: 390,
      height: 844,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const mobileShot = await page.screenshot({
      encoding: 'base64',
      type: 'jpeg',
      quality: 60,
    });

    const totalBytes = resources.reduce((s, r) => s + (r.bytes || 0), 0);

    return {
      renderedHtml,
      loadTimeMs,
      perf,
      resources,
      requestCount: resources.length,
      totalBytes,
      status: response ? response.status() : 0,
      accessibility: axeResult,
      screenshots: {
        desktop: `data:image/jpeg;base64,${desktopShot}`,
        tablet: `data:image/jpeg;base64,${tabletShot}`,
        mobile: `data:image/jpeg;base64,${mobileShot}`,
      },
    };
  } finally {
    await browser.close().catch(() => { });
  }
}
