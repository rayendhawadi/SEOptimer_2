// Renders a self-contained, multi-page HTML report (inline CSS). Used both for
// the on-screen result and as the source for the ~10-page PDF export. Major
// sections use CSS page breaks so the PDF paginates cleanly.
//
// Themed to the AI Commandos identity (agent: Atlas). The brand logo is inlined
// as SVG and the Atlas avatar as a data URI so the PDF stays self-contained.

import { PALETTE, logoSvg, ATLAS_AVATAR, FAVICON } from './brandAssets.js';
import { t } from './i18n.js';

const STATUS_META = {
  pass: { icon: '&#10003;', color: PALETTE.green, label: 'Pass' },
  warn: { icon: '!', color: PALETTE.atlas, label: 'Improve' },
  fail: { icon: '&#10007;', color: PALETTE.red, label: 'Error' },
};

const CAT_ORDER = ['onpage', 'content', 'links', 'usability', 'performance', 'accessibility', 'social', 'security'];

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function trunc(s, n) { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function shortUrl(u) { try { const x = new URL(u); return trunc(x.pathname + x.search || '/', 48); } catch { return trunc(u, 48); } }

function gradeColor(pct) {
  if (pct >= 80) return PALETTE.green;  // AI Commandos green
  if (pct >= 60) return '#6cc24a';
  if (pct >= 45) return PALETTE.atlas;  // Atlas orange
  return PALETTE.red;                   // AI Commandos red
}

function gauge(pct, grade, size = 120, onDark = false) {
  const r = (size - 16) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct / 100);
  const col = gradeColor(pct);
  const track = onDark ? 'rgba(255,255,255,.25)' : '#eef1f6';
  const txt = onDark ? '#fff' : col;
  const sub = onDark ? 'rgba(255,255,255,.8)' : '#64748b';
  return `
  <div class="gauge" style="width:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="10"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${onDark ? '#fff' : col}" stroke-width="10"
        stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"
        transform="rotate(-90 ${size / 2} ${size / 2})"/>
      <text x="50%" y="46%" text-anchor="middle" dominant-baseline="middle"
        font-size="${size * 0.28}" font-weight="800" fill="${txt}">${grade}</text>
      <text x="50%" y="66%" text-anchor="middle" dominant-baseline="middle"
        font-size="${size * 0.12}" fill="${sub}">${pct}/100</text>
    </svg>
  </div>`;
}

function checkRow(c) {
  const m = STATUS_META[c.status] || STATUS_META.warn;
  return `
  <div class="check">
    <div class="check-badge" style="background:${m.color}">${m.icon}</div>
    <div class="check-body">
      <div class="check-title">${esc(c.label)}</div>
      ${c.value ? `<div class="check-value">${esc(c.value)}</div>` : ''}
      ${c.detail ? `<div class="check-detail">${esc(c.detail)}</div>` : ''}
    </div>
  </div>`;
}

function categoryCard(cat, extra = '') {
  return `
  <section class="card">
    <div class="card-head">
      <h2>${esc(cat.label)}</h2>
      <div class="card-grade">
        ${gauge(cat.score, cat.grade, 84)}
        <div class="badge-counts">
          <span class="pill pass">${cat.counts.pass} pass</span>
          <span class="pill warn">${cat.counts.warn} improve</span>
          <span class="pill fail">${cat.counts.fail} error</span>
        </div>
      </div>
    </div>
    <div class="checks">${cat.checks.map(checkRow).join('')}</div>
    ${extra}
  </section>`;
}

function recRow(r) {
  const pc = { High: PALETTE.red, Medium: PALETTE.atlas, Low: PALETTE.green }[r.priority] || '#64748b';
  return `
  <div class="rec">
    <span class="rec-prio" style="background:${pc}">${esc(r.priority || '')}</span>
    <div>
      <div class="rec-title">${esc(r.title)} ${r.area ? `<span class="rec-area">${esc(r.area)}</span>` : ''}</div>
      <div class="rec-detail">${esc(r.detail || '')}</div>
    </div>
  </div>`;
}

