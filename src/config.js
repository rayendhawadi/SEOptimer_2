// White-label branding. Set these in .env to put your agency's identity on every
// report and PDF. Falls back to sensible defaults.

// Branding is OFF by default (neutral internal report). To put an agency identity
// on the reports, fill BRAND_NAME (and optionally a logo/website/email) in .env.
export function getBrand(overrides = {}) {
  return {
    name: overrides.name || process.env.BRAND_NAME || '',
    color: overrides.color || process.env.BRAND_COLOR || '#1d4ed8',
    color2: overrides.color2 || process.env.BRAND_COLOR2 || '#0f172a',
    logo: overrides.logo || process.env.BRAND_LOGO_URL || '',
    website: overrides.website || process.env.BRAND_WEBSITE || '',
    email: overrides.email || process.env.BRAND_EMAIL || '',
    phone: overrides.phone || process.env.BRAND_PHONE || '',
  };
}
