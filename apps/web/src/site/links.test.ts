import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { APP_ROUTES } from '@proofofcalm/app/lib/navigation/routes';
import type { CalendarDate } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { LEGAL_PAGES, SECURITY_TXT_PATH } from '../../lib/site/pages';
import { loadSiteData, renderSitePage, sitePages } from './render';

// No site page links a path that answers 404 (ADR-0045 §6 and the Deviations of 2026-11-15): every root-relative
// href on every page the build writes, query and fragment stripped, is one of those pages, a legal page, an app
// route the shell answers, security.txt, the manifest the build writes, or a file of public/. The head's hashed
// assets come from the built app.html, so the pages render here without them.

const data = await loadSiteData('2026-10-20' as CalendarDate);
const PUBLIC_DIR = resolve(import.meta.dirname, '../../public');

const written = new Set(sitePages(data).map((name) => (name === 'index' ? '/' : `/${name}`)));
const known = new Set<string>([
  ...written,
  ...LEGAL_PAGES.map((page) => page.path),
  SECURITY_TXT_PATH,
  '/manifest.webmanifest',
]);
const appRoute = (path: string) => APP_ROUTES.some((route) => path === `/${route}` || path.startsWith(`/${route}/`));
const staticFile = (path: string) => existsSync(resolve(PUBLIC_DIR, `.${path}`));
const resolves = (path: string) => known.has(path) || appRoute(path) || staticFile(path);

/** The root-relative hrefs of a document, without their query or fragment. */
function rootRelativeHrefs(html: string): string[] {
  return [...html.matchAll(/\bhref="([^"]*)"/g)]
    .map((match) => match[1] ?? '')
    .filter((href) => href.startsWith('/') && !href.startsWith('//'))
    .map((href) => href.replace(/[?#].*$/, ''));
}

describe('the site pages link only paths that exist', () => {
  for (const name of sitePages(data)) {
    it(`${name} links nothing that answers 404`, () => {
      const hrefs = rootRelativeHrefs(renderSitePage(name, [], data));
      expect(hrefs.filter((href) => !resolves(href))).toEqual([]);
    });
  }

  it('reads the links it checks: the Learn index links the countries page', () => {
    expect(rootRelativeHrefs(renderSitePage('en/learn', [], data))).toContain('/en/countries');
  });
});
