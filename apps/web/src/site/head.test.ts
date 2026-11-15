import { THEME_BEFORE_PAINT } from '@proofofcalm/app/lib/theme';
import type { CalendarDate } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { notAvailableHtml } from '../../lib/geo/uk-block';
import { headAssets, pageHead, pageTitle } from './head';
import { loadSiteData, manifestJson, renderSitePage, SITE_PAGES, sitePages } from './render';

const PRELOAD =
  '<link rel="preload" as="font" type="font/woff2" crossorigin href="/assets/calm-sans-latin-eWyuMJI9.woff2">';
const STYLESHEET = '<link rel="stylesheet" crossorigin href="/assets/app-CxquZUos.css">';
const THEME_SCRIPT = `<script>${THEME_BEFORE_PAINT}</script>`;
// The day the pages are rendered at, before every module's review date, as the e2e builds pin it.
const data = await loadSiteData('2026-10-20' as CalendarDate);
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
  const head = pageHead({ title: 'Terms of use', assets: [PRELOAD, STYLESHEET], indexable: false });

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
    const offline = pageHead({ title: 'Offline', assets: [PRELOAD, STYLESHEET], themeScript: true, indexable: false });
    expect(offline.match(/<script/g)).toHaveLength(1);
    expect(offline).toContain(THEME_SCRIPT);
    expect(offline.indexOf(THEME_SCRIPT)).toBeLessThan(offline.indexOf(STYLESHEET));
  });

  it('carries the Open Graph tags and a large card, the image at an absolute URL (docs/DESIGN.md §9)', () => {
    expect(head).toContain('<meta property="og:title" content="Terms of use · Proof of Calm">');
    expect(head).toContain(
      '<meta property="og:description" content="A planner and log for buying crypto on a fixed monthly schedule.">',
    );
    expect(head).toContain('<meta property="og:type" content="website">');
    expect(head).toContain('<meta property="og:image" content="https://proofofcalm.com/og.png">');
    expect(head).toContain('<meta property="og:image:width" content="1200">');
    expect(head).toContain('<meta property="og:image:height" content="630">');
    expect(head).toContain('<meta name="twitter:card" content="summary_large_image">');
    const image = /property="og:image" content="([^"]+)"/.exec(head)?.[1] ?? '';
    expect(new URL(image).href).toBe(image);
    expect(pageHead({ title: 'A & B', assets: [], indexable: false })).toContain(
      '<meta property="og:title" content="A &amp; B · Proof of Calm">',
    );
  });

  it('keeps a page out of search unless it is indexable, and names its canonical URL when given one', () => {
    const open = pageHead({ title: 'Noise', assets: [], indexable: true, canonical: '/en/learn/noise' });
    expect(open).not.toContain('name="robots"');
    expect(open).toContain('<link rel="canonical" href="https://proofofcalm.com/en/learn/noise">');
    expect(head).not.toContain('rel="canonical"');
  });

  it('describes a page with its own description when it has one, else the manifest’s', () => {
    const own = pageHead({ title: 'Noise', assets: [], indexable: false, description: 'A & B.' });
    expect(own).toContain('<meta property="og:description" content="A &amp; B.">');
    expect(own).toContain('<meta name="description" content="A &amp; B.">');
    expect(head).not.toContain('name="description"');
  });

  it('titles the holding page with the name alone and escapes a title', () => {
    expect(pageTitle(null)).toBe('Proof of Calm');
    expect(pageHead({ title: 'A & B', assets: [], indexable: false })).toContain(
      '<title>A &amp; B · Proof of Calm</title>',
    );
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

  it('adds the Learn pages, the country pages and the holding-date page under /en/, written as nested files', () => {
    expect(sitePages(data).slice(SITE_PAGES.length)).toEqual([
      'en/learn',
      ...data.learn.modules.map((module) => `en/learn/${module.slug}`),
      'en/countries',
      ...data.countries.entries.map((entry) => `en/countries/${entry.code.toLowerCase()}`),
      'en/holding-date',
    ]);
    // Every profile but the generic one (docs/JURISDICTIONS.md §2).
    expect(data.countries.entries.map((entry) => entry.code).sort()).toEqual([
      'DE',
      'ES',
      'FR',
      'GB',
      'IE',
      'IT',
      'NL',
      'PT',
      'US',
    ]);
    expect(data.learn.modules.map((module) => module.slug)).toEqual(
      expect.arrayContaining([
        'start-here',
        'risk-honestly',
        'cycles',
        'noise',
        'when-the-market-drops',
        'taxes-where-you-live',
      ]),
    );
    expect(data.learn.modules).toHaveLength(6);
  });

  for (const name of sitePages(data)) {
    const scripts = name === '~offline' ? 'the theme script alone' : 'no script element';
    it(`${name} is a whole document with ${scripts}`, () => {
      const html = renderSitePage(name, assets, data);
      expect(html.startsWith('<!doctype html>\n<html lang="en">')).toBe(true);
      // The offline page replaces the app for a session that may have chosen a theme (ADR-0045, the
      // deviation of 2026-10-19); every other site page follows the system theme and carries no script.
      expect(html.match(/<script/gi) ?? []).toHaveLength(name === '~offline' ? 1 : 0);
      if (name === '~offline') expect(html).toContain(THEME_SCRIPT);
      expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
      expect(html).toContain('<h1');
      // The UK page shares no head with the site, so no preview card of it is offered (ADR-0029).
      expect(html.includes('og:image'), name).toBe(name !== 'not-available');
    });
  }

  it('gives the site pages the footer with the disclaimer, the risk link and the legal links', () => {
    for (const name of ['index', 'terms', 'contact', '404', 'en/learn', 'en/learn/noise'] as const) {
      const html = renderSitePage(name, assets, data);
      expect(html, name).toContain('Data and tools, not advice. Crypto-assets can lose all their value.');
      expect(html, name).toContain('<a href="/risk">Read the risk disclosure</a>');
      expect(html, name).toContain('<nav aria-label="Legal information">');
      expect(html, name).toContain(STYLESHEET);
    }
  });

  it('renders the holding page, the contact section and the offline page as the Next host did', () => {
    expect(renderSitePage('index', assets, data)).toContain('<h1 class="text-28">proof of calm</h1>');
    expect(renderSitePage('index', assets, data)).toContain('<title>Proof of Calm</title>');
    const contact = renderSitePage('contact', assets, data);
    expect(contact).toContain('<section id="security" aria-labelledby="security-title"');
    expect(contact).toContain('<a href="/.well-known/security.txt">security.txt</a>');
    expect(contact).toContain('<title>Contact · Proof of Calm</title>');
    const offline = renderSitePage('~offline', assets, data);
    expect(offline).toContain('<h1 class="text-28">Offline</h1>');
    expect(offline).not.toContain('<footer');
    expect(renderSitePage('404', assets, data)).toContain('<h1 class="text-28">Page not found</h1>');
  });

  it('renders the Learn pages under /en/ with their canonical URL and no live figure (ADR-0045 Deviations of 2026-11-15)', () => {
    const index = renderSitePage('en/learn', assets, data);
    expect(index).toContain('<title>Learn · Proof of Calm</title>');
    expect(index).toContain('<link rel="canonical" href="https://proofofcalm.com/en/learn">');
    expect(index).toContain('href="/en/learn/risk-honestly"');
    expect(index).toContain('href="/en/learn/taxes-where-you-live"');
    expect(index).toContain('href="/en/countries"');
    const risk = renderSitePage('en/learn/risk-honestly', assets, data);
    expect(risk).toContain('<title>Risk honestly · Proof of Calm</title>');
    expect(risk).toContain('<link rel="canonical" href="https://proofofcalm.com/en/learn/risk-honestly">');
    expect(risk).toContain('<main id="main">');
    expect(risk).toContain('href="/en/learn"');
    expect(risk).toContain('intraday highs and lows in US dollars');
    const drops = renderSitePage('en/learn/when-the-market-drops', assets, data);
    expect(drops).toContain('When the market drops');
    expect(drops).not.toContain('href="/learn');
  });

  it('ends Taxes with every country row and renders each country and the holding rules as pages', () => {
    const taxes = renderSitePage('en/learn/taxes-where-you-live', assets, data);
    // A visitor has no plan, so one line before the body says which sections describe the app with one.
    const lead = taxes.indexOf(
      'The sections before “How fast rules change” describe what the app shows once a plan is set up. The list at the end links to each country&#x27;s page.',
    );
    expect(lead).toBeGreaterThan(taxes.indexOf('a local accountant knows your situation'));
    expect(lead).toBeLessThan(taxes.indexOf('What Proof of Calm shows'));
    expect(renderSitePage('en/learn/risk-honestly', assets, data)).not.toContain('once a plan is set up');
    const rows = taxes.slice(taxes.lastIndexOf('<h2 class="text-20">Countries</h2>'));
    for (const entry of data.countries.entries) {
      expect(rows).toContain(`href="/en/countries/${entry.code.toLowerCase()}"`);
    }
    const pt = renderSitePage('en/countries/pt', assets, data);
    // The head names the question a search asks (docs/GROWTH.md §4.1); the h1 stays the card's name.
    expect(pt).toContain('<title>Crypto tax in Portugal · Proof of Calm</title>');
    expect(pt).toMatch(/<h1[^>]*>Portugal<\/h1>/);
    expect(pt).toContain('<link rel="canonical" href="https://proofofcalm.com/en/countries/pt">');
    expect(pt).toContain('href="/en/countries"');
    // A dated rule links the holding-date tool with the country chosen; a rule with no period does not.
    expect(pt).toContain('href="/en/holding-date#country=pt"');
    expect(renderSitePage('en/countries/fr', assets, data)).not.toContain('href="/en/holding-date');
    // The three names that take the article in English.
    for (const [code, name] of [
      ['gb', 'the United Kingdom'],
      ['us', 'the United States'],
      ['nl', 'the Netherlands'],
      ['de', 'Germany'],
    ]) {
      expect(renderSitePage(`en/countries/${code}`, assets, data)).toContain(
        `<title>Crypto tax in ${name} · Proof of Calm</title>`,
      );
    }
    const list = renderSitePage('en/countries', assets, data);
    expect(list).toContain('<title>Crypto tax rules by country · Proof of Calm</title>');
    expect(list).toContain(
      '<h1 class="text-28">Countries</h1><p class="text-16">Tax and holding rules by country, with their sources and the date each was last reviewed.</p>',
    );
    const holding = renderSitePage('en/holding-date', assets, data);
    expect(holding).toContain('<title>Holding rules by country · Proof of Calm</title>');
    // A visitor has seen no card, so the intro names none (docs/CONTENT-STYLE.md §1).
    expect(holding).toContain(
      '<p class="text-16">Each country&#x27;s holding rule with every condition, its sources, and the date it was last reviewed.</p>',
    );
    expect(pt).toContain('>Sources for Portugal</h2>');
    expect(holding).toContain('href="/en/countries/pt"');
    expect(() => renderSitePage('en/countries/xx', assets, data)).toThrow('no listed country XX');
  });

  it('writes the not-available page as the UK block defines it', () => {
    expect(renderSitePage('not-available', assets, data)).toBe(notAvailableHtml());
  });

  it('writes the manifest as JSON', () => {
    const parsed: unknown = JSON.parse(manifestJson());
    expect(parsed).toMatchObject({ start_url: '/today', display: 'standalone', name: 'Proof of Calm' });
  });
});
