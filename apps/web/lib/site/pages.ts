// The legal pages that exist at launch (docs/LEGAL.md §5). They stay reachable for visitors the UK
// block turns away (ADR-0029), so the proxy and the not-available page read the list from here.
import type { SiteLinks } from '@proofofcalm/app/features/learn/site';

export const LEGAL_PAGES = [
  { slug: 'terms', path: '/terms' },
  { slug: 'privacy', path: '/privacy' },
  { slug: 'risk', path: '/risk' },
  { slug: 'cookies', path: '/cookies' },
  { slug: 'contact', path: '/contact' },
] as const;

export type LegalSlug = (typeof LEGAL_PAGES)[number]['slug'];

/**
 * The public pages' paths under `/en/` (docs/GROWTH.md §2.6), which the static Learn pages link with plain
 * anchors; the country pages and the holding-date page come with the country pages' branch.
 */
export const SITE_LINKS: SiteLinks = {
  learn: '/en/learn',
  module: (slug) => `/en/learn/${slug}`,
  countries: '/en/countries',
  country: (code) => `/en/countries/${code.toLowerCase()}`,
  holding: '/en/holding-date',
};

/** RFC 9116; served from public/ and outside the proxy's matcher. */
export const SECURITY_TXT_PATH = '/.well-known/security.txt';
