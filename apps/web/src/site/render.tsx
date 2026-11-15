// The prerender entry (ADR-0045 §6): `scripts/build.ts` builds this file with `vite build --ssr`,
// imports the result and writes one HTML file per site page, each with the head of `head.ts` and
// no script but the theme script on the offline page. The manifest comes from the same build (ADR-0033).
// The public Learn pages live under /en/ and render at the build's day (ADR-0045 Deviations of 2026-11-15).

import {
  type LearnSite,
  loadLearnSite,
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
/** A public page under /en/, written as `dist/en/learn.html` or `dist/en/learn/<slug>.html`. */
type PublicPage = 'en/learn' | `en/learn/${LearnModuleMeta['slug']}`;
export type SitePage = (typeof SITE_PAGES)[number] | PublicPage;

/** What the public pages read: the Learn modules but Taxes, which waits for its country rows, and the build's day. */
export type SiteData = { learn: LearnSite; today: CalendarDate };

const TAXES = 'taxes-where-you-live';

export async function loadSiteData(today: CalendarDate): Promise<SiteData> {
  const learn = await loadLearnSite();
  return { learn: { ...learn, modules: learn.modules.filter((module) => module.slug !== TAXES) }, today };
}

/** Every page the build writes: the site pages, then the Learn index and one page per public module. */
export function sitePages(data: SiteData): SitePage[] {
  return [...SITE_PAGES, 'en/learn', ...data.learn.modules.map((module) => `en/learn/${module.slug}` as const)];
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
 * A public Learn page: the site layout, so the footer's disclaimer and Risk link are on it (docs/LEGAL.md §4),
 * around the page's main column. Static: no plan, so no fall line and no live figure.
 */
function learnPage(name: PublicPage, { learn, today }: SiteData): Rendered {
  const page = (content: ReactNode) => (
    <SiteLayout>
      <main id="main">
        <StaticLearn today={today}>{content}</StaticLearn>
      </main>
    </SiteLayout>
  );
  const common = { canonical: `/${name}`, indexable: PUBLIC_INDEXABLE };
  if (name === 'en/learn') {
    const t = createTranslator({ locale: 'en', messages: { learn: learnMessages }, namespace: 'learn' });
    return { ...common, title: t('title'), body: page(<SiteLearnIndex modules={learn.modules} links={SITE_LINKS} />) };
  }
  const slug = name.slice('en/learn/'.length);
  const module = learn.modules.find((candidate) => candidate.slug === slug);
  const Body = learn.bodies.get(slug);
  if (module === undefined || Body === undefined) throw new Error(`no public Learn module ${slug}`);
  return {
    ...common,
    title: module.title,
    body: page(<SiteModulePage module={module} Body={Body} falls={learn.falls} today={today} links={SITE_LINKS} />),
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
  else if (data !== undefined) rendered = learnPage(name, data);
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
