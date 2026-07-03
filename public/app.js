const auditForm = document.getElementById('auditForm');
const urlInput = document.getElementById('urlInput');
const runBtn = document.getElementById('runBtn');
const compareForm = document.getElementById('compareForm');
const primaryInput = document.getElementById('primaryInput');
const competitorInputs = document.getElementById('competitorInputs');
const addCompetitor = document.getElementById('addCompetitor');
const compareBtn = document.getElementById('compareBtn');
const loading = document.getElementById('loading');
const loadingText = document.getElementById('loadingText');
const errorBox = document.getElementById('error');
const resultBar = document.getElementById('resultBar');
const resultUrl = document.getElementById('resultUrl');
const resultGrade = document.getElementById('resultGrade');
const pdfBtn = document.getElementById('pdfBtn');
const jsonBtn = document.getElementById('jsonBtn');
const csvBtn = document.getElementById('csvBtn');
const mount = document.getElementById('reportMount');

let lastUrl = '';
let lastMode = 'audit'; // 'audit' | 'compare'
let lang = localStorage.getItem('aic_lang') || 'fr';

const PHASES = {
  fr: {
    audit: [
      'Atlas explore le site & ses sous-pages…',
      'Analyse du SEO on-page & du contenu…',
      'Vérification de la lisibilité & des titres…',
      'Contrôle des liens (scan des liens cassés)…',
      'Mesure de la performance & de la sécurité…',
      'Lancement de Google PageSpeed…',
      'Rédaction des recommandations par l’IA…',
      'Construction de votre rapport…',
    ],
    compare: [
      'Audit de votre site…',
      'Audit des concurrents…',
      'PageSpeed sur chaque site…',
      'Comparaison des scores…',
      'Rédaction de l’analyse concurrentielle…',
      'Construction du rapport comparatif…',
    ],
  },
  en: {
    audit: [
      'Atlas is crawling the site & sub-pages…',
      'Analyzing on-page SEO & content…',
      'Checking readability & headings…',
      'Verifying links (broken-link scan)…',
      'Measuring performance & security…',
      'Running Google PageSpeed…',
      'Writing AI recommendations…',
      'Building your report…',
    ],
    compare: [
      'Auditing your site…',
      'Auditing competitors…',
      'PageSpeed on each site…',
      'Comparing scores…',
      'Writing the competitive analysis…',
      'Building the comparison report…',
    ],
  },
};

// Landing-page copy per language (report language is driven by `lang` too).
const UI = {
  fr: {
    agentRole: 'Commando SEO',
    heroKicker: 'Agents IA d’élite',
    heroTitle: 'Auditez n’importe quel site en quelques secondes',
    heroLead: 'Atlas explore votre site et livre un rapport SEO complet — on-page, contenu, liens, performance, convivialité, réseaux sociaux & sécurité — avec des recommandations rédigées par l’IA et un PDF prêt à envoyer.',
    tabAudit: '🔍 Audit du site',
    tabCompare: '⚔️ Comparer les concurrents',
    runBtn: 'Lancer l’audit',
    urlPlaceholder: 'https://exemple.com',
    compareBtn: 'Comparer les sites',
    addCompetitor: '+ Ajouter un concurrent',
    compareHint: 'Audite votre site + jusqu’à 3 concurrents (≈30–60 s chacun).',
    examplesLabel: 'Essayez :',
    pdfBtn: '⬇ Télécharger le PDF',
    note: 'Note',
    footTag: 'Agents IA d’élite autonomes',
  },
  en: {
    agentRole: 'SEO Commando',
    heroKicker: 'Elite AI agents',
    heroTitle: 'Audit any website in seconds',
    heroLead: 'Atlas crawls your site and delivers a full SEO report — on-page, content, links, performance, usability, social & security — with AI-written recommendations and a ready-to-send PDF.',
    tabAudit: '🔍 Single Audit',
    tabCompare: '⚔️ Compare Competitors',
    runBtn: 'Audit Website',
    urlPlaceholder: 'https://example.com',
    compareBtn: 'Compare Sites',
    addCompetitor: '+ Add competitor',
    compareHint: 'Audits your site + up to 3 competitors (≈30–60s each).',
    examplesLabel: 'Try:',
    pdfBtn: '⬇ Download PDF',
    note: 'Grade',
    footTag: 'Elite autonomous AI agents',
  },
};

