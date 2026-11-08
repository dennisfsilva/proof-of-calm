// The facts of the UK block that vercel.json carries (ADR-0029, ADR-0045 §4): the header, the country,
// the status and the not-available page's one style rule. This module imports only JSON, so the
// vercel.json writer loads it under plain `node`; uk-block.ts builds the page on top of it.
import colours from '../pwa/brand-colors.json' with { type: 'json' };

/** Set by Vercel's edge from the client's IP address; a client cannot choose it in production. */
export const COUNTRY_HEADER = 'x-vercel-ip-country';
export const BLOCKED_COUNTRIES = ['GB'] as const;
/** The reason is legal (RFC 7725). */
export const BLOCKED_STATUS = 451;

// The page has none of the app's stylesheets. This one rule gives it the brand's paper and ink in each
// theme (the tokens' hex fallbacks) and its links the text colour, as on the site (docs/DESIGN.md §3):
// the browser's own link blue fails contrast on a dark background. Its SHA-256 is in the CSP's
// `style-src` (ADR-0045 §3), so the page is static.
export const NOT_AVAILABLE_STYLE = [
  `body{background:${colours.light.background};color:${colours.light.ink}}`,
  'a{color:inherit}',
  `@media (prefers-color-scheme:dark){body{background:${colours.dark.background};color:${colours.dark.ink}}}`,
].join('');
