// Branding for every report and PDF. Defaults to the AI Commandos identity
// (agent: Atlas); each field can still be overridden per-deployment via .env.

import { PALETTE } from './brandAssets.js';

export function getBrand(overrides = {}) {
  return {
    name: overrides.name || process.env.BRAND_NAME || 'AI Commandos',
    // Cover gradient runs color2 (noir) -> color (green).
    color: overrides.color || process.env.BRAND_COLOR || PALETTE.green,
    color2: overrides.color2 || process.env.BRAND_COLOR2 || PALETTE.noir,
    accent: overrides.accent || process.env.BRAND_ACCENT || PALETTE.red,
    logo: overrides.logo || process.env.BRAND_LOGO_URL || '',
    agent: overrides.agent || process.env.BRAND_AGENT || 'Atlas',
    tagline: overrides.tagline || process.env.BRAND_TAGLINE ||
      'Agents IA d’élite — audit propulsé par Atlas',
    website: overrides.website || process.env.BRAND_WEBSITE || 'ai-commandos.com',
    email: overrides.email || process.env.BRAND_EMAIL || '',
    phone: overrides.phone || process.env.BRAND_PHONE || '',
  };
}
