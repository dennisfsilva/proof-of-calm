// The prerender entry (ADR-0045 §6): `scripts/build.ts` builds this file with `vite build --ssr`,
// imports the result and writes one HTML file per site page, each with the head of `head.ts` and
// no script but the theme script on the offline page. The manifest comes from the same build (ADR-0033).
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { notAvailableHtml } from '../../lib/geo/uk-block';
import { manifest } from '../../lib/pwa/manifest';
import { LEGAL_PAGES, type LegalSlug } from '../../lib/site/pages';
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
export type SitePage = (typeof SITE_PAGES)[number];

type Rendered = { title: string | null; body: ReactNode; themeScript?: boolean };

const legal = (slug: LegalSlug): Rendered => ({
  title: legalTitle(slug),
  body: (
    <SiteLayout>
      <LegalPage slug={slug} />
    </SiteLayout>
  ),
});

function page(name: Exclude<SitePage, 'not-available'>): Rendered {
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

/** The whole document of one site page; `assets` are the tags `headAssets` read from the built app.html. */
export function renderSitePage(name: SitePage, assets: readonly string[]): string {
  if (name === 'not-available') return notAvailableHtml();
  const { title, body, themeScript = false } = page(name);
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    pageHead({ title, assets, themeScript }),
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
