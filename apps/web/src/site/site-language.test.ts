import { readFileSync } from 'node:fs';
import { createDateFormatter } from '@proofofcalm/app/lib/format';
import { localesFor } from '@proofofcalm/app/lib/i18n';
import type { CalendarDate } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import english from '../../messages/en.json';
import portuguese from '../../messages/pt-PT.json';
import { loadSiteData, renderSitePage, type SitePage, sitePages } from './render';
import { RISK_LINKS } from './risk-links';

// The site pages in pt-PT before the native read (ADR-0045, the Deviations of 2026-11-18): every site message but the
// four legal pages' own objects is translated, the pages that carry them render in pt-PT with their English parts
// marked `lang="en"`, and no public page has a pt-PT version. English stays as it was.

type Tree = { [key: string]: string | Tree };
const leaves = (node: string | Tree, path = ''): [string, string][] =>
  typeof node === 'string'
    ? [[path, node]]
    : Object.entries(node).flatMap(([key, value]) => leaves(value, path === '' ? key : `${path}.${key}`));

/** The four legal pages whose English waits for the owner: their objects stay English in every language. */
const ENGLISH_ONLY = ['legal.terms.', 'legal.privacy.', 'legal.cookies.', 'legal.contact.'];
const englishOnly = (key: string) => ENGLISH_ONLY.some((prefix) => key.startsWith(prefix));

/** A message's ICU arguments and rich tags, sorted: the site messages use plain arguments only. */
const shape = (message: string) =>
  [...message.matchAll(/\{(\w+)[^}]*\}|<(\w+)>/g)].map(([, arg, tag]) => (arg ? `arg:${arg}` : `tag:${tag}`)).sort();

const ASSETS = ['<link rel="stylesheet" crossorigin href="/assets/app-1.css">'];
const data = await loadSiteData('2026-11-15' as CalendarDate);
const COVERED = [
  'index',
  'terms',
  'privacy',
  'risk',
  'cookies',
  'contact',
  '~offline',
  '404',
  'not-available',
] as const;

const unescaped = (html: string) =>
  html.replaceAll('&#x27;', "'").replaceAll('&#39;', "'").replaceAll('&quot;', '"').replaceAll('&amp;', '&');

const VOID = new Set(['area', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
/** The page with every element marked `lang="en"` emptied: what a pt-PT reader gets as Portuguese. */
function outsideEnglish(html: string): string {
  const open: boolean[] = [];
  let kept = '';
  let last = 0;
  for (const match of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g)) {
    const [tag, closing, name = '', attributes = ''] = match;
    if (!open.includes(true)) kept += html.slice(last, match.index) + tag;
    if (closing) open.pop();
    else if (!VOID.has(name) && !attributes.endsWith('/')) open.push(/\blang="en"/.test(attributes));
    last = match.index + tag.length;
  }
  return kept + html.slice(last);
}

/** The fixed words of the English messages, split at their arguments and tags. */
const fragments = (keys: (key: string) => boolean) =>
  leaves(english)
    .filter(([key]) => keys(key))
    .flatMap(([, message]) => message.split(/\{[^}]*\}|<\/?\w+>/))
    .map((part) => part.trim())
    .filter((part) => part.length >= 4);

describe('the pt-PT site messages', () => {
  const translated = new Map(leaves(portuguese));

  it('translates every English key but the four legal pages’ objects, with the same arguments and tags', () => {
    const source = new Map(leaves(english));
    const problems = [...translated].flatMap(([key, message]) => {
      const original = source.get(key);
      if (original === undefined) return [`${key}: not an English key`];
      return shape(message).join() === shape(original).join()
        ? []
        : [`${key}: ${shape(message)} for ${shape(original)}`];
    });
    for (const key of source.keys()) {
      if (englishOnly(key) === translated.has(key))
        problems.push(`${key}: ${englishOnly(key) ? 'translated' : 'missing'}`);
    }
    expect(problems).toEqual([]);
  });

  it('words the Risk page’s status as CONTENT-STYLE §2 holds it', () => {
    const style = readFileSync(new URL('../../../../docs/CONTENT-STYLE.md', import.meta.url), 'utf8');
    const quoted = /The Risk page's statement on status[\s\S]*?«([^»]+)»/.exec(style)?.[1]?.replace(/\s+/g, ' ');
    expect(quoted).toBeDefined();
    expect(translated.get('legal.risk.status.p1')).toBe(`A {product} ${quoted}.`);
    expect(unescaped(renderSitePage('risk', ASSETS, data, 'pt-PT'))).toContain(`A Proof of Calm ${quoted}.`);
  });
});

describe('a site page in pt-PT', () => {
  const portugueseOnly = fragments((key) => !englishOnly(key));
  const legalOnly = fragments(englishOnly);

  it.each(COVERED)('%s is in Portuguese, its English parts marked', (name) => {
    const html = unescaped(renderSitePage(name, ASSETS, data, 'pt-PT'));
    expect(html).toContain('<html lang="pt-PT">');
    const portugueseText = outsideEnglish(html.slice(html.indexOf('<html')));
    expect(portugueseOnly.filter((part) => portugueseText.includes(part))).toEqual([]);
    const body = outsideEnglish(html.slice(html.indexOf('<body>')));
    expect(legalOnly.filter((part) => body.includes(part))).toEqual([]);
  });

  it('marks the Risk page’s table of falls, read from the English Learn messages, as English', () => {
    const html = renderSitePage('risk', ASSETS, data, 'pt-PT');
    expect(html).toMatch(/<div lang="en" class="contents"><div[^>]*role="region"/);
  });

  it('writes the day each official link was read in Portuguese', () => {
    const html = renderSitePage('risk', ASSETS, data, 'pt-PT');
    const date = createDateFormatter(localesFor('pt-PT', null).ui);
    for (const link of RISK_LINKS) expect(html, link.id).toContain(`Ligação verificada a ${date(link.accessed)}.`);
  });

  it('exists for no public page', () => {
    for (const name of sitePages(data).filter((page) => page.startsWith('en/'))) {
      expect(() => renderSitePage(name, ASSETS, data, 'pt-PT'), name).toThrow(`${name} has no pt-PT page`);
    }
  });
});

describe('a site page in English', () => {
  // Byte for byte as on main: the branch's gate compares the built pages with main's (`diff -r`).
  it.each(sitePages(data))('%s takes English by default and no pt-PT mark', (name: SitePage) => {
    const html = renderSitePage(name, ASSETS, data);
    expect(renderSitePage(name, ASSETS, data, 'en')).toBe(html);
    expect(html).toContain('<html lang="en">');
    expect(html).not.toContain('pt-PT');
  });
});
