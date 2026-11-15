// The prerender entry (ADR-0045 §6): `scripts/build.ts` builds this file with `vite build --ssr`,
// imports the result and writes one HTML file per site page, each with the head of `head.ts` and
// no script but the theme script on the offline page. The manifest comes from the same build (ADR-0033).
// The public Learn, country and holding-date pages live under /en/ and render at the build's day (ADR-0045
// Deviations of 2026-11-15).

import {
  type CountrySite,
  type LearnSite,
  loadCountrySite,
  loadLearnSite,
  SiteCountryList,
  SiteCountryPage,
  SiteCountryRows,
  SiteHoldingDates,
  SiteLearnIndex,
  SiteModulePage,
  StaticLearn,
} from '@proofofcalm/app/features/learn/site';
import { BRAND } from '@proofofcalm/app/lib/brand';
import learnMessages from '@proofofcalm/app/messages/en/learn.json';
import type { LearnModuleMeta } from '@proofofcalm/content';
import type { CalendarDate } from '@proofofcalm/core';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTranslator } from 'use-intl/core';
import { notAvailableHtml } from '../../lib/geo/uk-block';
import { manifest } from '../../lib/pwa/manifest';
import { indexFiles, PUBLIC_INDEXABLE } from '../../lib/site/indexing';
import { LEGAL_PAGES, type LegalSlug, SITE_LINKS } from '../../lib/site/pages';
import { siteTranslator } from '../../lib/site-messages';
import { ContactPage } from './contact';
import { CookiesPage } from './cookies';
import { headAssets, pageHead } from './head';
import { HomePage } from './home';
import { SiteLayout } from './layout';
import { LegalPage, legalTitle } from './legal';
import { NotFoundPage } from './not-found';
import { OfflinePage } from './offline';

export { headAssets };

/** The pages the build writes, each as `dist/<name>.html`; the UK page is the static 451 (§4). */
export const SITE_PAGES = [
  'index',
  ...LEGAL_PAGES.map((page) => page.slug),
  '~offline',
  '404',
  'not-available',
] as const;
/**
 * A public page under /en/, written as `dist/en/<name>.html`: the Learn index and modules, the country list, one
 * page per country by its lower-case code, and the holding-date page.
 */
type PublicPage =
  | 'en/learn'
  | `en/learn/${LearnModuleMeta['slug']}`
  | 'en/countries'
  | `en/countries/${string}`
  | 'en/holding-date';
export type SitePage = (typeof SITE_PAGES)[number] | PublicPage;

/** What the public pages read: every Learn module, every listed country at the build's day, and that day. */
export type SiteData = { learn: LearnSite; countries: CountrySite; today: CalendarDate };

const TAXES = 'taxes-where-you-live';
const COUNTRY = 'en/countries/';

export async function loadSiteData(today: CalendarDate): Promise<SiteData> {
  const [learn, countries] = await Promise.all([loadLearnSite(), loadCountrySite(today)]);
  return { learn, countries, today };
}

/**
 * Every page the build writes: the site pages, the Learn index and one page per module, the country list and one
 * page per listed country, then the holding-date page.
 */
export function sitePages(data: SiteData): SitePage[] {
  return [
    ...SITE_PAGES,
    'en/learn',
    ...data.learn.modules.map((module) => `en/learn/${module.slug}` as const),
    'en/countries',
    ...data.countries.entries.map((entry) => `${COUNTRY}${entry.code.toLowerCase()}` as const),
    'en/holding-date',
  ];
}

/** sitemap.xml and robots.txt, only once the public pages may be indexed (lib/site/indexing.ts). */
export function siteIndexFiles(data: SiteData) {
  const paths = sitePages(data).filter((name) => name.startsWith('en/'));
  return indexFiles(
    PUBLIC_INDEXABLE,
    BRAND.origin,
    paths.map((name) => `/${name}`),
  );
}

const isPublic = (name: SitePage): name is PublicPage => name.startsWith('en/');

type Rendered = {
  title: string | null;
  body: ReactNode;
  themeScript?: boolean;
  canonical?: string;
  indexable?: boolean;
};

/**
 * A public page: the site layout, so the footer's disclaimer and Risk link are on it (docs/LEGAL.md §4), around the
 * page's main column. Static: no plan, so no fall line and no live figure; Taxes ends with every country's row, as
 * the app's module does with no plan, and the holding-date page is its static half alone (no tool yet).
 */