export function renderReport({ analysis, scored, ai, screenshots, generatedAt, brand = {}, history = [], lang = 'fr' }) {
  const L = t(lang);
  const m = analysis.meta;
  const site = analysis.site || {};
  const brandName = brand.name || 'AI Commandos';
  const brandColor = brand.color || PALETTE.green;
  const brandColor2 = brand.color2 || PALETTE.noir;
  const brandLogo = brand.logo || '';        // external logo URL (optional override)
  const agent = brand.agent || 'Atlas';
  const cats = scored.categories;
  const getCat = (k) => cats[k];
  const orderedCats = CAT_ORDER.map(getCat).filter(Boolean);

  // ---- content widgets -----------------------------------------------------
  const densityTable = (m.keywordsDensity || []).slice(0, 10).map((k) => `
    <tr><td>${esc(k.word)}</td><td>${k.count}</td><td>${k.pct}%</td>
      <td><div class="bar"><span style="width:${Math.min(100, k.pct * 12)}%"></span></div></td></tr>`).join('');
  const phrasesHtml = (m.phrases || []).slice(0, 8)
    .map((p) => `<span class="chip">${esc(p.phrase)} <b>${p.count}</b></span>`).join('') || '<span class="muted">—</span>';

  const outline = (site.homeHeadings || []).slice(0, 30).map((h) =>
    `<div class="outline-row" style="padding-left:${(h.level - 1) * 18}px">
      <span class="h-tag h${h.level}">H${h.level}</span> ${esc(trunc(h.text, 90))}</div>`).join('') ||
    `<div class="muted">${L.noHeadings}</div>`;

  const yn = (b) => b ? '<span class="yes">&#10003;</span>' : '<span class="no">&#10007;</span>';
  const consistencyRows = (m.consistency || []).map((k) => `
    <tr><td>${esc(k.word)}</td><td>${k.count}</td>
      <td>${yn(k.inTitle)}</td><td>${yn(k.inDesc)}</td>
      <td>${yn(k.inHeadings)}</td><td>${yn(k.inUrl)}</td></tr>`).join('');

  const contentExtra = `
    <div class="subgrid">
      <div class="stat"><div class="stat-num">${m.readability ?? '—'}</div><div class="stat-lbl">Readability (${esc(m.readabilityLabel || '')})</div></div>
      <div class="stat"><div class="stat-num">${m.gradeLevel ?? '—'}</div><div class="stat-lbl">Grade level</div></div>
      <div class="stat"><div class="stat-num">${site.contentStats?.totalWords ?? m.wordCount ?? '—'}</div><div class="stat-lbl">Total words (site)</div></div>
      <div class="stat"><div class="stat-num">${site.contentStats?.avgReadability ?? '—'}</div><div class="stat-lbl">Avg readability</div></div>
    </div>
    <h3 class="sub-h">${L.keywordConsistency}</h3>
    <p class="muted" style="margin:0 0 6px">${L.keywordConsistencyDesc}</p>
    <table class="data kw-matrix"><thead><tr><th>Keyword</th><th>Uses</th><th>Title</th><th>Desc</th><th>Headings</th><th>URL</th></tr></thead>
      <tbody>${consistencyRows || '<tr><td colspan=6 class=muted>—</td></tr>'}</tbody></table>
    <h3 class="sub-h">${L.keywordDensity}</h3>
    <table class="data"><thead><tr><th>Keyword</th><th>Count</th><th>Density</th><th></th></tr></thead>
      <tbody>${densityTable || '<tr><td colspan=4 class=muted>—</td></tr>'}</tbody></table>
    <h3 class="sub-h">${L.commonPhrases}</h3>
    <div class="chips">${phrasesHtml}</div>
    <h3 class="sub-h">${L.headingOutline}</h3>
    <div class="outline">${outline}</div>`;

  // Google PageSpeed Insights section (real Lighthouse + Core Web Vitals).
  const psi = analysis.psi && (analysis.psi.mobile || analysis.psi.desktop);
  const RATE_COLOR = { good: '#22c55e', 'needs-improvement': '#f59e0b', poor: '#ef4444', unknown: '#94a3b8' };
  function cwvCard(label, metric, value, fmt) {
    if (value == null) return '';
    const t = { LCP: [2500, 4000], INP: [200, 500], CLS: [0.1, 0.25], FCP: [1800, 3000], TBT: [200, 600] }[metric];
    const r = !t ? 'unknown' : value <= t[0] ? 'good' : value <= t[1] ? 'needs-improvement' : 'poor';
    const col = RATE_COLOR[r];
    return `<div class="cwv" style="border-color:${col}33">
      <div class="cwv-val" style="color:${col}">${fmt(value)}</div>
      <div class="cwv-lbl">${label}</div>
      <div class="cwv-rate" style="background:${col}1a;color:${col}">${r.replace('-', ' ')}</div>
    </div>`;
  }
  let psiSection = '';
  if (psi) {
    const sc = psi.scores;
    const src = psi.field && psi.field.LCP != null ? psi.field : psi.lab;
    const isField = !!(psi.field && psi.field.LCP != null);
    const scoreGauge = (val, name) => val == null ? '' :
      `<div class="cell">${gauge(val, val >= 90 ? 'A' : val >= 50 ? 'B' : 'F', 76)}<div class="name">${name}</div></div>`;
    const oppRows = (psi.opportunities || []).map((o) =>
      `<tr><td>${esc(o.title)}</td><td>~${(o.savingsMs / 1000).toFixed(2)} s</td></tr>`).join('');
    psiSection = `
    <section class="page card">
      <div class="card-head"><h2>${L.pagespeed}</h2>
        <div class="muted">${esc(psi.strategy)} &middot; ${isField ? L.fieldData : L.labData}</div></div>
      <div class="overview-gauges" style="grid-template-columns:repeat(4,1fr)">
        ${scoreGauge(sc.performance, 'Performance')}
        ${scoreGauge(sc.seo, 'SEO')}
        ${scoreGauge(sc.accessibility, 'Accessibility')}
        ${scoreGauge(sc.bestPractices, 'Best Practices')}
      </div>
      <h3 class="sub-h">${L.coreWebVitals}</h3>
      <div class="cwv-grid">
        ${cwvCard('Largest Contentful Paint', 'LCP', src.LCP, (v) => (v / 1000).toFixed(2) + 's')}
        ${cwvCard('Cumulative Layout Shift', 'CLS', src.CLS, (v) => v.toFixed(3))}
        ${src.INP != null
        ? cwvCard('Interaction to Next Paint', 'INP', src.INP, (v) => Math.round(v) + 'ms')
        : cwvCard('First Contentful Paint', 'FCP', src.FCP, (v) => (v / 1000).toFixed(2) + 's')}
        ${cwvCard('Total Blocking Time', 'TBT', psi.lab.TBT, (v) => Math.round(v) + 'ms')}
      </div>
      ${oppRows ? `<h3 class="sub-h">${L.topOpportunities}</h3>
        <table class="data"><thead><tr><th>${L.optimization}</th><th>${L.estSavings}</th></tr></thead>
        <tbody>${oppRows}</tbody></table>` : ''}
    </section>`;
  }

  // SERP (Google search result) preview — shown in the On-Page section.
  let serpBread = site.baseHost || '';
  try { const u = new URL(analysis.url); serpBread = u.hostname.replace(/^www\./, '') + (u.pathname !== '/' ? ' › ' + u.pathname.split('/').filter(Boolean).join(' › ') : ''); } catch { }
  const serpDesc = (m.metaDesc || '').trim() || 'No meta description set — Google will generate a snippet from page content.';
  const schemaChips = (m.schemaTypes || []).length
    ? `<h3 class="sub-h">${L.structuredData}</h3>
       <div class="chips">${m.schemaTypes.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div>`
    : '';
  const onpageExtra = `
    <h3 class="sub-h">${L.searchPreview}</h3>
    <div class="serp">
      <div class="serp-bread">${esc(serpBread)}</div>
      <div class="serp-title">${esc(m.title || '(no title)')}</div>
      <div class="serp-desc">${esc(trunc(serpDesc, 160))}</div>
    </div>
    ${schemaChips}`;

  // Social presence grid.
  const PLATFORMS = [
    { keys: ['facebook'], label: 'Facebook' },
    { keys: ['twitter', 'x'], label: 'X / Twitter' },
    { keys: ['instagram'], label: 'Instagram' },
    { keys: ['linkedin'], label: 'LinkedIn' },
    { keys: ['youtube'], label: 'YouTube' },
    { keys: ['tiktok'], label: 'TikTok' },
    { keys: ['pinterest'], label: 'Pinterest' },
  ];
  const found = new Set(m.socialPlatforms || []);
  const socialCells = PLATFORMS.map((p) => {
    const on = p.keys.some((k) => found.has(k));
    return `<div class="soc ${on ? 'on' : 'off'}"><span>${esc(p.label)}</span><b>${on ? 'Connected' : '—'}</b></div>`;
  }).join('');
  const og = m.og || {};
  const ogImage = og['og:image'];
  const ogTitle = og['og:title'] || m.title || '';
  const ogDesc = og['og:description'] || m.metaDesc || '';
  const shareCard = `
    <h3 class="sub-h">${L.socialShare}</h3>
    <div class="share-card">
      ${ogImage ? `<div class="share-img"><img src="${esc(ogImage)}" alt="share image" onerror="this.parentNode.style.display='none'"/></div>`
      : `<div class="share-img share-img-empty">No og:image set</div>`}
      <div class="share-body">
        <div class="share-host">${esc(site.baseHost || '')}</div>
        <div class="share-title">${esc(trunc(ogTitle, 90) || '(no title)')}</div>
        <div class="share-desc">${esc(trunc(ogDesc, 130))}</div>
      </div>
    </div>`;
  const socialExtra = `
    <h3 class="sub-h">${L.socialPresence}</h3>
    <div class="social-grid">${socialCells}</div>
    ${shareCard}
    <h3 class="sub-h">${L.sharingTags}</h3>
    <div class="meta-grid">
      <div class="row"><span>Open Graph</span><span>${Object.keys(og).length ? 'Present (' + Object.keys(og).length + ' tags)' : 'Missing'}</span></div>
      <div class="row"><span>Twitter Card</span><span>${m.twitterCard ? esc(m.twitterCard) : 'Missing'}</span></div>
    </div>`;

  // Technology / server section.
  const ns = (m.nameservers || []).join(', ');
  const securityExtra = `
    <h3 class="sub-h">${L.serverTech}</h3>
    <div class="meta-grid">
      <div class="row"><span>Server IP</span><span>${esc(m.serverIp || 'n/a')}</span></div>
      <div class="row"><span>Web server</span><span>${esc(m.server || 'hidden')}</span></div>
      <div class="row"><span>Nameservers</span><span>${esc(trunc(ns, 60) || 'n/a')}</span></div>
      <div class="row"><span>Analytics</span><span>${esc(m.analytics || 'none')}</span></div>
    </div>
    <h3 class="sub-h">${L.techDetected}</h3>
    <div class="chips">${(m.tech || []).map((x) => `<span class="chip">${esc(x)}</span>`).join('') || '<span class="muted">Unknown</span>'}</div>`;

  // ---- links widgets -------------------------------------------------------
  const brokenRows = (site.broken || []).slice(0, 25).map((b) => `
    <tr><td><span class="status-bad">${esc(String(b.status))}</span></td>
      <td>${esc(b.kind)}</td>
      <td title="${esc(b.href)}">${esc(trunc(b.href, 60))}</td>
      <td>${esc(trunc((b.on || [])[0] || '', 40))}</td></tr>`).join('');
  const linksExtra = `
    <div class="subgrid">
      <div class="stat"><div class="stat-num">${site.linkStats?.totalInternal ?? 0}</div><div class="stat-lbl">Internal links</div></div>
      <div class="stat"><div class="stat-num">${site.linkStats?.totalExternal ?? 0}</div><div class="stat-lbl">External links</div></div>
      <div class="stat"><div class="stat-num">${(site.broken || []).length}</div><div class="stat-lbl">Broken links</div></div>
      <div class="stat"><div class="stat-num">${site.linkStats?.checked ?? 0}</div><div class="stat-lbl">Links checked</div></div>
    </div>
    <h3 class="sub-h">${L.brokenLinksH} ${(site.broken || []).length > 25 ? L.top25 : ''}</h3>
    ${brokenRows
      ? `<table class="data"><thead><tr><th>Status</th><th>Type</th><th>URL</th><th>Found on</th></tr></thead><tbody>${brokenRows}</tbody></table>`
      : `<div class="ok-box">${L.noBroken}</div>`}`;

  // ---- crawl / pages table -------------------------------------------------
  const pageRows = (site.summaries || []).slice(0, 30).map((s) => `
    <tr>
      <td title="${esc(s.url)}">${esc(shortUrl(s.url))}</td>
      <td class="${s.ok ? 'status-ok' : 'status-bad'}">${s.status}</td>
      <td>${s.titleLen}</td>
      <td>${s.descLen}</td>
      <td>${s.h1}</td>
      <td>${s.content.wordCount}</td>
      <td>${s.content.readability}</td>
    </tr>`).join('');

  // ---- previews ------------------------------------------------------------
  const screensHtml = screenshots
    ? `<div class="screens">
         <figure><img src="${screenshots.desktop}" alt="Desktop"/><figcaption>Desktop</figcaption></figure>
         ${screenshots.tablet ? `<figure class="tablet"><img src="${screenshots.tablet}" alt="Tablet"/><figcaption>Tablet</figcaption></figure>` : ''}
         <figure class="mobile"><img src="${screenshots.mobile}" alt="Mobile"/><figcaption>Mobile</figcaption></figure>
       </div>` : '';

  const quickWins = (ai.quickWins || []).length
    ? `<div class="quickwins"><h3>${L.quickWins}</h3><ul>${ai.quickWins.map((q) => `<li>${esc(q)}</li>`).join('')}</ul></div>` : '';

  const recsSection = (ai.recommendations || []).length ? `
    <section class="card">
      <div class="card-head"><h2>${L.prioritizedRecs}</h2>
        <div class="muted">${L.actionItems(ai.recommendations.length)}</div></div>
      <div class="recs">${ai.recommendations.map(recRow).join('')}</div>
    </section>` : '';

  // Small site thumbnail for the top of the report.
  const topPreview = screenshots
    ? `<div class="top-preview"><img src="${screenshots.desktop}" alt="Site preview"/></div>` : '';

  // Score history / trend (paid-tier monitoring feel).
  let trendHtml = '';
  const past = (history || []).filter((h) => typeof h.overall === 'number');
  if (past.length >= 1) {
    const series = [...past.map((h) => h.overall), scored.overall];
    const last = past[past.length - 1];
    const delta = scored.overall - last.overall;
    const w = 180, h = 40, max = 100;
    const step = series.length > 1 ? w / (series.length - 1) : 0;
    const pts = series.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`).join(' ');
    const dcol = delta > 0 ? '#22c55e' : delta < 0 ? '#ef4444' : '#64748b';
    const lastDate = (() => { try { return new Date(last.ts).toISOString().slice(0, 10); } catch { return ''; } })();
    trendHtml = `
      <div class="trend">
        <div>
          <div class="trend-h">${L.scoreTrend}</div>
          <div class="trend-sub">${L.prevAudits(past.length)} · ${L.lastWord} ${esc(lastDate)}</div>
          <div class="trend-delta" style="color:${dcol}">${delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '● '}${L.ptsSince(delta)}</div>
        </div>
        <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
          <polyline points="${pts}" fill="none" stroke="${brandColor}" stroke-width="2" stroke-linejoin="round"/>
          ${series.map((v, i) => `<circle cx="${(i * step).toFixed(1)}" cy="${(h - (v / max) * h).toFixed(1)}" r="2.5" fill="${brandColor}"/>`).join('')}
        </svg>
      </div>`;
  }

  // Deeper Lighthouse issues (accessibility + best practices).
  const issueList = (arr) => (arr || []).map((x) =>
    `<div class="issue"><div class="issue-t">${esc(x.title)}</div><div class="issue-d">${esc(x.description)}</div></div>`).join('');
  let a11ySection = '';
  if (psi && psi.issues) {
    const a11y = psi.issues.accessibility || [];
    const bp = psi.issues.bestPractices || [];
    if (a11y.length || bp.length) {
      a11ySection = `
      <section class="page card">
        <div class="card-head"><h2>${L.a11yBP}</h2>
          <div class="muted">${L.fromLighthouse}</div></div>
        ${a11y.length ? `<h3 class="sub-h">${L.a11yIssues(a11y.length)}</h3><div class="issues">${issueList(a11y)}</div>` : ''}
        ${bp.length ? `<h3 class="sub-h">${L.bpIssues(bp.length)}</h3><div class="issues">${issueList(bp)}</div>` : ''}
      </section>`;
    }
  }

  const aiNote = ai.provider && !['none', 'fallback'].includes(ai.provider)
    ? L.aiBy(esc(ai.provider)) : '';

  return `<!DOCTYPE html>
<html lang="${lang}"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Rapport SEO — ${esc(analysis.url)} · ${esc(brandName)}</title>
<link rel="icon" href="${FAVICON}"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Inter", -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    margin: 0; color: #1e293b; background: #f2f6f6; font-size: 13px; }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 16px; }
  h1, h2, .brandname, .cover .kicker { font-family: "Space Grotesk", "Segoe UI", system-ui, sans-serif; }
  h2 { font-size: 17px; margin: 0; }
  /* brand accent bar before each section title */
  .card-head h2, .card > h2 { position: relative; padding-left: 13px; }
  .card-head h2::before, .card > h2::before { content: ""; position: absolute; left: 0; top: 3px; bottom: 3px;
    width: 4px; border-radius: 3px; background: ${PALETTE.green}; }
  h3.sub-h { font-size: 13.5px; margin: 18px 0 8px; color: #334155;
    border-left: 3px solid ${PALETTE.green}55; padding-left: 8px; }
  .muted { color: #94a3b8; }

  /* page-break helpers (apply in print/PDF) */
  .page { break-before: page; }
  .cover { break-after: page; }

  /* cover */
  .cover { position:relative; overflow:hidden;
    background: linear-gradient(140deg,${PALETTE.noir},${PALETTE.green}); color:#fff;
    border-radius: 18px; padding: 52px 44px; text-align:center; margin-bottom: 18px; }
  /* subtle brand glow accents on the cover */
  .cover::before { content:""; position:absolute; top:-40%; right:-10%; width:420px; height:420px;
    background: radial-gradient(circle, rgba(237,69,20,.35), transparent 65%); pointer-events:none; }
  .cover::after { content:""; position:absolute; bottom:-45%; left:-8%; width:380px; height:380px;
    background: radial-gradient(circle, rgba(10,190,159,.35), transparent 65%); pointer-events:none; }
  .cover > * { position:relative; }
  .cover .brandbar { margin-bottom: 20px; display:flex; justify-content:center; }
  .cover .brandbar svg { height:40px; width:auto; }
  .cover .brandlogo { max-height: 44px; max-width: 220px; }
  .cover .brandname { font-size: 20px; font-weight: 700; letter-spacing: .5px; }
  .cover .kicker { letter-spacing: 4px; text-transform: uppercase; font-size: 12px; opacity:.85;
    font-weight:600; color:#fff; }
  .cover h1 { font-size: 30px; margin: 10px 0 4px; font-weight:700; }
  .cover .url { font-size: 16px; opacity:.9; word-break: break-all; }
  .cover .big-gauge { margin: 26px auto 10px; }
  .cover .date { opacity:.75; font-size: 13px; margin-top: 10px; }
  .cover .mini-cats { display:flex; justify-content:center; gap:10px; flex-wrap:wrap; margin-top:22px; }
  .cover .mini-cats .mc { background: rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.14);
    border-radius:10px; padding:8px 12px; font-size:12px; }
  .cover .mini-cats .mc b { font-size:16px; display:block; }
  /* "Delivered by Atlas" agent chip on the cover */
  .agentchip { display:inline-flex; align-items:center; gap:10px; margin-top:22px;
    background: rgba(10,12,17,.34); border:1px solid rgba(255,255,255,.16);
    border-radius:999px; padding:7px 16px 7px 7px; }
  .agentchip img { width:34px; height:34px; border-radius:50%; object-fit:cover;
    border:2px solid ${PALETTE.green}; background:${PALETTE.noir}; }
  .agentchip .a-name { font-family:"Space Grotesk",sans-serif; font-weight:700; letter-spacing:1.5px;
    font-size:12px; }
  .agentchip .a-role { font-size:10.5px; opacity:.8; letter-spacing:.4px; }

  .card { background:#fff; border-radius:14px; padding:20px 22px; margin-top:16px;
    box-shadow:0 1px 3px rgba(0,0,0,.06); }
  .card-head { display:flex; justify-content:space-between; align-items:center;
    border-bottom:1px solid #eef1f6; padding-bottom:12px; margin-bottom:12px; flex-wrap:wrap; gap:12px; }
  .card-grade { display:flex; align-items:center; gap:12px; }
  .badge-counts { display:flex; flex-direction:column; gap:4px; }
  .pill { font-size:11px; padding:2px 8px; border-radius:999px; font-weight:600; white-space:nowrap; }
  .pill.pass { background:#dcfce7; color:#166534; }
  .pill.warn { background:#fef3c7; color:#92400e; }
  .pill.fail { background:#fee2e2; color:#991b1b; }

  .check { display:flex; gap:11px; padding:10px 0; border-bottom:1px solid #f3f4f6; }
  .check:last-child { border-bottom:none; }
  .check-badge { flex:0 0 22px; width:22px; height:22px; border-radius:50%; color:#fff;
    display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; }
  .check-title { font-weight:600; }
  .check-value { color:#0f172a; margin-top:2px; word-break:break-word; }
  .check-detail { color:#64748b; margin-top:3px; line-height:1.45; }

  .overview-gauges { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
  .overview-gauges .cell { background:#fff; border-radius:12px; padding:12px 8px; text-align:center;
    box-shadow:0 1px 3px rgba(0,0,0,.06); }
  .overview-gauges .name { font-size:11.5px; color:#64748b; margin-top:6px; min-height:28px; }

  .summary { background:#fff; border-radius:14px; padding:18px 20px; margin-top:16px;
    box-shadow:0 1px 3px rgba(0,0,0,.06); }
  .summary p { margin:0 0 10px; line-height:1.55; }
  .summary-flex { display:flex; gap:20px; align-items:flex-start; }
  .summary-text { flex:1; min-width:0; }
  .top-preview { flex:0 0 240px; }
  .top-preview img { width:240px; border:1px solid #e2e8f0; border-radius:8px; max-height:200px; object-fit:cover; object-position:top; }
  @media (max-width:680px){ .summary-flex{flex-direction:column;} .top-preview{flex-basis:auto;} .top-preview img{width:100%;} }
  .quickwins { background:#ecfdf5; border:1px solid #a7f3d0; border-radius:12px; padding:12px 16px; margin-top:12px; }
  .quickwins h3 { margin:0 0 8px; font-size:13px; color:#065f46; }
  .quickwins ul { margin:0; padding-left:18px; } .quickwins li { margin:4px 0; line-height:1.4; }

  .subgrid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin:6px 0 4px; }
  .stat { background:#f8fafc; border:1px solid #eef1f6; border-radius:10px; padding:10px; text-align:center; }
  .stat-num { font-size:20px; font-weight:800; color:${PALETTE.greenDark}; }
  .stat-lbl { font-size:11px; color:#64748b; margin-top:2px; }

  table.data { width:100%; border-collapse:collapse; margin-top:6px; font-size:12px; }
  table.data th { text-align:left; color:#64748b; font-weight:600; border-bottom:2px solid #eef1f6; padding:7px 8px; }
  table.data td { border-bottom:1px solid #f3f4f6; padding:7px 8px; vertical-align:top; }
  .status-ok { color:#166534; font-weight:600; } .status-bad { color:#991b1b; font-weight:700; }
  .bar { background:#eef1f6; border-radius:6px; height:8px; width:90px; overflow:hidden; }
  .bar span { display:block; height:100%; background:${PALETTE.green}; }
  .chips { display:flex; flex-wrap:wrap; gap:6px; }
  .chip { background:#e6faf5; color:${PALETTE.greenDark}; border-radius:999px; padding:4px 10px; font-size:12px; }
  .chip b { color:#065247; }
  .ok-box { background:#ecfdf5; border:1px solid #a7f3d0; color:#065f46; padding:10px 14px; border-radius:10px; }
  .scope-note { background:#f8fafc; border:1px solid #eef1f6; border-left:3px solid ${PALETTE.atlas};
    border-radius:0 10px 10px 0; padding:10px 14px; font-size:12px; color:#475569; line-height:1.5; margin-top:6px; }
  .scope-note b { color:#334155; }

  .kw-matrix td:nth-child(n+3){ text-align:center; }
  .yes { color:#22c55e; font-weight:700; } .no { color:#ef4444; font-weight:700; }

  .serp { border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px; background:#fff; max-width:600px; }
  .serp-bread { font-size:12.5px; color:#202124; }
  .serp-title { color:#1a0dab; font-size:18px; line-height:1.3; margin:2px 0 3px; font-family:arial,sans-serif; }
  .serp-desc { color:#4d5156; font-size:13px; line-height:1.5; font-family:arial,sans-serif; }

  .cwv-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
  .cwv { border:2px solid #eef1f6; border-radius:12px; padding:14px 10px; text-align:center; }
  .cwv-val { font-size:22px; font-weight:800; }
  .cwv-lbl { font-size:11px; color:#64748b; margin:4px 0 6px; line-height:1.3; min-height:28px; }
  .cwv-rate { display:inline-block; font-size:10.5px; font-weight:700; padding:2px 8px; border-radius:999px; text-transform:capitalize; }

  .social-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
  .soc { border:1px solid #eef1f6; border-radius:10px; padding:10px; text-align:center; font-size:12px; }
  .soc.on { background:#ecfdf5; border-color:#a7f3d0; } .soc.off { background:#f8fafc; color:#94a3b8; }
  .soc span { display:block; } .soc b { font-size:11px; }
  .soc.on b { color:#059669; }

  .outline { border-left:3px solid #e2e8f0; padding-left:8px; }
  .outline-row { padding:3px 0; font-size:12.5px; }
  .h-tag { display:inline-block; font-size:10px; font-weight:700; color:#fff; border-radius:4px; padding:1px 5px; margin-right:6px; }
  .h-tag.h1{background:${PALETTE.greenDark};} .h-tag.h2{background:${PALETTE.green};} .h-tag.h3{background:#4fd6bf;}
  .h-tag.h4,.h-tag.h5,.h-tag.h6{background:#94a3b8;}

  .recs .rec { display:flex; gap:11px; padding:11px 0; border-bottom:1px solid #f3f4f6; }
  .recs .rec:last-child { border-bottom:none; }
  .rec-prio { flex:0 0 auto; align-self:flex-start; color:#fff; font-size:11px; font-weight:700; padding:3px 9px; border-radius:6px; }
  .rec-title { font-weight:600; } .rec-area { font-weight:500; font-size:11px; color:#64748b; background:#f1f5f9; padding:1px 7px; border-radius:6px; margin-left:6px; }
  .rec-detail { color:#475569; margin-top:3px; line-height:1.45; }

  .screens { display:flex; gap:18px; align-items:flex-start; flex-wrap:wrap; }
  .screens figure { margin:0; text-align:center; }
  .screens img { max-width:100%; border:1px solid #e2e8f0; border-radius:8px; vertical-align:top; }
  .screens figure:not(.mobile):not(.tablet) img { width:420px; }
  .screens figure.tablet img { width:200px; }
  .screens figure.mobile img { width:130px; }
  .screens figcaption { font-size:12px; color:#64748b; margin-top:6px; }

  .share-card { max-width:520px; border:1px solid #dadde1; border-radius:10px; overflow:hidden; background:#fff; }
  .share-img img { width:100%; max-height:260px; object-fit:cover; display:block; }
  .share-img-empty { background:#f0f2f5; color:#94a3b8; text-align:center; padding:40px 0; font-size:13px; }
  .share-body { padding:10px 14px; background:#f7f8fa; }
  .share-host { font-size:11px; letter-spacing:.4px; text-transform:uppercase; color:#65676b; }
  .share-title { font-size:16px; font-weight:700; color:#1c1e21; margin:3px 0; line-height:1.3; }
  .share-desc { font-size:13px; color:#606770; line-height:1.4; }

  .trend { background:#fff; border-radius:14px; padding:16px 20px; margin-top:16px; box-shadow:0 1px 3px rgba(0,0,0,.06);
    display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap; }
  .trend-h { font-weight:700; font-size:15px; }
  .trend-sub { font-size:12px; color:#94a3b8; margin-top:2px; }
  .trend-delta { font-size:13px; font-weight:700; margin-top:6px; }
  .issues { display:flex; flex-direction:column; gap:8px; }
  .issue { border-left:3px solid #f59e0b; background:#fffbeb; border-radius:0 8px 8px 0; padding:8px 12px; }
  .issue-t { font-weight:600; font-size:13px; }
  .issue-d { font-size:12px; color:#64748b; margin-top:2px; line-height:1.4; }

  .meta-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:6px 24px; }
  .meta-grid .row { display:flex; justify-content:space-between; border-bottom:1px dashed #eef1f6; padding:6px 0; }
  .meta-grid .row span:first-child { color:#64748b; }
  .sec-title { font-size:12px; letter-spacing:2px; text-transform:uppercase; color:${PALETTE.greenDark};
    font-weight:700; margin:4px 0 0; display:inline-flex; align-items:center; gap:8px; }
  .sec-title::before { content:""; width:16px; height:3px; border-radius:2px; background:${PALETTE.green}; display:inline-block; }
  .foot { text-align:center; color:#94a3b8; font-size:11px; padding:20px 0; }
  @media (max-width:760px){ .overview-gauges,.subgrid,.social-grid,.cwv-grid{grid-template-columns:repeat(2,1fr);} .meta-grid{grid-template-columns:1fr;} }
</style>
</head>
<body>
<div class="wrap">

  <!-- PAGE 1 — COVER -->
  <section class="cover" style="background:linear-gradient(140deg,${brandColor2},${brandColor})">
    <div class="brandbar">
      ${brandLogo ? `<img class="brandlogo" src="${esc(brandLogo)}" alt="${esc(brandName)}"/>` : logoSvg(40)}
    </div>
    <div class="kicker">${L.auditReport}</div>
    <h1>${esc(site.baseHost || analysis.url)}</h1>
    <div class="url">${esc(analysis.url)}</div>
    <div class="big-gauge">${gauge(scored.overall, scored.overallGrade, 170, true)}</div>
    <div style="font-size:15px;opacity:.9">${L.overallScore} ${scored.overall}/100</div>
    <div class="mini-cats">
      ${orderedCats.map((c) => `<div class="mc">${esc(c.label)}<b>${c.grade}</b></div>`).join('')}
    </div>
    <div class="agentchip">
      <img src="${ATLAS_AVATAR}" alt="${esc(agent)}"/>
      <div style="text-align:left">
        <div class="a-name">${esc(agent.toUpperCase())}</div>
        <div class="a-role">${L.agentRole}</div>
      </div>
    </div>
    <div class="date">${L.generated} ${esc(generatedAt)} &middot; ${L.pagesAnalyzed(site.pagesCrawled || 1)}</div>
  </section>

  <!-- PAGE 2 — OVERVIEW -->
  <p class="sec-title">${L.scoreOverview}</p>
  <div class="overview-gauges">
    ${orderedCats.map((c) => `<div class="cell">${gauge(c.score, c.grade, 76)}<div class="name">${esc(c.label)}</div></div>`).join('')}
  </div>
  <div class="summary summary-flex">
    <div class="summary-text">
      <p>${esc(ai.executiveSummary || '')}</p>
      ${quickWins}
    </div>
    ${topPreview}
  </div>
  ${trendHtml}

  <!-- PAGE 3 — TOP RECOMMENDATIONS (like SEOptimer) -->
  ${recsSection}

  <!-- CRAWL OVERVIEW -->
  <section class="page card">
    <div class="card-head"><h2>${L.crawlOverview}</h2>
      <div class="muted">${L.crawlSub(site.pagesCrawled || 1, site.sitemapFound)}</div></div>
    <div class="subgrid">
      <div class="stat"><div class="stat-num">${site.pagesCrawled || 1}</div><div class="stat-lbl">${L.pagesCrawled}</div></div>
      <div class="stat"><div class="stat-num">${site.contentStats?.totalWords ?? '—'}</div><div class="stat-lbl">${L.totalWords}</div></div>
      <div class="stat"><div class="stat-num">${site.linkStats?.checked ?? 0}</div><div class="stat-lbl">${L.linksVerified}</div></div>
      <div class="stat"><div class="stat-num">${(site.broken || []).length}</div><div class="stat-lbl">${L.brokenLinks}</div></div>
    </div>
    <h3 class="sub-h">${L.pages} ${(site.summaries || []).length > 30 ? L.first30 : ''}</h3>
    <table class="data">
      <thead><tr><th>Page</th><th>Status</th><th>Title</th><th>Desc</th><th>H1</th><th>Words</th><th>Read.</th></tr></thead>
      <tbody>${pageRows || '<tr><td colspan=7 class=muted>—</td></tr>'}</tbody>
    </table>
  </section>

  <!-- PAGE 4 — ON-PAGE -->
  ${getCat('onpage') ? `<div class="page">${categoryCard(getCat('onpage'), onpageExtra)}</div>` : ''}

  <!-- PAGE 5 — CONTENT -->
  ${getCat('content') ? `<div class="page">${categoryCard(getCat('content'), contentExtra)}</div>` : ''}

  <!-- PAGE 6 — LINKS -->
  ${getCat('links') ? `<div class="page">${categoryCard(getCat('links'), linksExtra)}</div>` : ''}

  <!-- PAGE 7 — PERFORMANCE -->
  ${getCat('performance') ? `<div class="page">${categoryCard(getCat('performance'))}</div>` : ''}

  <!-- PAGE 7b — GOOGLE PAGESPEED -->
  ${psiSection}

  <!-- ACCESSIBILITY & BEST PRACTICES -->
  ${a11ySection}

  <!-- PAGE 7c — ACCESSIBILITY (WCAG, axe-core) -->
  ${getCat('accessibility') ? `<div class="page">${categoryCard(getCat('accessibility'),
    `<div class="scope-note"><b>${L.a11yScope}</b> ${L.a11yScopeBody}</div>`)}</div>` : ''}
  
  <!-- PAGE 8 — USABILITY + PREVIEW -->
  <div class="page">
    ${getCat('usability') ? categoryCard(getCat('usability')) : ''}
    ${screensHtml ? `<section class="card"><div class="card-head"><h2>${L.preview}</h2></div>${screensHtml}</section>` : ''}
  </div>

  <!-- PAGE 9 — SOCIAL -->
  <div class="page">
    ${getCat('social') ? categoryCard(getCat('social'), socialExtra) : ''}
  </div>

  <!-- PAGE 10 — SECURITY & TECHNOLOGY -->
  <div class="page">
    ${getCat('security') ? categoryCard(getCat('security'), securityExtra) : ''}
  </div>

  <!-- PAGE 11 — PAGE DETAILS -->
  <section class="page card">
    <div class="card-head"><h2>${L.technicalDetails}</h2></div>
    <div class="meta-grid">
      <div class="row"><span>Title length</span><span>${m.titleLen} chars</span></div>
      <div class="row"><span>Meta description</span><span>${m.descLen} chars</span></div>
      <div class="row"><span>Homepage words</span><span>${m.wordCount}</span></div>
      <div class="row"><span>Readability</span><span>${m.readability ?? '—'} (${esc(m.readabilityLabel || '')})</span></div>
      <div class="row"><span>H1 tags (home)</span><span>${m.h1.length}</span></div>
      <div class="row"><span>Images (missing ALT)</span><span>${m.images.total} (${m.images.missingAlt})</span></div>
      <div class="row"><span>Internal / external links</span><span>${site.linkStats?.totalInternal ?? m.links.internal} / ${site.linkStats?.totalExternal ?? m.links.external}</span></div>
      <div class="row"><span>Duplicate titles / descriptions</span><span>${site.contentStats?.dupTitles ?? 0} / ${site.contentStats?.dupDescs ?? 0}</span></div>
      <div class="row"><span>Page size</span><span>${m.pageKb} KB</span></div>
      <div class="row"><span>Requests</span><span>${m.reqCount ?? 'n/a'}</span></div>
      <div class="row"><span>Load time</span><span>${(m.loadMs / 1000).toFixed(2)} s</span></div>
      <div class="row"><span>HTTPS</span><span>${m.isHttps ? 'Yes' : 'No'}</span></div>
      <div class="row"><span>HTTP status</span><span>${m.status}</span></div>
      <div class="row"><span>Technology</span><span>${esc(m.tech.join(', ') || 'Unknown')}</span></div>
    </div>
  </section>

  <div class="foot">
    ${L.preparedBy} ${esc(brandName)} &middot; ${L.agentWord} ${esc(agent)}${aiNote}
    ${brand.website ? ` &middot; ${esc(brand.website)}` : ''}${brand.email ? ` &middot; ${esc(brand.email)}` : ''}${brand.phone ? ` &middot; ${esc(brand.phone)}` : ''}
  </div>
</div>
</body></html>`;
}