function applyLang(l) {
  lang = (l === 'en') ? 'en' : 'fr';
  localStorage.setItem('aic_lang', lang);
  document.documentElement.lang = lang;
  const u = UI[lang];
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('agentRole', u.agentRole);
  set('heroKicker', u.heroKicker);
  set('heroTitle', u.heroTitle);
  set('heroLead', u.heroLead);
  set('tabAudit', u.tabAudit);
  set('tabCompare', u.tabCompare);
  set('runBtn', u.runBtn);
  set('compareBtn', u.compareBtn);
  set('addCompetitor', u.addCompetitor);
  set('compareHint', u.compareHint);
  set('examplesLabel', u.examplesLabel);
  set('footTag', u.footTag);
  const urlIn = document.getElementById('urlInput');
  if (urlIn) urlIn.placeholder = u.urlPlaceholder;
  if (!pdfBtn.disabled) pdfBtn.textContent = u.pdfBtn;
  document.querySelectorAll('.lang-btn').forEach((b) =>
    b.classList.toggle('active', b.dataset.lang === lang));
}

// ---- tabs ------------------------------------------------------------------
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const which = tab.dataset.tab;
    document.querySelectorAll('.tab-panel').forEach((p) =>
      p.classList.toggle('hidden', p.dataset.panel !== which));
  });
});

// ---- language toggle -------------------------------------------------------
document.querySelectorAll('.lang-btn').forEach((b) => {
  b.addEventListener('click', () => applyLang(b.dataset.lang));
});
applyLang(lang);

document.querySelectorAll('.examples a').forEach((a) => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    urlInput.value = a.dataset.url;
    auditForm.requestSubmit();
  });
});

// ---- add competitor rows ---------------------------------------------------
addCompetitor.addEventListener('click', () => {
  const rows = competitorInputs.querySelectorAll('.competitor').length;
  if (rows >= 3) return;
  const div = document.createElement('div');
  div.className = 'compare-row';
  div.innerHTML = `<span class="compare-label">Competitor ${rows + 1}</span>` +
    `<input type="text" class="competitor" placeholder="https://competitor${rows + 1}.com" autocomplete="off" />`;
  competitorInputs.appendChild(div);
  if (rows + 1 >= 3) addCompetitor.style.display = 'none';
});

// ---- shared helpers --------------------------------------------------------
function startLoading(phases, btn) {
  errorBox.classList.add('hidden');
  resultBar.classList.add('hidden');
  mount.innerHTML = '';
  loading.classList.remove('hidden');
  btn.disabled = true;
  let i = 0;
  loadingText.textContent = phases[0];
  return setInterval(() => {
    i = Math.min(i + 1, phases.length - 1);
    loadingText.textContent = phases[i];
  }, 2800);
}

function renderIntoIframe(html) {
  const iframe = document.createElement('iframe');
  iframe.style.width = '100%';
  iframe.style.border = 'none';
  iframe.setAttribute('scrolling', 'no');
  iframe.srcdoc = html;
  iframe.addEventListener('load', () => {
    const doc = iframe.contentDocument;
    const resize = () => { iframe.style.height = doc.body.scrollHeight + 40 + 'px'; };
    resize();
    doc.querySelectorAll('img').forEach((img) => img.addEventListener('load', resize));
    setTimeout(resize, 800);
  });
  mount.innerHTML = '';
  mount.appendChild(iframe);
}