function publicPage(name: PublicPage, { learn, countries, today }: SiteData): Rendered {
  const page = (content: ReactNode) => (
    <SiteLayout>
      <main id="main">
        <StaticLearn today={today}>{content}</StaticLearn>
      </main>
    </SiteLayout>
  );
  const common = { canonical: `/${name}`, indexable: PUBLIC_INDEXABLE };
  const t = createTranslator({ locale: 'en', messages: { learn: learnMessages }, namespace: 'learn' });
  const { entries, cards } = countries;
  if (name === 'en/learn') {
    return { ...common, title: t('title'), body: page(<SiteLearnIndex modules={learn.modules} links={SITE_LINKS} />) };
  }
  if (name === 'en/countries') {
    return {
      ...common,
      title: t('countries.headTitle'),
      body: page(<SiteCountryList entries={entries} links={SITE_LINKS} />),
    };
  }
  if (name === 'en/holding-date') {
    return {
      ...common,
      title: t('holding.title'),
      body: page(<SiteHoldingDates entries={entries} cards={cards} links={SITE_LINKS} />),
    };
  }
  if (name.startsWith(COUNTRY)) {
    const code = name.slice(COUNTRY.length).toUpperCase();
    const card = cards.get(code);
    if (card === undefined) throw new Error(`no listed country ${code}`);
    return {
      ...common,
      title: t('countries.countryHeadTitle', { country: card.name }),
      body: page(<SiteCountryPage card={card} links={SITE_LINKS} />),
    };
  }
  const slug = name.slice('en/learn/'.length);
  const module = learn.modules.find((candidate) => candidate.slug === slug);
  const Body = learn.bodies.get(slug);
  if (module === undefined || Body === undefined) throw new Error(`no public Learn module ${slug}`);
  // Taxes describes the app with a plan (docs/CONTENT-STYLE.md §1 rule 10): the page says so before its first section,
  // in the site's own words, so the module's text stays as reviewed.
  const taxes =
    slug === TAXES
      ? {
          lead: <p className="text-16">{t('module.taxSiteLead')}</p>,
          after: <SiteCountryRows entries={entries} links={SITE_LINKS} />,
        }
      : {};
  return {
    ...common,
    title: module.title,
    body: page(
      <SiteModulePage module={module} Body={Body} falls={learn.falls} today={today} links={SITE_LINKS} {...taxes} />,
    ),
  };
}

const legal = (slug: LegalSlug): Rendered => ({
  title: legalTitle(slug),
  body: (
    <SiteLayout>
      <LegalPage slug={slug} />
    </SiteLayout>
  ),
});

function page(name: Exclude<(typeof SITE_PAGES)[number], 'not-available'>): Rendered {
  switch (name) {
    case 'index':
      return {
        title: null,
        body: (
          <SiteLayout>
            <HomePage />
          </SiteLayout>
        ),
      };
    case 'cookies':
      return {
        title: legalTitle('cookies'),
        body: (
          <SiteLayout>
            <CookiesPage />
          </SiteLayout>
        ),
      };
    case 'contact':
      return {
        title: legalTitle('contact'),
        body: (
          <SiteLayout>
            <ContactPage />
          </SiteLayout>
        ),
      };
    case '~offline':
      // Served by the worker in place of the app: no footer, as the Next host had it, and the theme
      // script, so a session that chose a theme keeps it offline (docs/DESIGN.md §3).
      return { title: siteTranslator('offline')('title'), body: <OfflinePage />, themeScript: true };
    case '404':
      return {
        title: siteTranslator('notFound')('title'),
        body: (
          <SiteLayout>
            <NotFoundPage />
          </SiteLayout>
        ),
      };
    default:
      return legal(name);
  }
}

/**
 * The whole document of one site page; `assets` are the tags `headAssets` read from the built app.html, and
 * `data` what the public pages read (`loadSiteData`).
 */
export function renderSitePage(name: SitePage, assets: readonly string[], data?: SiteData): string {
  if (name === 'not-available') return notAvailableHtml();
  let rendered: Rendered;
  if (!isPublic(name)) rendered = page(name);
  else if (data !== undefined) rendered = publicPage(name, data);
  else throw new Error(`${name} renders from the loaded site data`);
  const { title, body, themeScript = false, canonical, indexable = false } = rendered;
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    pageHead({ title, assets, themeScript, indexable, ...(canonical !== undefined && { canonical }) }),
    '</head>',
    '<body>',
    renderToStaticMarkup(body),
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/** `dist/manifest.webmanifest`. */
export function manifestJson(): string {
  return `${JSON.stringify(manifest(), null, 2)}\n`;
}
