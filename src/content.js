// Content-quality analysis for a single page: readable text extraction,
// readability scoring (Flesch), heading hierarchy validation, keyword density
// and stuffing detection, text-to-HTML ratio, and a content "niceness" verdict.

const STOP = new Set((
  // English
  'a an the and or but of to in on for with at by from up about into over after ' +
  'is are was were be been being it its this that these those i you he she we they them his her our your ' +
  'as if then than so not no yes do does did has have had will would can could should may might must ' +
  'what which who whom where when why how all any both each few more most other some such only own same ' +
  'too very s t just don now also get got like one two new use using used out off via per they re ve ll ' +
  // French
  'le la les un une des du de ce cette ces et ou mais donc or ni car que qui quoi dont où ' +
  'je tu il elle nous vous ils elles on se sa son ses leur leurs notre nos votre vos mon ma mes ton ta tes ' +
  'pour par avec sans sous sur dans entre vers chez est sont était suis es êtes être avoir ai as ont avons avez ' +
  'pas plus moins très bien aussi comme tout tous toute toutes au aux en ne y d l c j m n s qu si ' +
  // Spanish
  'el los las una unos unas y o pero porque que como para por con sin sobre entre ' +
  'su sus mi mis tu tus nuestro nuestra este esta estos estas es son ser estar muy más menos también ' +
  // German
  'der die das den dem ein eine einen und oder aber für mit von zu im am ist sind war ' +
  'sich auch nicht auf aus bei nach wie als auch noch nur'
).split(/\s+/));

// Extract human-readable body text, stripping non-content/navigation chrome.
export function extractText($) {
  const $body = $('body').clone();
  $body.find('script, style, noscript, svg, nav, footer, aside, form, iframe, header').remove();
  // Prefer a main/article region if present and substantial.
  let scope = $body;
  const main = $body.find('main, article, [role="main"]').first();
  if (main.length && main.text().trim().length > 200) scope = main;
  return scope.text().replace(/\s+/g, ' ').trim();
}

function words(text) {
  return text.toLowerCase().match(/[a-z][a-z'-]*[a-z]|[a-z]/g) || [];
}

function sentences(text) {
  return text.split(/[.!?]+(?:\s|$)/).map((s) => s.trim()).filter((s) => s.length > 1);
}

function countSyllables(word) {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!word) return 0;
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const m = word.match(/[aeiouy]{1,2}/g);
  return m ? m.length : 1;
}

function fleschReadingEase(w, s, syl) {
  if (!w || !s) return 0;
  return Math.max(0, Math.min(100,
    206.835 - 1.015 * (w / s) - 84.6 * (syl / w)));
}

function fleschKincaidGrade(w, s, syl) {
  if (!w || !s) return 0;
  return Math.max(0, 0.39 * (w / s) + 11.8 * (syl / w) - 15.59);
}

export function readabilityLabel(fre) {
  if (fre >= 80) return 'Very easy';
  if (fre >= 70) return 'Easy';
  if (fre >= 60) return 'Standard';
  if (fre >= 50) return 'Fairly difficult';
  if (fre >= 30) return 'Difficult';
  return 'Very difficult';
}

// Ordered list of headings with levels, plus hierarchy issues.
export function analyzeHeadings($) {
  const list = [];
  $('h1, h2, h3, h4, h5, h6').each((_, e) => {
    const level = Number(e.tagName.replace(/h/i, ''));
    const text = $(e).text().replace(/\s+/g, ' ').trim();
    if (text) list.push({ level, text });
  });

  const counts = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
  for (const h of list) counts['h' + h.level]++;

  const issues = [];
  if (counts.h1 === 0) issues.push('No H1 heading on the page.');
  if (counts.h1 > 1) issues.push(`Multiple H1 headings (${counts.h1}); use exactly one.`);
  if (list.length && list[0].level !== 1) issues.push('First heading is not an H1.');
  // Skipped levels (e.g. H2 -> H4)
  let prev = 0;
  for (const h of list) {
    if (prev && h.level > prev + 1) {
      issues.push(`Heading level skipped (H${prev} → H${h.level}) near "${h.text.slice(0, 40)}".`);
      break;
    }
    prev = h.level;
  }
  if (list.length < 2) issues.push('Very few headings; add subheadings to structure content.');

  return { list, counts, issues };
}

export function analyzeContent($, { title = '', metaDesc = '', headingsText = '', url = '' } = {}) {
  const text = extractText($);
  const html = $.html() || '';
  const w = words(text);
  const s = sentences(text);
  const syl = w.reduce((a, x) => a + countSyllables(x), 0);

  const fre = Math.round(fleschReadingEase(w.length, s.length, syl));
  const fk = Math.round(fleschKincaidGrade(w.length, s.length, syl) * 10) / 10;
  const avgWordsPerSentence = s.length ? Math.round((w.length / s.length) * 10) / 10 : 0;

  const paragraphs = $('p').filter((_, e) => $(e).text().trim().length > 40).length;

  // Keyword density (single words)
  const counts = new Map();
  for (const x of w) { if (!STOP.has(x) && x.length > 2) counts.set(x, (counts.get(x) || 0) + 1); }
  const density = [...counts.entries()]
    .map(([word, count]) => ({ word, count, pct: w.length ? +(count / w.length * 100).toFixed(2) : 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  // 2-word phrases (bigrams)
  const bigrams = new Map();
  for (let i = 0; i < w.length - 1; i++) {
    if (STOP.has(w[i]) || STOP.has(w[i + 1])) continue;
    const k = w[i] + ' ' + w[i + 1];
    bigrams.set(k, (bigrams.get(k) || 0) + 1);
  }
  const phrases = [...bigrams.entries()]
    .map(([phrase, count]) => ({ phrase, count }))
    .filter((p) => p.count > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const stuffing = density.filter((d) => d.pct > 4.5);
  const textHtmlRatio = html.length ? +((text.length / html.length) * 100).toFixed(1) : 0;

  // Keyword consistency matrix (like SEOptimer): is each top keyword present in
  // the title, meta description, headings and URL?
  const t = title.toLowerCase(), d = metaDesc.toLowerCase();
  const hs = headingsText.toLowerCase(), u = decodeURIComponent(url || '').toLowerCase();
  const consistency = [...density, ...phrases.map((p) => ({ word: p.phrase, count: p.count, pct: 0 }))]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((k) => ({
      word: k.word,
      count: k.count,
      inTitle: t.includes(k.word),
      inDesc: d.includes(k.word),
      inHeadings: hs.includes(k.word),
      inUrl: u.includes(k.word.replace(/\s+/g, '-')) || u.includes(k.word.replace(/\s+/g, '')),
    }));

  // Niceness verdict
  const verdicts = [];
  if (w.length < 300) verdicts.push('thin content');
  if (fre < 45) verdicts.push('hard to read');
  if (avgWordsPerSentence > 25) verdicts.push('long sentences');
  if (stuffing.length) verdicts.push('possible keyword stuffing');
  if (textHtmlRatio < 8) verdicts.push('low text-to-code ratio');

  return {
    wordCount: w.length,
    sentenceCount: s.length,
    paragraphCount: paragraphs,
    avgWordsPerSentence,
    readability: fre,
    readabilityLabel: readabilityLabel(fre),
    gradeLevel: fk,
    textHtmlRatio,
    density,
    phrases,
    consistency,
    stuffing,
    isNice: verdicts.length === 0,
    verdicts,
  };
}
