// Generates written, prioritized recommendations from the audit results using
// an OpenAI-compatible chat endpoint (Groq or DeepSeek). Falls back to a
// deterministic, rule-based summary if no key / the call fails.

const PROVIDERS = {
  groq: {
    key: () => process.env.GROQ_API_KEY,
    base: () => process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
    model: () => process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  },
  deepseek: {
    key: () => process.env.DEEPSEEK_API_KEY,
    base: () => process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    model: () => process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  },
};

export async function generateRecommendations(analysis, scored, lang = 'fr') {
  const provider = (process.env.AI_PROVIDER || 'groq').toLowerCase();
  const p = PROVIDERS[provider] || PROVIDERS.groq;
  const langName = lang === 'en' ? 'English' : 'French';

  if (!p.key()) {
    return { provider: 'none', ...ruleBasedReport(analysis, scored, lang) };
  }

  const failing = analysis.checks.filter((c) => c.status !== 'pass');
  const site = analysis.site || {};
  const summary = {
    url: analysis.url,
    overallScore: scored.overall,
    grade: scored.overallGrade,
    pagesCrawled: site.pagesCrawled,
    categoryScores: Object.fromEntries(
      Object.values(scored.categories).map((c) => [c.label, c.score])
    ),
    issues: failing.map((c) => ({
      area: analysis.categories[c.category],
      item: c.label,
      status: c.status,
      value: String(c.value).slice(0, 200),
    })),
    content: site.contentStats && {
      avgReadability: site.contentStats.avgReadability,
      totalWords: site.contentStats.totalWords,
      thinPages: site.contentStats.thinPages,
      duplicateTitles: site.contentStats.dupTitles,
      duplicateDescriptions: site.contentStats.dupDescs,
    },
    links: site.linkStats && {
      internal: site.linkStats.totalInternal,
      external: site.linkStats.totalExternal,
      broken: (site.broken || []).length,
      genericAnchors: site.linkStats.generic,
    },
    pageSpeed: (() => {
      const p = analysis.psi && (analysis.psi.mobile || analysis.psi.desktop);
      if (!p) return undefined;
      const src = p.field && p.field.LCP != null ? p.field : p.lab;
      return {
        strategy: p.strategy,
        lighthousePerformance: p.scores.performance,
        seoScore: p.scores.seo,
        LCP_ms: src.LCP != null ? Math.round(src.LCP) : null,
        CLS: src.CLS,
        INP_ms: src.INP != null ? Math.round(src.INP) : null,
        topOpportunities: (p.opportunities || []).slice(0, 4).map((o) => o.title),
      };
    })(),
    meta: {
      title: analysis.meta.title,
      titleLen: analysis.meta.titleLen,
      descLen: analysis.meta.descLen,
      readability: analysis.meta.readability,
      topKeywords: (analysis.meta.keywordsDensity || []).slice(0, 8).map((k) => k.word),
      topPhrases: (analysis.meta.phrases || []).slice(0, 5).map((p) => p.phrase),
      tech: analysis.meta.tech,
    },
  };

  const system =
    'You are a senior SEO consultant writing a client-facing audit. ' +
    'Be specific, actionable and concise. Return STRICT JSON only, no markdown. ' +
    `Write ALL human-readable text values (executiveSummary, quickWins, titles, details) in ${langName}. ` +
    'Keep the JSON keys and the "priority"/"area" enum values exactly as specified (in English).';

  const user =
    `Here is the audit data for ${analysis.url}:\n` +
    JSON.stringify(summary) +
    `\n\nReturn JSON with this exact shape:\n` +
    `{\n` +
    `  "executiveSummary": "2-3 sentence overview of the site's SEO health",\n` +
    `  "quickWins": ["short actionable fix", ...],   // 3-6 items, highest impact + easiest first\n` +
    `  "recommendations": [\n` +
    `     {"priority":"High|Medium|Low","area":"On-Page|Usability|Performance|Social|Security","title":"...","detail":"1-2 sentences on what & how to fix"}\n` +
    `  ]   // 6-12 items ordered by priority\n` +
    `}`;

  try {
    const res = await fetch(`${p.base()}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${p.key()}`,
      },
      body: JSON.stringify({
        model: p.model(),
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn(`[ai] ${provider} ${res.status}: ${text.slice(0, 200)}`);
      return { provider: 'fallback', ...ruleBasedReport(analysis, scored, lang) };
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    const parsed = safeJson(content);
    if (!parsed) return { provider: 'fallback', ...ruleBasedReport(analysis, scored, lang) };

    return {
      provider,
      model: p.model(),
      executiveSummary: parsed.executiveSummary || '',
      quickWins: parsed.quickWins || [],
      recommendations: parsed.recommendations || [],
    };
  } catch (err) {
    console.warn('[ai] request failed:', err.message);
    return { provider: 'fallback', ...ruleBasedReport(analysis, scored, lang) };
  }
}

function safeJson(str) {
  try { return JSON.parse(str); } catch {}
  // try to extract the first {...} block
  const m = str.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

// Deterministic fallback so the tool still produces a useful report offline.
function ruleBasedReport(analysis, scored, lang = 'fr') {
  const fr = lang === 'fr';
  const failing = analysis.checks.filter((c) => c.status === 'fail');
  const warning = analysis.checks.filter((c) => c.status === 'warn');

  const recommendations = [];
  for (const c of failing) {
    recommendations.push({
      priority: 'High',
      area: analysis.categories[c.category],
      title: `${fr ? 'Corriger' : 'Fix'}: ${c.label}`,
      detail: c.detail,
    });
  }
  for (const c of warning.slice(0, 8)) {
    recommendations.push({
      priority: 'Medium',
      area: analysis.categories[c.category],
      title: `${fr ? 'Améliorer' : 'Improve'}: ${c.label}`,
      detail: c.detail,
    });
  }

  return {
    executiveSummary: fr
      ? `Ce site obtient ${scored.overall}/100 (note ${scored.overallGrade}). ` +
        `${failing.length} problème(s) critique(s) et ${warning.length} amélioration(s) ont été identifiés.`
      : `This site scored ${scored.overall}/100 (grade ${scored.overallGrade}). ` +
        `${failing.length} critical issue(s) and ${warning.length} improvement(s) were found.`,
    quickWins: failing.slice(0, 5).map((c) => `${c.label}: ${c.detail}`),
    recommendations,
  };
}

// ---- Competitor comparison ------------------------------------------------

export async function generateComparison(sites, lang = 'fr') {
  const provider = (process.env.AI_PROVIDER || 'groq').toLowerCase();
  const p = PROVIDERS[provider] || PROVIDERS.groq;
  const valid = sites.filter((s) => !s.error);
  const langName = lang === 'en' ? 'English' : 'French';

  if (!p.key() || valid.length < 2) return ruleBasedComparison(sites, lang);

  const data = valid.map((s, i) => ({
    site: s.host,
    role: i === 0 ? 'YOUR SITE' : 'competitor',
    overall: s.overall,
    categories: Object.fromEntries(Object.entries(s.categories).map(([k, v]) => [v.label, v.score])),
    pageKb: s.metrics.pageKb,
    lighthouse: s.metrics.lighthouse,
  }));

  const system = 'You are an SEO strategist comparing a site against its competitors. ' +
    'Be specific and actionable. Return STRICT JSON only. ' +
    `Write all human-readable text (summary, titles, details) in ${langName}; keep JSON keys and enum values in English.`;
  const user = `Compare these sites (the first is "YOUR SITE"):\n${JSON.stringify(data)}\n\n` +
    `Return JSON: {\n` +
    `  "summary": "3-4 sentences: how YOUR SITE stacks up vs competitors and the biggest opportunities to overtake them",\n` +
    `  "recommendations": [ {"priority":"High|Medium|Low","title":"...","detail":"what to do to beat competitors"} ]  // 4-8 items\n` +
    `}`;

  try {
    const res = await fetch(`${p.base()}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key()}` },
      body: JSON.stringify({
        model: p.model(), temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    });
    if (!res.ok) return ruleBasedComparison(sites, lang);
    const j = await res.json();
    const parsed = safeJson(j.choices?.[0]?.message?.content || '{}');
    if (!parsed) return ruleBasedComparison(sites, lang);
    return {
      provider,
      summary: parsed.summary || '',
      recommendations: parsed.recommendations || [],
    };
  } catch {
    return ruleBasedComparison(sites, lang);
  }
}

function ruleBasedComparison(sites, lang = 'fr') {
  const fr = lang === 'fr';
  const valid = sites.filter((s) => !s.error);
  const primary = sites[0];
  if (!primary || primary.error || valid.length < 2) {
    return {
      provider: 'fallback',
      summary: fr ? 'Pas assez de sites valides à comparer.' : 'Not enough valid sites to compare.',
      recommendations: [],
    };
  }
  const lead = primary.overall - Math.max(...valid.filter((s) => s !== primary).map((s) => s.overall));
  return {
    provider: 'fallback',
    summary: fr
      ? `${primary.host} obtient ${primary.overall}/100, ` +
        (lead >= 0 ? `en tête de la comparaison avec ${lead} point(s) d’avance.` : `en retard de ${-lead} point(s) sur le meilleur concurrent.`)
      : `${primary.host} scored ${primary.overall}/100, ` +
        (lead >= 0 ? `leading the comparison by ${lead} points.` : `trailing the top competitor by ${-lead} points.`),
    recommendations: [],
  };
}
