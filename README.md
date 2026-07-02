
# SEO Optimizer

A self-hosted SEO audit tool (like SEOptimer). Give it a URL and it **crawls the
whole site** and produces a scored, multi-page report — On-Page SEO, Content
Quality, Links, Usability, Performance, Social, Security & Technology — with
AI-written recommendations and a downloadable **~10–15 page PDF**.

## How it works

1. **Crawl** — starts at the URL, seeds from `sitemap.xml`, and follows internal
   links to audit up to 50 sub-pages (`src/crawler.js`). The home page is rendered
   in headless Chrome for screenshots + performance metrics.
2. **Analyze** — 60+ checks across seven categories:
   - **On-Page** — title, meta description, **Google SERP snippet preview**, H1,
     ALT text, canonical, schema, indexability, analytics, robots.txt, XML sitemap,
     SEO-friendly URLs, plus site-wide duplicate/missing title & description detection.
   - **Content Quality** (`src/content.js`) — Flesch readability, grade level,
     sentence length, **keyword consistency matrix** (title/desc/headings/URL),
     keyword density & stuffing, common phrases, heading hierarchy (H1→H6 order /
     skipped levels), text-to-HTML ratio, thin-content detection. Multilingual
     stopwords (EN/FR/ES/DE).
   - **Links** (`src/links.js`) — broken-link scan (HEAD/GET, internal & external),
     descriptive vs. generic anchor text, empty links, internal linking, nofollow.
   - **Usability** — mobile viewport, favicon, language, charset, DOM size, email
     privacy, Flash, iframes, deprecated HTML tags.
   - **Performance** — page size, requests, load time, FCP, compression, caching,
     image optimization, CSS/JS minification, render-blocking resources, CDN.
   - **Social** — Open Graph, Twitter/X cards, social-profile presence grid.
   - **Security & Technology** — HTTPS/SSL, HSTS, clickjacking & MIME protection,
     server IP, web server, nameservers, detected technologies.
3. **PageSpeed** (`src/psi.js`) — optional Google PageSpeed Insights call for the
   home page: real **Lighthouse** scores (Performance / SEO / Accessibility / Best
   Practices) and **Core Web Vitals** (LCP, CLS, INP/FCP, TBT) using real-user
   field data (CrUX) when available, else lab data. CWV are scored as ranking
   factors. Works without an API key at low volume; add `GOOGLE_PSI_API_KEY` for
   reliable quota (the anonymous quota is often exhausted → 429).
4. **Score** — weighted scoring → per-category and overall grades A–F (`src/scoring.js`).
4. **AI** — Groq or DeepSeek writes the executive summary, quick wins and
   prioritized recommendations from the full site data (`src/ai.js`). Falls back to
   a rule-based report if no API key is set.
5. **Report** — a paginated HTML report (`src/report.js`) shown in the browser and
   exported to PDF via Chrome, including a per-page crawl table, keyword-density
   table, heading outline and broken-link list.

## Setup

```bash
npm install            # installs deps incl. a bundled Chromium for puppeteer
cp .env.example .env   # then fill in your keys (already provided in .env)
```

`.env` keys:

| key | meaning |
|-----|---------|
| `GROQ_API_KEY` / `GROQ_MODEL` | Groq (fast, default) |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` | DeepSeek (deep reasoning) |
| `AI_PROVIDER` | `groq` or `deepseek` |
| `PORT` | web server port (default 3000) |

## Run

**Web app:**
```bash
npm start
# open http://localhost:3000
```

**Command line:**
```bash
node cli.js https://example.com                   # print summary (crawls 20 pages)
node cli.js https://example.com report.pdf        # also save a PDF
node cli.js https://example.com report.pdf 35     # crawl up to 35 pages
```

## Competitor comparison

Switch to the **⚔️ Compare Competitors** tab, enter your site + up to 3 competitor
URLs, and get a side-by-side **scorecard** (per-category winners), a **gap
analysis** ("where you're behind, and to whom"), an AI **competitive summary**,
a key-metrics table, and home-page previews — exportable to PDF.
(`src/compare.js`, `src/compareReport.js`)

## API

- `POST /api/audit` `{ "url": "https://example.com" }` → JSON (scores + report HTML)
- `GET  /api/pdf?url=https://example.com` → PDF download
- `POST /api/compare` `{ "url": "...", "competitors": ["...","..."] }` → comparison JSON + report HTML
- `GET  /api/compare-pdf?url=<your-site>` → comparison PDF download

## Notes

- Crawl depth is selectable in the UI (1–50 pages). Broken-link checking verifies
  up to 250 unique links per audit.
- If headless Chrome can't launch, the audit still runs (no screenshots / Chrome
  perf metrics). If both AI keys fail, a rule-based report is produced instead.

