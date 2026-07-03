// Aggregates a multi-page crawl into a single site-level analysis:
//  - homepage base checks (analyzer.js)
//  - Content Quality checks (readability, headings, keyword density, thin content)
//  - Links checks (broken links, anchor text, nofollow, internal linking)
//  - site-wide On-Page checks (duplicate/missing titles, descriptions, H1s)
//  - per-page summaries + outlines + broken-link list used by the report.

import dns from 'node:dns/promises';
import { analyze } from './analyzer.js';
import { analyzeContent, analyzeHeadings } from './content.js';
import { extractLinks, checkLinks } from './links.js';

// An SEO-friendly URL is lowercase, hyphen-separated, short, no query soup.
function isFriendlyUrl(u) {
  try {
    const x = new URL(u);
    const path = x.pathname;
    if (path === '/' || path === '') return true;
    if (/[A-Z]/.test(path)) return false;
    if (/[_ %]/.test(path)) return false;
    if (path.length > 100) return false;
    if ((x.search.match(/&/g) || []).length >= 2) return false;
    if (/[^a-z0-9\-/.]/.test(path)) return false;
    return true;
  } catch { return false; }
}

function check(category, id, label, status, value, detail) {
  return { category, id, label, status, value: value ?? '', detail: detail ?? '' };
}

function summarizePage(page, baseHost) {
  const $ = page.$;
  const title = ($('title').first().text() || '').trim();
  const desc = ($('meta[name="description"]').attr('content') || '').trim();
  const headings = analyzeHeadings($);
  const headingsText = headings.list.map((h) => h.text).join(' ');
  const content = analyzeContent($, { title, metaDesc: desc, headingsText, url: page.url });
  const links = extractLinks($, page.url, baseHost);
  const imgs = $('img').toArray();
  const noAlt = imgs.filter((e) => !($(e).attr('alt') || '').trim()).length;
  return {
    url: page.url,
    status: page.status,
    ok: page.ok,
    title, titleLen: title.length,
    desc, descLen: desc.length,
    h1: headings.counts.h1,
    headings,
    content,
    internalLinks: links.filter((l) => l.kind === 'internal').length,
    externalLinks: links.filter((l) => l.kind === 'external').length,
    images: imgs.length,
    imagesNoAlt: noAlt,
    links,
  };
}

