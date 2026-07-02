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

const AUDIT_PHASES = [
  'Crawling website & sub-pages…',
  'Analyzing on-page SEO & content…',
  'Checking readability & headings…',
  'Verifying links (broken-link scan)…',
  'Measuring performance & security…',
  'Running Google PageSpeed…',
  'Generating AI recommendations…',
  'Building your report…',
];
const COMPARE_PHASES = [
  'Auditing your site…',
  'Auditing competitors…',
  'Running PageSpeed on each site…',
  'Comparing scores…',
  'Writing competitive analysis…',
  'Building comparison report…',
];

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
  const timer = startLoading(AUDIT_PHASES, runBtn);
  try {
    const res = await fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Audit failed');

    lastUrl = data.url;
    lastMode = 'audit';
    resultUrl.textContent = data.url;
    resultGrade.textContent = 'Grade ' + data.grade;
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
  if (!url) { alert('Enter your site URL.'); return; }
  if (competitors.length === 0) { alert('Add at least one competitor.'); return; }

  const timer = startLoading(COMPARE_PHASES, compareBtn);
  try {
    const res = await fetch('/api/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, competitors }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Comparison failed');

    lastUrl = url;
    lastMode = 'compare';
    jsonBtn.style.display = 'none';
    csvBtn.style.display = 'none';
    resultUrl.textContent = data.primaryHost + ' vs ' + (data.sites.length - 1) + ' competitor(s)';
    const me = data.sites[0];
    resultGrade.textContent = me.error ? 'error' : 'Grade ' + me.grade;
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
  pdfBtn.textContent = '⏳ Generating PDF…';
  try {
    const endpoint = lastMode === 'compare' ? '/api/compare-pdf' : '/api/pdf';
    const res = await fetch(endpoint + '?url=' + encodeURIComponent(lastUrl));
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
    alert('Could not generate the PDF: ' + err.message);
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
  if (pct >= 80) return '#22c55e';
  if (pct >= 60) return '#84cc16';
  if (pct >= 45) return '#f59e0b';
  return '#ef4444';
}
