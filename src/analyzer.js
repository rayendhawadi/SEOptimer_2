// Runs all SEO checks against a fetched/rendered page and returns a structured
// list of "checks", each with a status (pass/warn/fail) and weight used for scoring.
import { validateSchema } from './schema.js';
import * as cheerio from 'cheerio';
import { buildAccessibilityChecks } from './accessibility.js';
import { compareMobileDesktop } from './mobileConsistency.js';
import { detectThirdPartyScripts } from './thirdParty.js';
const CATEGORIES = {
  onpage: 'On-Page SEO',
  content: 'Content Quality',
  links: 'Links',
  usability: 'Usability',
  performance: 'Performance',
  social: 'Social',
  accessibility: 'Accessibility',
  security: 'Security & Technology',
};

export { CATEGORIES };

// helper to make a check object
function check(category, id, label, status, value, detail) {
  return { category, id, label, status, value: value ?? '', detail: detail ?? '' };
}

/**
 * @param {object} ctx - { url, raw, render }
 *   raw    = result of rawFetch()
 *   render = result of renderWithChrome() | null
 */
export function analyze(ctx) {
  const { url, raw, render } = ctx;
  const html = (render && render.renderedHtml) || raw.html || '';
  const $ = cheerio.load(html);
  const headers = raw.headers || {};
  const parsedUrl = new URL(raw.finalUrl || url);

  const checks = [];

  // ----------------------------------------------------------------- ON-PAGE
  // Title
  const title = ($('title').first().text() || '').trim();
  const titleLen = title.length;
  if (!title) {
    checks.push(check('onpage', 'title', 'Title Tag', 'fail', '(missing)',
      'Your page is missing a title tag.'));
  } else {
    const st = titleLen >= 30 && titleLen <= 65 ? 'pass' : 'warn';
    checks.push(check('onpage', 'title', 'Title Tag', st, title,
      `${titleLen} characters. Ideal length is 30–65 characters.`));
  }

  // Meta description
  const metaDesc = ($('meta[name="description"]').attr('content') || '').trim();
  const descLen = metaDesc.length;
  if (!metaDesc) {
    checks.push(check('onpage', 'meta_description', 'Meta Description', 'fail',
      '(missing)', 'Your page does not have a meta description.'));
  } else {
    const st = descLen >= 70 && descLen <= 160 ? 'pass' : 'warn';
    checks.push(check('onpage', 'meta_description', 'Meta Description', st, metaDesc,
      `${descLen} characters. Ideal length is 70–160 characters.`));
  }

  // Headings (H1..H6)
  const h1s = $('h1').map((_, e) => $(e).text().trim()).get().filter(Boolean);
  const headingCounts = {};
  for (let i = 1; i <= 6; i++) headingCounts['h' + i] = $('h' + i).length;
  if (h1s.length === 0) {
    checks.push(check('onpage', 'h1', 'H1 Heading', 'fail', '0 found',
      'No H1 tag found. Add a single, descriptive H1.'));
  } else if (h1s.length === 1) {
    checks.push(check('onpage', 'h1', 'H1 Heading', 'pass', h1s[0],
      'Exactly one H1 tag found — good.'));
  } else {
    checks.push(check('onpage', 'h1', 'H1 Heading', 'warn', `${h1s.length} found`,
      'Multiple H1 tags found. Prefer a single H1 per page.'));
  }
  checks.push(check('onpage', 'headings', 'Heading Structure', 'pass',
    Object.entries(headingCounts).map(([k, v]) => `${k.toUpperCase()}:${v}`).join('  '),
    'Distribution of heading tags on the page.'));

  // Body word count (Content category adds the detailed quality checks)
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const wordCount = bodyText ? bodyText.split(' ').length : 0;

  // Top keywords (kept in meta; surfaced in the Content section of the report)
  const keywords = topKeywords(bodyText, title, metaDesc, h1s.join(' '));

  // Images & ALT attributes
  const imgs = $('img').toArray();
  const imgsNoAlt = imgs.filter((e) => !($(e).attr('alt') || '').trim());
  if (imgs.length === 0) {
    checks.push(check('onpage', 'image_alt', 'Image ALT Attributes', 'warn',
      'No images', 'No images found on the page.'));
  } else if (imgsNoAlt.length === 0) {
    checks.push(check('onpage', 'image_alt', 'Image ALT Attributes', 'pass',
      `${imgs.length} images, all have ALT`,
      'All images have descriptive ALT attributes.'));
  } else {
    checks.push(check('onpage', 'image_alt', 'Image ALT Attributes', 'fail',
      `${imgsNoAlt.length}/${imgs.length} missing ALT`,
      'Some images are missing ALT text, hurting accessibility & SEO.'));
  }

  // Links (internal vs external)
  const host = parsedUrl.hostname.replace(/^www\./, '');
  const anchors = $('a[href]').toArray();
  let internal = 0, external = 0, nofollow = 0;
  const externalLinks = [];
  for (const a of anchors) {
    const href = $(a).attr('href') || '';
    if (/^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
    let linkHost;
    try { linkHost = new URL(href, raw.finalUrl || url).hostname.replace(/^www\./, ''); }
    catch { continue; }
    if (linkHost === host) internal++;
    else { external++; externalLinks.push(href); }
    if (/nofollow/i.test($(a).attr('rel') || '')) nofollow++;
  }
  // (Detailed link analysis lives in the Links category, computed site-wide.)

  // Canonical
  const canonical = $('link[rel="canonical"]').attr('href');
  checks.push(check('onpage', 'canonical', 'Canonical Tag',
    canonical ? 'pass' : 'warn', canonical || '(missing)',
    canonical ? 'A canonical URL is specified.' :
      'No canonical tag — add one to avoid duplicate-content issues.'));

  // Structured data (schema.org) — parse JSON-LD @type values too
  const ldJson = $('script[type="application/ld+json"]').length;
  const microdata = $('[itemscope]').length;
  const hasSchema = ldJson > 0 || microdata > 0;
  const schemaTypes = new Set();
  const collectTypes = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(collectTypes); return; }
    if (node['@type']) [].concat(node['@type']).forEach((t) => schemaTypes.add(String(t)));
    Object.values(node).forEach(collectTypes);
  };
  $('script[type="application/ld+json"]').each((_, e) => {
    try { collectTypes(JSON.parse($(e).text())); } catch { }
  });
  $('[itemtype]').each((_, e) => {
    const t = ($(e).attr('itemtype') || '').split('/').pop();
    if (t) schemaTypes.add(t);
  });
  checks.push(check('onpage', 'schema', 'Structured Data (Schema)',
    hasSchema ? 'pass' : 'warn',
    hasSchema ? ([...schemaTypes].slice(0, 6).join(', ') || `${ldJson} JSON-LD, ${microdata} microdata`) : '(none)',
    hasSchema ? 'Structured data found — enables rich search results.' :
      'No schema markup detected. Add JSON-LD for rich results.'));

  checks.push(...validateSchema($));

  // ---------------------------------------------------------------- USABILITY
  // Mobile viewport
  const viewport = $('meta[name="viewport"]').attr('content');
  checks.push(check('usability', 'viewport', 'Mobile Viewport',
    viewport ? 'pass' : 'fail', viewport || '(missing)',
    viewport ? 'A responsive viewport meta tag is set.' :
      'Missing viewport tag — the page may not be mobile friendly.'));

  // Mobile vs Desktop content consistency (Google indexes mobile-first, so
  // content/links hidden on mobile but present on desktop are a real risk).
  // Only runs if Chrome rendering succeeded and captured both viewports.
  const viewportContent = render && render.viewportContent;
  if (viewportContent && viewportContent.desktop && viewportContent.mobile) {
    const cmp = compareMobileDesktop(viewportContent.desktop, viewportContent.mobile);
    if (cmp) {
      const textPct = Math.round(cmp.textRatio * 100);
      const linkPct = Math.round(cmp.linkRatio * 100);

      let status = 'pass';
      if (textPct < 70 || linkPct < 70) status = 'fail';
      else if (textPct < 90 || linkPct < 90) status = 'warn';

      const details = [];
      if (cmp.missingOnMobileCount > 0) {
        const sample = cmp.missingOnMobile.slice(0, 5)
          .map((l) => l.text || l.href).filter(Boolean).join(', ');
        details.push(
          `${cmp.missingOnMobileCount} lien(s) visible(s) sur desktop mais absent(s) sur mobile` +
          (sample ? ` (ex : ${sample}).` : '.')
        );
      }
      if (textPct < 100) {
        details.push(`Le texte visible sur mobile représente ~${textPct}% de celui visible sur desktop.`);
      }
      if (!details.length) {
        details.push('Le contenu et les liens visibles sont cohérents entre desktop et mobile.');
      }

      checks.push(check('usability', 'mobile_consistency', 'Mobile vs Desktop Consistency',
        status,
        `${textPct}% texte · ${linkPct}% liens en commun`,
        details.join(' ')));
    }
  }

  // Favicon
  const favicon = $('link[rel*="icon"]').attr('href');
  checks.push(check('usability', 'favicon', 'Favicon',
    favicon ? 'pass' : 'warn', favicon || '(missing)',
    favicon ? 'Favicon is set.' : 'No favicon detected.'));

  // Language
  const lang = $('html').attr('lang');
  checks.push(check('usability', 'lang', 'Language Declaration',
    lang ? 'pass' : 'warn', lang || '(missing)',
    lang ? 'The page declares its language.' :
      'Add a lang attribute to the <html> element.'));

  // Doctype / charset
  const charset = $('meta[charset]').attr('charset') ||
    ($('meta[http-equiv="Content-Type"]').attr('content') || '');
  checks.push(check('usability', 'charset', 'Charset',
    charset ? 'pass' : 'warn', charset || '(missing)',
    charset ? 'Character encoding is declared.' : 'Declare a charset (UTF-8).'));

  // Legible font sizes / tap targets are heuristic — we report DOM size as a proxy
  if (render && render.perf) {
    const nodes = render.perf.domNodes || 0;
    checks.push(check('usability', 'dom_size', 'DOM Size',
      nodes < 1500 ? 'pass' : nodes < 3000 ? 'warn' : 'fail',
      `${nodes} nodes`,
      nodes < 1500 ? 'DOM size is reasonable.' :
        'Large DOM can slow rendering on mobile devices.'));
  }

  // Email privacy (plaintext addresses can be harvested by spammers)
  const bodyTextRaw = $('body').text();
  const plainEmails = (bodyTextRaw.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []);
  checks.push(check('usability', 'email_privacy', 'Email Privacy',
    plainEmails.length ? 'warn' : 'pass',
    plainEmails.length ? `${plainEmails.length} plaintext email(s) exposed` : 'No exposed emails',
    plainEmails.length ? 'Plaintext email addresses can be harvested by spam bots; obfuscate them.'
      : 'No plaintext email addresses found in the page body.'));

  // Flash (obsolete, unsupported)
  const flash = $('embed[src*=".swf"], object[type*="flash"]').length || /\.swf\b/i.test(html);
  checks.push(check('usability', 'flash', 'Flash Content',
    flash ? 'fail' : 'pass', flash ? 'Detected' : 'None',
    flash ? 'Flash is obsolete and unsupported by modern browsers; remove it.'
      : 'No Flash content (good).'));

  // iframes
  const iframes = $('iframe').length;
  checks.push(check('usability', 'iframes', 'iFrames',
    iframes === 0 ? 'pass' : 'warn', iframes ? `${iframes} iframe(s)` : 'None',
    iframes ? 'iFrames can hurt SEO and accessibility; use sparingly.'
      : 'No iframes found.'));

  // Deprecated HTML tags
  const deprecated = $('center, font, marquee, big, strike, tt, frame, frameset, acronym, applet, basefont').length;
  checks.push(check('usability', 'deprecated_html', 'Deprecated HTML Tags',
    deprecated === 0 ? 'pass' : 'warn', deprecated ? `${deprecated} tag(s)` : 'None',
    deprecated ? 'Replace deprecated tags (font, center, marquee…) with modern CSS/HTML5.'
      : 'No deprecated HTML tags found.'));

  // ------------------------------------------------------------- PERFORMANCE
  const pageBytes = render?.totalBytes || raw.bytes || 0;
  const pageKb = Math.round(pageBytes / 1024);
  {
    const st = pageKb < 1024 ? 'pass' : pageKb < 3072 ? 'warn' : 'fail';
    checks.push(check('performance', 'page_size', 'Page Size', st,
      `${pageKb} KB`,
      st === 'pass' ? 'Page weight is reasonable.' :
        'Large page weight. Compress assets and images.'));
  }

  const reqCount = render?.requestCount;
  if (reqCount != null) {
    const st = reqCount < 50 ? 'pass' : reqCount < 100 ? 'warn' : 'fail';
    checks.push(check('performance', 'requests', 'HTTP Requests', st,
      `${reqCount} requests`,
      st === 'pass' ? 'Reasonable number of requests.' :
        'Too many requests. Combine/minify assets and use sprites.'));
  }

  const loadMs = render?.loadTimeMs || raw.loadTimeMs || 0;
  {
    const st = loadMs < 2000 ? 'pass' : loadMs < 4000 ? 'warn' : 'fail';
    checks.push(check('performance', 'load_time', 'Load Time', st,
      `${(loadMs / 1000).toFixed(2)} s`,
      st === 'pass' ? 'Page loaded quickly.' :
        'Slow load time. Optimize server response & assets.'));
  }

  if (render?.perf?.firstContentfulPaint) {
    const fcp = render.perf.firstContentfulPaint;
    const st = fcp < 1800 ? 'pass' : fcp < 3000 ? 'warn' : 'fail';
    checks.push(check('performance', 'fcp', 'First Contentful Paint', st,
      `${(fcp / 1000).toFixed(2)} s`,
      st === 'pass' ? 'Content paints quickly.' : 'Improve FCP for better UX.'));
  }

  // Compression
  const encoding = headers['content-encoding'] || '';
  checks.push(check('performance', 'compression', 'GZIP/Brotli Compression',
    /gzip|br|deflate/i.test(encoding) ? 'pass' : 'warn',
    encoding || '(none)',
    /gzip|br|deflate/i.test(encoding) ? 'Text compression is enabled.' :
      'Enable GZIP or Brotli compression on your server.'));

  // Caching
  const cacheControl = headers['cache-control'] || '';
  checks.push(check('performance', 'caching', 'Browser Caching',
    cacheControl ? 'pass' : 'warn', cacheControl || '(none)',
    cacheControl ? 'Cache-Control headers are set.' :
      'Set Cache-Control headers for static assets.'));

  // Inline styles
  const inlineStyles = $('[style]').length;
  checks.push(check('performance', 'inline_styles', 'Inline Styles',
    inlineStyles < 20 ? 'pass' : 'warn', `${inlineStyles} elements`,
    inlineStyles < 20 ? 'Minimal inline styles.' :
      'Many inline styles found; move CSS to external stylesheets.'));

  // Image optimization (from rendered network resources)
  if (render?.resources) {
    const imgRes = render.resources.filter((r) => r.type === 'image');
    const largeImgs = imgRes.filter((r) => r.bytes > 100 * 1024);
    const imgKb = Math.round(imgRes.reduce((s, r) => s + (r.bytes || 0), 0) / 1024);
    const st = largeImgs.length === 0 ? 'pass' : largeImgs.length <= 3 ? 'warn' : 'fail';
    checks.push(check('performance', 'image_optimization', 'Image Optimization', st,
      `${imgRes.length} images, ${imgKb} KB${largeImgs.length ? `, ${largeImgs.length} over 100KB` : ''}`,
      st === 'pass' ? 'Images are reasonably sized.'
        : 'Compress large images and serve next-gen formats (WebP/AVIF).'));
  }

  // Minification of CSS/JS (heuristic: are linked assets minified?)
  const assets = [
    ...$('script[src]').map((_, e) => $(e).attr('src')).get(),
    ...$('link[rel="stylesheet"]').map((_, e) => $(e).attr('href')).get(),
  ].filter(Boolean);
  if (assets.length) {
    const minified = assets.filter((u) => /[.-]min[.-]|\.min\./i.test(u)).length;
    const ratio = minified / assets.length;
    const st = ratio >= 0.6 ? 'pass' : ratio >= 0.3 ? 'warn' : 'fail';
    checks.push(check('performance', 'minification', 'CSS/JS Minification', st,
      `${minified}/${assets.length} assets minified`,
      st === 'pass' ? 'Most CSS/JS assets are minified.'
        : 'Minify CSS and JavaScript to reduce file sizes.'));
  }

  // Render-blocking resources (scripts/styles in <head>)
  const blockingScripts = $('head script[src]').filter((_, e) =>
    !$(e).attr('async') && !$(e).attr('defer')).length;
  const headCss = $('head link[rel="stylesheet"]').length;
  const blocking = blockingScripts + headCss;
  checks.push(check('performance', 'render_blocking', 'Render-Blocking Resources',
    blocking < 4 ? 'pass' : blocking < 8 ? 'warn' : 'fail',
    `${blockingScripts} scripts + ${headCss} stylesheets in <head>`,
    blocking < 4 ? 'Few render-blocking resources.'
      : 'Defer non-critical JS and inline critical CSS to speed first paint.'));

  // Third-party scripts (analytics, ads/social pixels, chat widgets, embeds)
  // detected among the resources Puppeteer already captured during render.
  if (render?.resources) {
    const tp = detectThirdPartyScripts(render.resources);
    const tpKb = Math.round(tp.totalBytes / 1024);
    const tpDelaySec = (tp.estimatedDelayMs / 1000).toFixed(1);

    let tpStatus = 'pass';
    if (tp.count >= 6 || tpKb >= 500) tpStatus = 'fail';
    else if (tp.count >= 3 || tpKb >= 200) tpStatus = 'warn';

    const topServices = tp.byService.slice(0, 3)
      .map((s) => `${s.service} (${Math.round(s.bytes / 1024)} Ko)`)
      .join(', ');

    checks.push(check('performance', 'third_party_scripts', 'Third-Party Scripts',
      tpStatus,
      `${tp.count} script(s) tiers · ${tpKb} Ko · ~${tpDelaySec}s ajoutée(s)`,
      tp.count === 0
        ? 'No known third-party scripts detected.'
        : `${tp.count} script(s) tiers détecté(s), dont ${topServices || 'divers services'} — ` +
        `ralentissent le chargement d'environ ${tpDelaySec}s.`));
  }

  // CDN usage
  const cdnHint = /cloudflare|cloudfront|akamai|fastly|jsdelivr|cdnjs|unpkg|gstatic|bunny|stackpath|netlify|vercel/i;
  const usesCdn = cdnHint.test(JSON.stringify(headers)) ||
    (render?.resources || []).some((r) => cdnHint.test(r.url));
  checks.push(check('performance', 'cdn', 'Content Delivery Network (CDN)',
    usesCdn ? 'pass' : 'warn', usesCdn ? 'Detected' : 'Not detected',
    usesCdn ? 'Assets are served via a CDN.'
      : 'Use a CDN to serve static assets faster worldwide.'));

  // ------------------------------------------------------------------ SOCIAL
  const og = {};
  $('meta[property^="og:"]').each((_, e) => {
    og[$(e).attr('property')] = $(e).attr('content');
  });
  const hasOg = Object.keys(og).length > 0;
  checks.push(check('social', 'open_graph', 'Open Graph (Facebook)',
    hasOg ? 'pass' : 'fail',
    hasOg ? Object.keys(og).join(', ') : '(missing)',
    hasOg ? 'Open Graph tags found.' :
      'No Open Graph tags — links will look poor when shared on Facebook/LinkedIn.'));

  const twitterCard = $('meta[name="twitter:card"]').attr('content');
  checks.push(check('social', 'twitter_card', 'Twitter Card',
    twitterCard ? 'pass' : 'fail', twitterCard || '(missing)',
    twitterCard ? 'Twitter Card markup found.' :
      'No Twitter Card tags — add them for rich X/Twitter previews.'));

  // Social profile links
  const socialNets = ['facebook.com', 'twitter.com', 'x.com', 'instagram.com',
    'linkedin.com', 'youtube.com', 'tiktok.com', 'pinterest.com'];
  const foundSocial = new Set();
  for (const href of externalLinks) {
    for (const net of socialNets) {
      if (href.includes(net)) foundSocial.add(net.replace('.com', ''));
    }
  }
  checks.push(check('social', 'social_links', 'Social Profile Links',
    foundSocial.size > 0 ? 'pass' : 'warn',
    foundSocial.size ? [...foundSocial].join(', ') : '(none found)',
    foundSocial.size ? 'Links to social profiles found.' :
      'No links to social media profiles detected.'));

  // ------------------------------------------------------ SECURITY & TECHNOLOGY
  const isHttps = parsedUrl.protocol === 'https:';
  checks.push(check('security', 'https', 'HTTPS / SSL',
    isHttps ? 'pass' : 'fail', isHttps ? 'Enabled' : 'Not enabled',
    isHttps ? 'The site is served over a secure HTTPS connection.' :
      'The site is not using HTTPS. Install an SSL certificate.'));

  const hsts = headers['strict-transport-security'];
  checks.push(check('security', 'hsts', 'HSTS Header',
    hsts ? 'pass' : 'warn', hsts || '(missing)',
    hsts ? 'HSTS is enabled.' :
      'Add a Strict-Transport-Security header to enforce HTTPS.'));

  const xfo = headers['x-frame-options'] || headers['content-security-policy'];
  checks.push(check('security', 'clickjacking', 'Clickjacking Protection',
    xfo ? 'pass' : 'warn', xfo ? 'Protected' : '(missing)',
    xfo ? 'X-Frame-Options or CSP is present.' :
      'Add X-Frame-Options or a frame-ancestors CSP directive.'));

  const xcto = headers['x-content-type-options'];
  checks.push(check('security', 'content_type_options', 'X-Content-Type-Options',
    xcto ? 'pass' : 'warn', xcto || '(missing)',
    xcto ? 'MIME-sniffing protection enabled.' :
      'Add "X-Content-Type-Options: nosniff".'));

  // Mixed content (insecure resources on a secure page)
  if (isHttps) {
    let mixed = [];
    if (render?.resources) {
      mixed = render.resources.filter((r) => /^http:\/\//i.test(r.url));
    } else {
      const m = html.match(/(?:src|href)\s*=\s*["']http:\/\/[^"']+/gi) || [];
      mixed = m.filter((x) => !/http:\/\/(www\.)?w3\.org/i.test(x));
    }
    checks.push(check('security', 'mixed_content', 'Mixed Content',
      mixed.length === 0 ? 'pass' : 'fail',
      mixed.length === 0 ? 'None' : `${mixed.length} insecure resource(s)`,
      mixed.length === 0 ? 'All resources load over HTTPS.'
        : 'Insecure (http://) resources on an HTTPS page trigger browser warnings.'));
  }

  // Outdated / vulnerable jQuery
  const jqMatch = html.match(/jquery[/-](\d+)\.(\d+)\.(\d+)/i) ||
    html.match(/jquery@(\d+)\.(\d+)\.(\d+)/i);
  if (jqMatch) {
    const major = Number(jqMatch[1]);
    const ver = `${jqMatch[1]}.${jqMatch[2]}.${jqMatch[3]}`;
    const old = major < 3;
    checks.push(check('security', 'jquery_version', 'jQuery Version',
      old ? 'warn' : 'pass', `v${ver}`,
      old ? `jQuery ${ver} has known XSS vulnerabilities; upgrade to 3.5+.`
        : `jQuery ${ver} is reasonably current.`));
  }

  // Server signature
  const server = headers['server'] || '';
  checks.push(check('security', 'server', 'Server',
    'pass', server || '(hidden)',
    server ? `Server reports: ${server}` : 'Server header is hidden — good for security.'));

  // Technology detection
  const tech = detectTech($, html, headers);
  checks.push(check('security', 'technology', 'Technology Detected',
    'pass', tech.join(', ') || 'Unknown',
    'Technologies & frameworks detected on the page.'));

  // robots.txt / meta robots
  const metaRobots = $('meta[name="robots"]').attr('content') || '';
  const blocked = /noindex/i.test(metaRobots);
  checks.push(check('onpage', 'robots', 'Indexability (Meta Robots)',
    blocked ? 'fail' : 'pass', metaRobots || 'index, follow (default)',
    blocked ? 'Page is set to NOINDEX — it will not appear in search results!' :
      'Page is indexable by search engines.'));

  // Analytics tracking
  const analyticsName =
    /googletagmanager|gtag\(/i.test(html) ? 'Google Tag Manager / GA4' :
      /google-analytics|ga\(/i.test(html) ? 'Google Analytics' :
        /plausible\.io/i.test(html) ? 'Plausible' :
          /matomo|piwik/i.test(html) ? 'Matomo' :
            /static\.hotjar/i.test(html) ? 'Hotjar' :
              /fathom/i.test(html) ? 'Fathom' :
                /segment\.(com|io)/i.test(html) ? 'Segment' : '';
  checks.push(check('onpage', 'analytics', 'Analytics',
    analyticsName ? 'pass' : 'warn', analyticsName || '(none detected)',
    analyticsName ? `Analytics is installed (${analyticsName}).`
      : 'No web analytics detected. Install GA4 or a privacy-friendly alternative.'));

  // ------------------------------------------------------------ ACCESSIBILITY
  // Homepage-only (render is only produced for the first crawled page —
  // see crawler.js). No render / no axe result -> no checks pushed, the
  // category is simply empty rather than breaking the report.
  checks.push(...buildAccessibilityChecks(render?.accessibility));
  return {
    url: raw.finalUrl || url,
    categories: CATEGORIES,
    checks,
    meta: {
      title, titleLen, metaDesc, descLen, h1: h1s, headingCounts,
      wordCount, keywords: keywords.slice(0, 15),
      images: { total: imgs.length, missingAlt: imgsNoAlt.length },
      links: { internal, external, nofollow },
      tech, isHttps, og, twitterCard,
      socialPlatforms: [...foundSocial], analytics: analyticsName,
      schemaTypes: [...schemaTypes],
      server, pageKb, reqCount: reqCount ?? null, loadMs,
      status: raw.status, redirected: raw.redirected,
    },
  };
}

// ---- helpers ---------------------------------------------------------------

const STOP = new Set(('a an the and or but of to in on for with at by from up about into over after ' +
  'is are was were be been being it its this that these those i you he she we they them his her our your ' +
  'as if then than so not no yes do does did has have had will would can could should may might must ' +
  'what which who whom where when why how all any both each few more most other some such only own same ' +
  'too very s t just don now also get got like one two new use using used out off via per').split(/\s+/));

function topKeywords(...texts) {
  const text = texts.join(' ').toLowerCase();
  const words = text.match(/[a-z][a-z0-9'-]{2,}/g) || [];
  const counts = new Map();
  for (const w of words) {
    if (STOP.has(w)) continue;
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count);
}

function detectTech($, html, headers) {
  const tech = new Set();
  const h = JSON.stringify(headers).toLowerCase();
  const body = html.toLowerCase();

  if (h.includes('wordpress') || body.includes('wp-content') || body.includes('wp-includes')) tech.add('WordPress');
  if (body.includes('cdn.shopify') || h.includes('shopify')) tech.add('Shopify');
  if (body.includes('wix.com') || h.includes('wix')) tech.add('Wix');
  if (body.includes('squarespace')) tech.add('Squarespace');
  if (body.includes('drupal')) tech.add('Drupal');
  if (body.includes('joomla')) tech.add('Joomla');
  if (body.includes('webflow')) tech.add('Webflow');
  if ($('script[src*="react"]').length || body.includes('__react') || body.includes('data-reactroot')) tech.add('React');
  if (body.includes('ng-version') || $('[ng-app]').length) tech.add('Angular');
  if (body.includes('data-v-') || body.includes('vue')) tech.add('Vue.js');
  if (body.includes('_next/') || body.includes('__next')) tech.add('Next.js');
  if (body.includes('nuxt')) tech.add('Nuxt');
  if ($('script[src*="jquery"]').length || body.includes('jquery')) tech.add('jQuery');
  if (body.includes('bootstrap')) tech.add('Bootstrap');
  if (body.includes('tailwind') || /\b(?:flex|grid|text-|bg-)\w+/.test(body)) {/* noisy, skip */ }
  if (body.includes('googletagmanager') || body.includes('gtag(')) tech.add('Google Tag Manager');
  if (body.includes('google-analytics') || body.includes('ga(')) tech.add('Google Analytics');
  if (body.includes('hotjar')) tech.add('Hotjar');
  if (body.includes('cloudflare') || h.includes('cloudflare')) tech.add('Cloudflare');
  if (h.includes('nginx')) tech.add('Nginx');
  if (h.includes('apache')) tech.add('Apache');
  if (h.includes('vercel')) tech.add('Vercel');
  if (h.includes('netlify')) tech.add('Netlify');

  return [...tech];
}