export async function buildSite(crawlResult, { checkLinksEnabled = true, lang = 'fr' } = {}) {
  const { pages, baseHost, sitemapFound, robotsTxt = {} } = crawlResult;
  const htmlPages = pages.filter((p) => p.isHtml && p.ok);
  const home = htmlPages[0] || pages[0];

  // Homepage base checks (onpage/usability/performance/social/security) + meta.
  const base = analyze({ url: home.url, raw: home.raw, render: home.render, lang });

  // Per-page summaries.
  const summaries = htmlPages.map((p) => summarizePage(p, baseHost));
  const homeS = summaries[0] || summarizePage(home, baseHost);

  // Collect every link across the site for verification.
  const allLinks = summaries.flatMap((s) => s.links);

  let linkResults = { broken: [], checkedCount: 0, uniqueCount: 0 };
  if (checkLinksEnabled && allLinks.length) {
    linkResults = await checkLinks(allLinks, { concurrency: 12, max: 250 });
  }

  const checks = [...base.checks];

  // -------------------------------------------------------------- CONTENT
  const c = homeS.content;
  {
    const st = c.readability >= 60 ? 'pass' : c.readability >= 40 ? 'warn' : 'fail';
    checks.push(check('content', 'readability', 'Readability', st,
      `${c.readability}/100 — ${c.readabilityLabel} (grade level ${c.gradeLevel})`,
      st === 'pass' ? 'Content is easy to read for a general audience.'
        : 'Content is hard to read. Use shorter words and sentences.'));
  }
  {
    const st = c.wordCount >= 600 ? 'pass' : c.wordCount >= 300 ? 'warn' : 'fail';
    checks.push(check('content', 'word_count', 'Word Count (Home)', st,
      `${c.wordCount} words`,
      st === 'pass' ? 'Healthy amount of content.'
        : 'Thin content. Aim for 600+ words of useful text on key pages.'));
  }
  {
    const st = c.avgWordsPerSentence <= 20 ? 'pass' : c.avgWordsPerSentence <= 25 ? 'warn' : 'fail';
    checks.push(check('content', 'sentence_length', 'Sentence Length', st,
      `${c.avgWordsPerSentence} words/sentence avg`,
      st === 'pass' ? 'Sentences are a comfortable length.'
        : 'Sentences are long. Aim for under 20 words on average.'));
  }
  {
    const st = c.stuffing.length ? 'fail' : 'pass';
    const top = c.density[0];
    checks.push(check('content', 'keyword_density', 'Keyword Density', st,
      top ? `${top.word} ${top.pct}%${c.stuffing.length ? ' (stuffing)' : ''}` : '—',
      st === 'pass' ? 'No keyword stuffing detected.'
        : `Possible keyword stuffing: ${c.stuffing.map((s) => `${s.word} ${s.pct}%`).join(', ')}.`));
  }
  {
    const issues = homeS.headings.issues;
    const st = homeS.headings.counts.h1 === 0 ? 'fail' : issues.length ? 'warn' : 'pass';
    checks.push(check('content', 'heading_structure', 'Heading Structure', st,
      Object.entries(homeS.headings.counts).map(([k, v]) => `${k.toUpperCase()}:${v}`).join('  '),
      issues.length ? issues.join(' ') : 'Headings follow a clean, logical hierarchy.'));
  }
  {
    const st = c.textHtmlRatio >= 10 ? 'pass' : c.textHtmlRatio >= 5 ? 'warn' : 'fail';
    checks.push(check('content', 'text_ratio', 'Text-to-HTML Ratio', st,
      `${c.textHtmlRatio}%`,
      st === 'pass' ? 'Good ratio of text to markup.'
        : 'Low text-to-code ratio; pages are heavy on markup vs. content.'));
  }
  // Thin pages across the site
  const thinPages = summaries.filter((s) => s.content.wordCount < 300);
  if (summaries.length > 1) {
    const st = thinPages.length === 0 ? 'pass' : thinPages.length <= summaries.length / 3 ? 'warn' : 'fail';
    checks.push(check('content', 'thin_pages', 'Thin Content (Site-wide)', st,
      `${thinPages.length}/${summaries.length} pages under 300 words`,
      st === 'pass' ? 'Pages generally have sufficient content.'
        : 'Several pages have very little content; expand or consolidate them.'));
  }

  // ---------------------------------------------------------------- LINKS
  const totalInternal = summaries.reduce((a, s) => a + s.internalLinks, 0);
  const totalExternal = summaries.reduce((a, s) => a + s.externalLinks, 0);
  const nofollow = allLinks.filter((l) => l.nofollow).length;
  const generic = allLinks.filter((l) => l.generic);
  const empties = allLinks.filter((l) => l.empty);
  const brokenInternal = linkResults.broken.filter((b) => b.kind === 'internal');
  const brokenExternal = linkResults.broken.filter((b) => b.kind === 'external');

  {
    const st = linkResults.broken.length === 0 ? 'pass' : 'fail';
    checks.push(check('links', 'broken_links', 'Broken Links', st,
      `${linkResults.broken.length} broken (${brokenInternal.length} internal, ${brokenExternal.length} external) of ${linkResults.checkedCount} checked`,
      st === 'pass' ? 'No broken links found.'
        : 'Broken links hurt UX and crawlability. Fix or remove them.'));
  }
  {
    const st = totalInternal > 0 ? 'pass' : 'warn';
    checks.push(check('links', 'internal_links', 'Internal Linking', st,
      `${totalInternal} internal, ${totalExternal} external`,
      st === 'pass' ? 'Pages are interlinked.' : 'Add internal links to help users and crawlers.'));
  }
  {
    const st = generic.length === 0 ? 'pass' : generic.length <= 5 ? 'warn' : 'fail';
    checks.push(check('links', 'anchor_text', 'Descriptive Anchor Text', st,
      `${generic.length} generic anchors (e.g. "click here")`,
      st === 'pass' ? 'Anchor text is descriptive.'
        : 'Replace generic anchors with descriptive, keyword-rich text.'));
  }
  {
    const st = empties.length === 0 ? 'pass' : 'warn';
    checks.push(check('links', 'empty_anchors', 'Empty Links', st,
      `${empties.length} links with no text/label`,
      st === 'pass' ? 'All links have text or labels.'
        : 'Some links have no anchor text or aria-label.'));
  }
  {
    const ratio = allLinks.length ? Math.round((nofollow / allLinks.length) * 100) : 0;
    checks.push(check('links', 'nofollow', 'Nofollow Links', 'pass',
      `${nofollow} nofollow (${ratio}%)`,
      'Breakdown of nofollow links across crawled pages.'));
  }

  // ----------------------------------------------- SITE-WIDE ON-PAGE
  const titleMap = new Map();
  const descMap = new Map();
  let missingTitle = 0, missingDesc = 0, missingH1 = 0;
  for (const s of summaries) {
    if (!s.title) missingTitle++; else titleMap.set(s.title, (titleMap.get(s.title) || 0) + 1);
    if (!s.desc) missingDesc++; else descMap.set(s.desc, (descMap.get(s.desc) || 0) + 1);
    if (s.h1 === 0) missingH1++;
  }
  const dupTitles = [...titleMap.entries()].filter(([, n]) => n > 1);
  const dupDescs = [...descMap.entries()].filter(([, n]) => n > 1);

  if (summaries.length > 1) {
    checks.push(check('onpage', 'dup_titles', 'Unique Title Tags',
      dupTitles.length ? 'fail' : 'pass',
      dupTitles.length ? `${dupTitles.length} duplicated title(s)` : 'All unique',
      dupTitles.length ? 'Duplicate titles across pages confuse search engines.'
        : 'Every crawled page has a unique title.'));
    checks.push(check('onpage', 'dup_descs', 'Unique Meta Descriptions',
      dupDescs.length ? 'warn' : 'pass',
      dupDescs.length ? `${dupDescs.length} duplicated description(s)` : 'All unique',
      dupDescs.length ? 'Duplicate meta descriptions reduce snippet relevance.'
        : 'Every crawled page has a unique description.'));
    checks.push(check('onpage', 'missing_meta', 'Missing Tags (Site-wide)',
      (missingTitle || missingDesc || missingH1) ? 'warn' : 'pass',
      `${missingTitle} no title, ${missingDesc} no description, ${missingH1} no H1`,
      (missingTitle || missingDesc || missingH1)
        ? 'Some pages are missing key SEO tags.' : 'All pages have title, description and H1.'));
  }

  // robots.txt
  checks.push(check('onpage', 'robots_txt', 'robots.txt',
    robotsTxt.found ? 'pass' : 'warn',
    robotsTxt.found ? (robotsTxt.hasSitemap ? 'Found (references sitemap)' : 'Found') : '(missing)',
    robotsTxt.found ? 'A robots.txt file is present.'
      : 'No robots.txt found. Add one to guide search-engine crawlers.'));

  // XML sitemap
  checks.push(check('onpage', 'sitemap', 'XML Sitemap',
    sitemapFound ? 'pass' : 'warn',
    sitemapFound ? 'Found' : '(not found)',
    sitemapFound ? 'An XML sitemap was found.'
      : 'No XML sitemap detected. Add /sitemap.xml and reference it in robots.txt.'));

  // SEO-friendly URLs (site-wide)
  const unfriendly = summaries.filter((s) => !isFriendlyUrl(s.url));
  checks.push(check('onpage', 'friendly_urls', 'SEO-Friendly URLs',
    unfriendly.length === 0 ? 'pass' : unfriendly.length <= summaries.length / 3 ? 'warn' : 'fail',
    `${summaries.length - unfriendly.length}/${summaries.length} clean URLs`,
    unfriendly.length === 0 ? 'URLs are short, lowercase and descriptive.'
      : 'Some URLs contain uppercase, underscores, spaces or long query strings.'));

  // ---------------------------------------------------------------- assemble
  const avgReadability = Math.round(
    summaries.reduce((a, s) => a + s.content.readability, 0) / (summaries.length || 1));
  const totalWords = summaries.reduce((a, s) => a + s.content.wordCount, 0);

  // Resolve server IP + nameservers for the Technology section.
  let ip = '', nameservers = [];
  try { ip = (await dns.lookup(baseHost)).address; } catch {}
  try { nameservers = (await dns.resolveNs(baseHost)).slice(0, 4); } catch {}

  const meta = {
    ...base.meta,
    keywordsDensity: c.density,
    phrases: c.phrases,
    consistency: c.consistency,
    readability: c.readability,
    readabilityLabel: c.readabilityLabel,
    gradeLevel: c.gradeLevel,
    serverIp: ip,
    nameservers,
  };

  const site = {
    pagesCrawled: htmlPages.length,
    sitemapFound,
    baseHost,
    summaries,
    homeHeadings: homeS.headings.list,
    broken: linkResults.broken,
    linkStats: {
      totalInternal, totalExternal, nofollow,
      generic: generic.length, empty: empties.length,
      checked: linkResults.checkedCount, unique: linkResults.uniqueCount,
    },
    contentStats: {
      avgReadability, totalWords, thinPages: thinPages.length,
      dupTitles: dupTitles.length, dupDescs: dupDescs.length,
      missingTitle, missingDesc, missingH1,
    },
  };

  return { url: base.url, categories: base.categories, checks, meta, site };
}
