// Renders the competitor-comparison report (self-contained HTML) used both on
// screen and for the PDF export.

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function gradeColor(pct) {
  if (pct >= 80) return '#22c55e';
  if (pct >= 60) return '#84cc16';
  if (pct >= 45) return '#f59e0b';
  return '#ef4444';
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

const COLORS = ['#2563eb', '#16a34a', '#db2777', '#f59e0b'];

export function renderComparison(cmp, { brand = {} } = {}) {
  const { sites, categories, winners, gaps, ai } = cmp;
  const brandName = brand.name || '';
  const brandColor = brand.color || '#1d4ed8';
  const brandColor2 = brand.color2 || '#0f172a';
  const brandLogo = brand.logo || '';
  const valid = sites.filter((s) => !s.error);
  const catLabel = (k) => (valid.find((s) => s.categories[k])?.categories[k]?.label) || k;

  // Scorecard table: rows = categories, columns = sites.
  const headRow = sites.map((s, i) => `
    <th class="${s.error ? '' : ''}">
      <span class="dot" style="background:${COLORS[i % COLORS.length]}"></span>
      ${esc(s.host)}${i === 0 ? ' <span class="you">YOU</span>' : ''}
    </th>`).join('');

  const overallRow = `
    <tr class="overall-row">
      <td>Overall</td>
      ${sites.map((s, i) => s.error
        ? `<td class="err">error</td>`
        : `<td class="${winners.overall === i ? 'win' : ''}">
             <div class="cell-grade" style="color:${gradeColor(s.overall)}">${s.grade}</div>
             <div class="cell-score">${s.overall}/100</div>
             ${winners.overall === i ? '<div class="win-tag">winner</div>' : ''}
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
          ${win ? '<div class="win-tag">best</div>' : ''}
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
      <div class="gap-note">${esc(g.rival)} leads by <b>${g.delta}</b> pts (${g.theirs} vs ${g.mine})</div>
    </div>`).join('') || '<div class="ok-box">✓ Your site leads or ties in every category.</div>';

  const recRow = (r) => {
    const pc = { High: '#ef4444', Medium: '#f59e0b', Low: '#3b82f6' }[r.priority] || '#64748b';
    return `<div class="rec"><span class="rec-prio" style="background:${pc}">${esc(r.priority || '')}</span>
      <div><div class="rec-title">${esc(r.title)}</div><div class="rec-detail">${esc(r.detail || '')}</div></div></div>`;
  };

  const shots = valid.filter((s) => s.screenshot).map((s, i) => `
    <figure><img src="${s.screenshot}" alt="${esc(s.host)}"/><figcaption>${esc(s.host)}</figcaption></figure>`).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Competitor Comparison — ${esc(cmp.primaryHost)}</title>
<style>
  *{box-sizing:border-box;} body{font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;margin:0;color:#1e293b;background:#f1f5f9;font-size:13px;}
  .wrap{max-width:1080px;margin:0 auto;padding:16px;}
  .cover{background:linear-gradient(140deg,#0f172a,#1d4ed8);color:#fff;border-radius:18px;padding:40px;text-align:center;margin-bottom:18px;}
  .cover .kicker{letter-spacing:3px;text-transform:uppercase;font-size:12px;opacity:.7;}
  .cover h1{font-size:26px;margin:8px 0;}
  .cover .vs{display:flex;justify-content:center;gap:14px;flex-wrap:wrap;margin-top:18px;}
  .cover .vs .v{background:rgba(255,255,255,.12);border-radius:10px;padding:10px 16px;}
  .cover .vs .v .h{font-size:13px;opacity:.85;} .cover .vs .v .g{font-size:22px;font-weight:800;}
  .card{background:#fff;border-radius:14px;padding:20px 22px;margin-top:16px;box-shadow:0 1px 3px rgba(0,0,0,.06);}
  .card h2{margin:0 0 14px;font-size:17px;}
  table.score{width:100%;border-collapse:collapse;}
  table.score th,table.score td{padding:10px 8px;text-align:center;border-bottom:1px solid #f1f5f9;}
  table.score th:first-child,table.score td:first-child{text-align:left;font-weight:600;color:#334155;}
  table.score th{font-size:12px;color:#1e293b;border-bottom:2px solid #e2e8f0;}
  .dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:4px;}
  .you{background:#1d4ed8;color:#fff;font-size:9px;padding:1px 5px;border-radius:4px;vertical-align:middle;}
  .cell-grade{font-size:18px;font-weight:800;}
  .cell-score{font-size:11px;color:#64748b;}
  .cell-bar{background:#eef1f6;border-radius:5px;height:6px;width:70px;margin:4px auto;overflow:hidden;}
  .cell-bar span{display:block;height:100%;}
  td.win{background:#f0fdf4;border-radius:8px;}
  .win-tag{font-size:9px;font-weight:700;color:#16a34a;text-transform:uppercase;margin-top:2px;}
  .overall-row td{background:#f8fafc;} .overall-row td.win{background:#dcfce7;}
  td.err{color:#ef4444;}
  .gap{margin:12px 0;}
  .gap-cat{font-weight:600;margin-bottom:4px;}
  .gap-bar{position:relative;background:#eef1f6;border-radius:6px;height:20px;}
  .gap-mine{background:#3b82f6;color:#fff;height:100%;border-radius:6px 0 0 6px;font-size:11px;line-height:20px;padding-left:6px;min-width:18px;}
  .gap-theirs{position:absolute;top:-3px;width:3px;height:26px;background:#ef4444;}
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
    ${(brandLogo || brandName) ? `<div style="margin-bottom:16px">${brandLogo ? `<img src="${esc(brandLogo)}" alt="${esc(brandName)}" style="max-height:40px;max-width:200px"/>` : `<span style="font-size:18px;font-weight:800">${esc(brandName)}</span>`}</div>` : ''}
    <div class="kicker">Competitor SEO Comparison</div>
    <h1>${esc(cmp.primaryHost)} vs. ${valid.length - 1} competitor${valid.length - 1 === 1 ? '' : 's'}</h1>
    <div class="vs">
      ${sites.map((s) => s.error ? `<div class="v"><div class="h">${esc(s.host)}</div><div class="g">—</div></div>`
        : `<div class="v"><div class="h">${esc(s.host)}</div><div class="g" style="color:${gradeColor(s.overall)}">${s.grade}</div><div class="h">${s.overall}/100</div></div>`).join('')}
    </div>
    <div style="opacity:.7;font-size:12px;margin-top:14px">Generated ${esc(cmp.generatedAt)}</div>
  </section>

  <section class="card">
    <h2>Competitive Summary</h2>
    <div class="summary">${esc(ai.summary || '')}</div>
  </section>

  <section class="card">
    <h2>Scorecard</h2>
    <table class="score">
      <thead><tr><th>Category</th>${headRow}</tr></thead>
      <tbody>${overallRow}${catRows}</tbody>
    </table>
  </section>

  <section class="card">
    <h2>Where You're Behind</h2>
    ${gapsHtml}
  </section>

  ${(ai.recommendations || []).length ? `<section class="card">
    <h2>How to Win</h2>
    <div class="recs">${ai.recommendations.map(recRow).join('')}</div>
  </section>` : ''}

  <section class="card">
    <h2>Key Metrics</h2>
    <table class="metrics">
      <thead><tr><th>Metric</th>${valid.map((s) => `<th>${esc(s.host)}</th>`).join('')}</tr></thead>
      <tbody>
        ${metricRow('Lighthouse performance', (v) => v, (s) => s.metrics.lighthouse, false)}
        ${metricRow('Page size (KB)', (v) => v, (s) => s.metrics.pageKb, true)}
        ${metricRow('Load time (s)', (v) => (v / 1000).toFixed(2), (s) => s.metrics.loadMs, true)}
        ${metricRow('Words (home)', (v) => v, (s) => s.metrics.words, false)}
        ${metricRow('Readability', (v) => v, (s) => s.metrics.readability, false)}
        ${metricRow('Broken links', (v) => v, (s) => s.metrics.brokenLinks, true)}
      </tbody>
    </table>
  </section>

  ${shots ? `<section class="card"><h2>Home Page Previews</h2><div class="shots">${shots}</div></section>` : ''}

  <div class="foot">${brandName ? 'Prepared by ' + esc(brandName) : 'Competitor SEO Comparison'}${brand.website ? ' &middot; ' + esc(brand.website) : ''}${brand.email ? ' &middot; ' + esc(brand.email) : ''}</div>
</div></body></html>`;
}
