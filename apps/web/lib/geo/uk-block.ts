// The UK block of ADR-0029, a static route since ADR-0045 §4: Vercel's geolocation header decides in
// `vercel.json`, and every page except the legal pages and security.txt answers with one plain page,
// `dist/not-available.html`, that says the service is not available: no app shell, no script, no
// sign-up and no persuasion. The status is 451, because the reason is legal (RFC 7725).
import { BRAND } from '@proofofcalm/app/lib/brand';
import { LEGAL_PAGES, SECURITY_TXT_PATH } from '../site/pages';
import { siteTranslator } from '../site-messages';
import { BLOCKED_COUNTRIES, NOT_AVAILABLE_STYLE } from './rules';

// The header, the country, the status and the style live in rules.ts, which vercel.json is written from;
// the tests of this page and of vercel.json read the style from here.
export { NOT_AVAILABLE_STYLE } from './rules';

const BLOCKED = new Set<string>(BLOCKED_COUNTRIES);
const EXEMPT_PATHS = new Set<string>([...LEGAL_PAGES.map((page) => page.path), SECURITY_TXT_PATH]);

export function isBlockedCountry(country: string | null): boolean {
  return country !== null && BLOCKED.has(country.trim().toUpperCase());
}

/** The legal pages and security.txt stay reachable from the UK (ADR-0029); a trailing slash is ignored. */
export function isExemptPath(pathname: string): boolean {
  return EXEMPT_PATHS.has(pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname);
}

const ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ENTITIES[character] ?? character);
}

/** The whole page, as the build writes it: one sentence and the legal pages, one hashed style element. */
export function notAvailableHtml(): string {
  const t = siteTranslator('unavailable');
  const legal = siteTranslator('legal');
  const links = LEGAL_PAGES.map((page) => `<a href="${page.path}">${escapeHtml(legal(`${page.slug}.title`))}</a>`).join(
    ' · ',
  );
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light dark">',
    '<meta name="robots" content="noindex, nofollow">',
    `<title>${escapeHtml(t('title'))}</title>`,
    `<style>${NOT_AVAILABLE_STYLE}</style>`,
    '</head>',
    '<body>',
    '<main id="main">',
    `<h1>${escapeHtml(t('title'))}</h1>`,
    `<p>${escapeHtml(t('body', { product: BRAND.name }))}</p>`,
    '</main>',
    `<footer><nav aria-label="${escapeHtml(t('legal'))}"><p>${links}</p></nav></footer>`,
    '</body>',
    '</html>',
  ].join('\n');
}
