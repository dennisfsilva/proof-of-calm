import { THEME_BEFORE_PAINT } from '@proofofcalm/app/lib/theme';
import { describe, expect, it } from 'vitest';
import { notAvailableHtml } from '../../lib/geo/uk-block';
import { headAssets, pageHead, pageTitle } from './head';
import { manifestJson, renderSitePage, SITE_PAGES } from './render';

const PRELOAD =
  '<link rel="preload" as="font" type="font/woff2" crossorigin href="/assets/calm-sans-latin-eWyuMJI9.woff2">';
const STYLESHEET = '<link rel="stylesheet" crossorigin href="/assets/app-CxquZUos.css">';
const THEME_SCRIPT = `<script>${THEME_BEFORE_PAINT}</script>`;
const BUILT = `<!doctype html>\n<html lang="en">\n<head>\n${PRELOAD}\n<meta charset="utf-8">\n<script data-entry="/assets/app-1.js">boot</script>\n${STYLESHEET}\n</head>\n<body></body>\n</html>\n`;

describe('headAssets', () => {
  it('copies the font preload and the stylesheet of the built app.html, nothing else', () => {
    expect(headAssets(BUILT)).toEqual([PRELOAD, STYLESHEET]);
  });

  it('fails the build when either is missing', () => {
    expect(() => headAssets(BUILT.replace(PRELOAD, ''))).toThrow(/font preload/);
    expect(() => headAssets(BUILT.replace(STYLESHEET, ''))).toThrow(/stylesheet/);
  });
});

describe('pageHead', () => {
  const head = pageHead({ title: 'Terms of use', assets: [PRELOAD, STYLESHEET] });

  it('carries the metadata of app.html, the title and the copied assets, and no script', () => {
    expect(head).toContain('<meta charset="utf-8">');
    expect(head).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(head).toContain('<title>Terms of use · Proof of Calm</title>');
    expect(head).toContain('<link rel="manifest" href="/manifest.webmanifest">');
    expect(head).toContain('<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f7f4ef">');
    expect(head).toContain('<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#151412">');
    expect(head).toContain(PRELOAD);
    expect(head).toContain(STYLESHEET);
    expect(head).not.toContain('<script');
  });

  it('carries the theme script byte for byte, before the stylesheet, only when asked (the offline page)', () => {
    expect(head).not.toContain('<script');
    const offline = pageHead({ title: 'Offline', assets: [PRELOAD, STYLESHEET], themeScript: true });
    expect(offline.match(/<script/g)).toHaveLength(1);
    expect(offline).toContain(THEME_SCRIPT);
    expect(offline.indexOf(THEME_SCRIPT)).toBeLessThan(offline.indexOf(STYLESHEET));
  });

  it('titles the holding page with the name alone and escapes a title', () => {
    expect(pageTitle(null)).toBe('Proof of Calm');
    expect(pageHead({ title: 'A & B', assets: [] })).toContain('<title>A &amp; B · Proof of Calm</title>');
  });
});

describe('renderSitePage (ADR-0045 §6)', () => {
  const assets = [PRELOAD, STYLESHEET];

  it('writes nine pages: the holding page, the five legal pages, offline, 404 and not-available', () => {
    expect(SITE_PAGES).toEqual([
      'index',
      'terms',
      'privacy',
      'risk',
      'cookies',
      'contact',
      '~offline',
      '404',
      'not-available',
    ]);
  });

  for (const name of SITE_PAGES) {
    const scripts = name === '~offline' ? 'the theme script alone' : 'no script element';
    it(`${name} is a whole document with ${scripts}`, () => {
      const html = renderSitePage(name, assets);
      expect(html.startsWith('<!doctype html>\n<html lang="en">')).toBe(true);
      // The offline page replaces the app for a session that may have chosen a theme (ADR-0045, the
      // deviation of 2026-10-19); every other site page follows the system theme and carries no script.
      expect(html.match(/<script/gi) ?? []).toHaveLength(name === '~offline' ? 1 : 0);
      if (name === '~offline') expect(html).toContain(THEME_SCRIPT);
      expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
      expect(html).toContain('<h1');
    });
  }

  it('gives the site pages the footer with the disclaimer, the risk link and the legal links', () => {
    for (const name of ['index', 'terms', 'contact', '404'] as const) {
      const html = renderSitePage(name, assets);
      expect(html, name).toContain('Data and tools, not advice. Crypto-assets can lose all their value.');
      expect(html, name).toContain('<a href="/risk">Read the risk disclosure</a>');
      expect(html, name).toContain('<nav aria-label="Legal information">');
      expect(html, name).toContain(STYLESHEET);
    }
  });

  it('renders the holding page, the contact section and the offline page as the Next host did', () => {
    expect(renderSitePage('index', assets)).toContain('<h1 class="text-28">proof of calm</h1>');
    expect(renderSitePage('index', assets)).toContain('<title>Proof of Calm</title>');
    const contact = renderSitePage('contact', assets);
    expect(contact).toContain('<section id="security" aria-labelledby="security-title"');
    expect(contact).toContain('<a href="/.well-known/security.txt">security.txt</a>');
    expect(contact).toContain('<title>Contact · Proof of Calm</title>');
    const offline = renderSitePage('~offline', assets);
    expect(offline).toContain('<h1 class="text-28">Offline</h1>');
    expect(offline).not.toContain('<footer');
    expect(renderSitePage('404', assets)).toContain('<h1 class="text-28">Page not found</h1>');
  });

  it('writes the not-available page as the UK block defines it', () => {
    expect(renderSitePage('not-available', assets)).toBe(notAvailableHtml());
  });

  it('writes the manifest as JSON', () => {
    const parsed: unknown = JSON.parse(manifestJson());
    expect(parsed).toMatchObject({ start_url: '/today', display: 'standalone', name: 'Proof of Calm' });
  });
});
