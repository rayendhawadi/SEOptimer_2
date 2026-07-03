// Renders the competitor-comparison report (self-contained HTML) used both on
// screen and for the PDF export. Themed to the AI Commandos identity (Atlas).

import { PALETTE, logoSvg, ATLAS_AVATAR, FAVICON } from './brandAssets.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function gradeColor(pct) {
  if (pct >= 80) return PALETTE.green;  // AI Commandos green
  if (pct >= 60) return '#6cc24a';
  if (pct >= 45) return PALETTE.atlas;  // Atlas orange
  return PALETTE.red;                   // AI Commandos red
}
function gauge(pct, grade, size = 64, onDark = false) {
  const r = (size - 12) / 2, c = 2 * Math.PI * r, off = c * (1 - pct / 100), col = gradeColor(pct);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${onDark ? 'rgba(255,255,255,.25)' : '#eef1f6'}" stroke-width="7"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${onDark ? '#fff' : col}" stroke-width="7"
      stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="46%" text-anchor="middle" dominant-baseline="middle" font-size="${size * 0.3}" font-weight="800" fill="${onDark ? '#fff' : col}">${grade}</text>
    <text x="50%" y="68%" text-anchor="middle" dominant-baseline="middle" font-size="${size * 0.16}" fill="${onDark ? 'rgba(255,255,255,.8)' : '#64748b'}">${pct}</text>
  </svg>`;
}

// Series colours for the site columns — your site (green) leads the palette.
const COLORS = [PALETTE.green, PALETTE.atlas, '#52cdf4', PALETTE.red];

export function renderComparison(cmp, { brand = {}, lang = 'fr' } = {}) {
  const { sites, categories, winners, gaps, ai } = cmp;
  const fr = lang === 'fr';
  const T = (en, frStr) => (fr ? frStr : en); // inline bilingual helper
  const brandName = brand.name || 'AI Commandos';
  const brandColor = brand.color || PALETTE.green;
  const brandColor2 = brand.color2 || PALETTE.noir;
  const brandLogo = brand.logo || '';
  const agent = brand.agent || 'Atlas';
  const valid = sites.filter((s) => !s.error);
  const catLabel = (k) => (valid.find((s) => s.categories[k])?.categories[k]?.label) || k;

  // Scorecard table: rows = categories, columns = sites.
  const headRow = sites.map((s, i) => `
    <th class="${s.error ? '' : ''}">
      <span class="dot" style="background:${COLORS[i % COLORS.length]}"></span>
      ${esc(s.host)}${i === 0 ? ` <span class="you">${T('YOU', 'VOUS')}</span>` : ''}
    </th>`).join('');

  const overallRow = `
    <tr class="overall-row">
      <td>${T('Overall', 'Global')}</td>
      ${sites.map((s, i) => s.error
        ? `<td class="err">${T('error', 'erreur')}</td>`
        : `<td class="${winners.overall === i ? 'win' : ''}">
             <div class="cell-grade" style="color:${gradeColor(s.overall)}">${s.grade}</div>
             <div class="cell-score">${s.overall}/100</div>
             ${winners.overall === i ? `<div class="win-tag">${T('winner', 'gagnant')}</div>` : ''}
           </td>`).join('')}
    </tr>`;

  const catRows = categories.map((cat) => `
    <tr>
      <td>${esc(catLabel(cat))}</td>
      ${sites.map((s, i) => {
        if (s.error) return '<td class="err">—</td>';
        const c = s.categories[cat] || { score: 0, grade: '-' };
        const win = winners[cat] === i;
        return `<td class="${win ? 'win' : ''}">
          <div class="cell-grade" style="color:${gradeColor(c.score)}">${c.grade}</div>
          <div class="cell-bar"><span style="width:${c.score}%;background:${gradeColor(c.score)}"></span></div>
          <div class="cell-score">${c.score}</div>
          ${win ? `<div class="win-tag">${T('best', 'meilleur')}</div>` : ''}
        </td>`;
      }).join('')}
    </tr>`).join('');

  // Metrics comparison.
  const metricRow = (label, fmt, getv, lowerBetter) => {
    const vals = valid.map((s) => getv(s));
    const best = lowerBetter ? Math.min(...vals.filter((v) => v != null)) : Math.max(...vals.filter((v) => v != null));
    return `<tr><td>${label}</td>${sites.map((s) => {
      if (s.error) return '<td class="err">—</td>';
      const v = getv(s);
      const isBest = v != null && v === best;
      return `<td class="${isBest ? 'win' : ''}">${v == null ? '—' : fmt(v)}</td>`;
    }).join('')}</tr>`;
  };

  const gapsHtml = (gaps || []).filter((g) => g.delta > 0).slice(0, 8).map((g) => `
    <div class="gap">
      <div class="gap-cat">${esc(g.category)}</div>
      <div class="gap-bar">
        <div class="gap-mine" style="width:${g.mine}%">${g.mine}</div>
        <div class="gap-theirs" style="left:${g.theirs}%"></div>
      </div>
      <div class="gap-note">${T(`${esc(g.rival)} leads by <b>${g.delta}</b> pts`, `${esc(g.rival)} devance de <b>${g.delta}</b> pts`)} (${g.theirs} vs ${g.mine})</div>
    </div>`).join('') || `<div class="ok-box">${T('✓ Your site leads or ties in every category.', '✓ Votre site est en tête ou à égalité dans toutes les catégories.')}</div>`;

  const recRow = (r) => {
    const pc = { High: PALETTE.red, Medium: PALETTE.atlas, Low: PALETTE.green }[r.priority] || '#64748b';
    return `<div class="rec"><span class="rec-prio" style="background:${pc}">${esc(r.priority || '')}</span>
      <div><div class="rec-title">${esc(r.title)}</div><div class="rec-detail">${esc(r.detail || '')}</div></div></div>`;
  };

  const shots = valid.filter((s) => s.screenshot).map((s, i) => `
    <figure><img src="${s.screenshot}" alt="${esc(s.host)}"/><figcaption>${esc(s.host)}</figcaption></figure>`).join('');

  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Comparatif Concurrents — ${esc(cmp.primaryHost)} · ${esc(brandName)}</title>
<link rel="icon" href="${FAVICON}"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<style>
  *{box-sizing:border-box;} body{font-family:"Inter",-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;margin:0;color:#1e293b;background:#f2f6f6;font-size:13px;}
  .wrap{max-width:1080px;margin:0 auto;padding:16px;}
  h1,h2,.cover .kicker{font-family:"Space Grotesk","Segoe UI",system-ui,sans-serif;}
  .card h2{position:relative;padding-left:13px;}
  .card h2::before{content:"";position:absolute;left:0;top:2px;bottom:2px;width:4px;border-radius:3px;background:${PALETTE.green};}
  .cover{position:relative;overflow:hidden;background:linear-gradient(140deg,${PALETTE.noir},${PALETTE.green});color:#fff;border-radius:18px;padding:40px;text-align:center;margin-bottom:18px;}
  .cover::before{content:"";position:absolute;top:-40%;right:-10%;width:360px;height:360px;background:radial-gradient(circle,rgba(237,69,20,.32),transparent 65%);}
  .cover::after{content:"";position:absolute;bottom:-45%;left:-8%;width:320px;height:320px;background:radial-gradient(circle,rgba(10,190,159,.32),transparent 65%);}
  .cover>*{position:relative;}
  .cover .brandbar{display:flex;justify-content:center;margin-bottom:16px;}
  .cover .brandbar svg{height:36px;width:auto;}
  .cover .kicker{letter-spacing:4px;text-transform:uppercase;font-size:12px;opacity:.85;font-weight:600;}
  .cover h1{font-size:26px;margin:8px 0;font-weight:700;}
  .cover .vs{display:flex;justify-content:center;gap:14px;flex-wrap:wrap;margin-top:18px;}
  .cover .vs .v{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:10px 16px;}
  .cover .vs .v .h{font-size:13px;opacity:.85;} .cover .vs .v .g{font-size:22px;font-weight:800;}
  .cover .agentchip{display:inline-flex;align-items:center;gap:10px;margin-top:18px;background:rgba(10,12,17,.34);border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:6px 15px 6px 6px;}
  .cover .agentchip img{width:30px;height:30px;border-radius:50%;object-fit:cover;border:2px solid ${PALETTE.green};background:${PALETTE.noir};}
  .cover .agentchip b{font-family:"Space Grotesk",sans-serif;letter-spacing:1.5px;font-size:11.5px;}
  .card{background:#fff;border-radius:14px;padding:20px 22px;margin-top:16px;box-shadow:0 1px 3px rgba(0,0,0,.06);}
  .card h2{margin:0 0 14px;font-size:17px;}
  table.score{width:100%;border-collapse:collapse;}
  table.score th,table.score td{padding:10px 8px;text-align:center;border-bottom:1px solid #f1f5f9;}
  table.score th:first-child,table.score td:first-child{text-align:left;font-weight:600;color:#334155;}
  table.score th{font-size:12px;color:#1e293b;border-bottom:2px solid #e2e8f0;}
  .dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:4px;}
  .you{background:${PALETTE.green};color:${PALETTE.noir};font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;vertical-align:middle;}
  .cell-grade{font-size:18px;font-weight:800;}
  .cell-score{font-size:11px;color:#64748b;}
  .cell-bar{background:#eef1f6;border-radius:5px;height:6px;width:70px;margin:4px auto;overflow:hidden;}
  .cell-bar span{display:block;height:100%;}
  td.win{background:#e6faf5;border-radius:8px;}
  .win-tag{font-size:9px;font-weight:700;color:${PALETTE.greenDark};text-transform:uppercase;margin-top:2px;}
  .overall-row td{background:#f8fafc;} .overall-row td.win{background:#d3f5ec;}
  td.err{color:${PALETTE.red};}
  .gap{margin:12px 0;}
  .gap-cat{font-weight:600;margin-bottom:4px;}
  .gap-bar{position:relative;background:#eef1f6;border-radius:6px;height:20px;}
  .gap-mine{background:${PALETTE.green};color:${PALETTE.noir};font-weight:600;height:100%;border-radius:6px 0 0 6px;font-size:11px;line-height:20px;padding-left:6px;min-width:18px;}
  .gap-theirs{position:absolute;top:-3px;width:3px;height:26px;background:${PALETTE.red};}
  .gap-note{font-size:11.5px;color:#64748b;margin-top:3px;}
  .ok-box{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;padding:10px 14px;border-radius:10px;}
  .recs .rec{display:flex;gap:11px;padding:11px 0;border-bottom:1px solid #f3f4f6;}
  .recs .rec:last-child{border-bottom:none;}
  .rec-prio{flex:0 0 auto;align-self:flex-start;color:#fff;font-size:11px;font-weight:700;padding:3px 9px;border-radius:6px;}
  .rec-title{font-weight:600;} .rec-detail{color:#475569;margin-top:3px;line-height:1.45;}
  .summary{line-height:1.6;}
  .shots{display:flex;gap:14px;flex-wrap:wrap;}
  .shots figure{margin:0;text-align:center;flex:1;min-width:200px;}
  .shots img{width:100%;border:1px solid #e2e8f0;border-radius:8px;}
  .shots figcaption{font-size:12px;color:#64748b;margin-top:5px;}
  .foot{text-align:center;color:#94a3b8;font-size:11px;padding:18px 0;}
  table.metrics{width:100%;border-collapse:collapse;}
  table.metrics td,table.metrics th{padding:8px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:12px;}
  table.metrics td:first-child,table.metrics th:first-child{text-align:left;color:#334155;}
  table.metrics td.win{background:#f0fdf4;font-weight:700;}
</style></head><body><div class="wrap">

  <section class="cover" style="background:linear-gradient(140deg,${brandColor2},${brandColor})">
    <div class="brandbar">${brandLogo ? `<img src="${esc(brandLogo)}" alt="${esc(brandName)}" style="max-height:40px;max-width:200px"/>` : logoSvg(36)}</div>
    <div class="kicker">${T('Competitor SEO Comparison', 'Comparatif SEO concurrentiel')}</div>
    <h1>${esc(cmp.primaryHost)} vs. ${valid.length - 1} ${T(`competitor${valid.length - 1 === 1 ? '' : 's'}`, `concurrent${valid.length - 1 === 1 ? '' : 's'}`)}</h1>
    <div class="vs">
      ${sites.map((s) => s.error ? `<div class="v"><div class="h">${esc(s.host)}</div><div class="g">—</div></div>`
        : `<div class="v"><div class="h">${esc(s.host)}</div><div class="g" style="color:${gradeColor(s.overall)}">${s.grade}</div><div class="h">${s.overall}/100</div></div>`).join('')}
    </div>
    <div class="agentchip"><img src="${ATLAS_AVATAR}" alt="${esc(agent)}"/><b>${esc(agent.toUpperCase())}</b></div>
    <div style="opacity:.75;font-size:12px;margin-top:14px">${T('Generated', 'Généré le')} ${esc(cmp.generatedAt)}</div>
  </section>

  <section class="card">
    <h2>${T('Competitive Summary', 'Résumé concurrentiel')}</h2>
    <div class="summary">${esc(ai.summary || '')}</div>
  </section>

  <section class="card">
    <h2>${T('Scorecard', 'Tableau de scores')}</h2>
    <table class="score">
      <thead><tr><th>${T('Category', 'Catégorie')}</th>${headRow}</tr></thead>
      <tbody>${overallRow}${catRows}</tbody>
    </table>
  </section>

  <section class="card">
    <h2>${T('Where You’re Behind', 'Où vous êtes en retard')}</h2>
    ${gapsHtml}
  </section>

  ${(ai.recommendations || []).length ? `<section class="card">
    <h2>${T('How to Win', 'Comment gagner')}</h2>
    <div class="recs">${ai.recommendations.map(recRow).join('')}</div>
  </section>` : ''}

  <section class="card">
    <h2>${T('Key Metrics', 'Indicateurs clés')}</h2>
    <table class="metrics">
      <thead><tr><th>${T('Metric', 'Indicateur')}</th>${valid.map((s) => `<th>${esc(s.host)}</th>`).join('')}</tr></thead>
      <tbody>
        ${metricRow(T('Lighthouse performance', 'Performance Lighthouse'), (v) => v, (s) => s.metrics.lighthouse, false)}
        ${metricRow(T('Page size (KB)', 'Poids de la page (Ko)'), (v) => v, (s) => s.metrics.pageKb, true)}
        ${metricRow(T('Load time (s)', 'Temps de chargement (s)'), (v) => (v / 1000).toFixed(2), (s) => s.metrics.loadMs, true)}
        ${metricRow(T('Words (home)', 'Mots (accueil)'), (v) => v, (s) => s.metrics.words, false)}
        ${metricRow(T('Readability', 'Lisibilité'), (v) => v, (s) => s.metrics.readability, false)}
        ${metricRow(T('Broken links', 'Liens cassés'), (v) => v, (s) => s.metrics.brokenLinks, true)}
      </tbody>
    </table>
  </section>

  ${shots ? `<section class="card"><h2>${T('Home Page Previews', 'Aperçus des pages d’accueil')}</h2><div class="shots">${shots}</div></section>` : ''}

  <div class="foot">${T('Prepared by', 'Préparé par')} ${esc(brandName)} &middot; ${T('agent', 'agent')} ${esc(agent)}${brand.website ? ' &middot; ' + esc(brand.website) : ''}${brand.email ? ' &middot; ' + esc(brand.email) : ''}</div>
</div></body></html>`;
}