// ---- single audit ----------------------------------------------------------
auditForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;
  const timer = startLoading(PHASES[lang].audit, runBtn);
  try {
    const res = await fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, lang }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Audit failed');

    lastUrl = data.url;
    lastMode = 'audit';
    resultUrl.textContent = data.url;
    resultGrade.textContent = UI[lang].note + ' ' + data.grade;
    resultGrade.style.background = gradeColor(data.overall);
    jsonBtn.style.display = '';
    csvBtn.style.display = '';
    resultBar.classList.remove('hidden');
    renderIntoIframe(data.reportHtml);
  } catch (err) {
    errorBox.textContent = '⚠ ' + err.message;
    errorBox.classList.remove('hidden');
  } finally {
    clearInterval(timer);
    loading.classList.add('hidden');
    runBtn.disabled = false;
  }
});

// ---- competitor comparison -------------------------------------------------
compareForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = primaryInput.value.trim();
  const competitors = [...document.querySelectorAll('.competitor')]
    .map((i) => i.value.trim()).filter(Boolean);
  if (!url) { alert(lang === 'en' ? 'Enter your site URL.' : 'Entrez l’URL de votre site.'); return; }
  if (competitors.length === 0) { alert(lang === 'en' ? 'Add at least one competitor.' : 'Ajoutez au moins un concurrent.'); return; }

  const timer = startLoading(PHASES[lang].compare, compareBtn);
  try {
    const res = await fetch('/api/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, competitors, lang }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Comparison failed');

    lastUrl = url;
    lastMode = 'compare';
    jsonBtn.style.display = 'none';
    csvBtn.style.display = 'none';
    const vs = lang === 'en' ? ' vs ' : ' vs ';
    const compWord = lang === 'en' ? 'competitor(s)' : 'concurrent(s)';
    resultUrl.textContent = data.primaryHost + vs + (data.sites.length - 1) + ' ' + compWord;
    const me = data.sites[0];
    resultGrade.textContent = me.error ? (lang === 'en' ? 'error' : 'erreur') : UI[lang].note + ' ' + me.grade;
    resultGrade.style.background = me.error ? '#ef4444' : gradeColor(me.overall);
    resultBar.classList.remove('hidden');
    renderIntoIframe(data.reportHtml);
  } catch (err) {
    errorBox.textContent = '⚠ ' + err.message;
    errorBox.classList.remove('hidden');
  } finally {
    clearInterval(timer);
    loading.classList.add('hidden');
    compareBtn.disabled = false;
  }
});

// ---- PDF download (works for both modes) -----------------------------------
pdfBtn.addEventListener('click', async () => {
  if (!lastUrl || pdfBtn.disabled) return;
  const original = pdfBtn.textContent;
  pdfBtn.disabled = true;
  pdfBtn.textContent = lang === 'en' ? '⏳ Generating PDF…' : '⏳ Génération du PDF…';
  try {
    const endpoint = lastMode === 'compare' ? '/api/compare-pdf' : '/api/pdf';
    const res = await fetch(endpoint + '?url=' + encodeURIComponent(lastUrl) + '&lang=' + lang);
    if (!res.ok) throw new Error((await res.text().catch(() => '')) || ('HTTP ' + res.status));
    const blob = await res.blob();
    let filename = lastMode === 'compare' ? 'seo-comparison.pdf' : 'seo-report.pdf';
    const cd = res.headers.get('Content-Disposition') || '';
    const match = cd.match(/filename="?([^"]+)"?/);
    if (match) filename = match[1];
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
  } catch (err) {
    alert((lang === 'en' ? 'Could not generate the PDF: ' : 'Impossible de générer le PDF : ') + err.message);
  } finally {
    pdfBtn.disabled = false;
    pdfBtn.textContent = original;
  }
});

function downloadFrom(href) {
  const a = document.createElement('a');
  a.href = href;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
jsonBtn.addEventListener('click', () => {
  if (lastUrl) downloadFrom('/api/export?format=json&url=' + encodeURIComponent(lastUrl));
});
csvBtn.addEventListener('click', () => {
  if (lastUrl) downloadFrom('/api/export?format=csv&url=' + encodeURIComponent(lastUrl));
});

function gradeColor(pct) {
  if (pct >= 80) return '#0abe9f'; // AI Commandos green
  if (pct >= 60) return '#6cc24a';
  if (pct >= 45) return '#f38938'; // Atlas orange
  return '#ed4514';                // AI Commandos red
}
