// AI Commandos brand assets, loaded once at import time so that the report HTML
// (and the PDF rendered from it by headless Chrome, which has no base URL) stay
// fully self-contained. The logo ships as an inline SVG string; raster assets
// are embedded as base64 data URIs.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const brandDir = path.join(__dirname, '..', 'public', 'brand');

const read = (f) => readFileSync(path.join(brandDir, f));
const dataUri = (f, mime) => `data:${mime};base64,${read(f).toString('base64')}`;

// Official AI Commandos palette (from "Couleurs AI COMMANDOS.xlsx" + brand logo).
export const PALETTE = {
  green: '#0abe9f',   // primary — AI Commandos "Green"
  greenDark: '#089683',
  noir: '#0a0c11',    // dark surfaces — AI Commandos "Noir"
  noir2: '#151821',   // slightly lifted dark
  red: '#ed4514',     // accent / errors — AI Commandos "Red"
  atlas: '#f38938',   // Atlas agent signature (orange) — used for "improve"
  atlasDark: '#b45b1b',
  white: '#ffffff',
};

// Full white wordmark lockup — perfect on the dark (noir) cover / topbar.
export const LOGO_SVG = read('logo-white.svg').toString('utf8')
  // Strip the XML prolog + comments so it inlines cleanly inside HTML.
  .replace(/<\?xml[^>]*\?>/, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .trim();

// Atlas — the agent that delivers this audit.
export const ATLAS_AVATAR = dataUri('atlas.png', 'image/png');
export const FAVICON = dataUri('favicon.png', 'image/png');

// Renders the wordmark at a given pixel height (SVG has no intrinsic size).
export function logoSvg(height = 40) {
  return LOGO_SVG.replace(
    /<svg /,
    `<svg style="height:${height}px;width:auto;display:block" `
  );
}
