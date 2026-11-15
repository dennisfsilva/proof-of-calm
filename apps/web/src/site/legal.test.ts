import learnMessages from '@proofofcalm/app/messages/en/learn.json';
import type { CalendarDate } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import messages from '../../messages/en.json';
import { loadSiteData, renderSitePage } from './render';
import { RISK_LINKS } from './risk-links';

const ASSETS = ['<link rel="stylesheet" crossorigin href="/assets/app-1.css">'];
const data = await loadSiteData('2026-11-15' as CalendarDate);

type LegalName = 'terms' | 'privacy' | 'risk' | 'cookies' | 'contact';

/** React's escapes undone, so a test reads the copy as a person does. */
const unescaped = (html: string) =>
  html.replaceAll('&#x27;', "'").replaceAll('&quot;', '"').replaceAll('&amp;', '&').replaceAll('&lt;', '<');

/** The page's main element. */
function main(name: LegalName): string {
  const html = renderSitePage(name, ASSETS, data);
  return unescaped(html.slice(html.indexOf('<main'), html.indexOf('</main>')));
}

/** Markup as the text a person reads: tags dropped, spaces joined. */
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');

/** One section of the Risk page by its id. */
const section = (page: string, id: string) =>
  page.match(new RegExp(`<section[^>]*aria-labelledby="risk-${id}-title"[^>]*>(.*?)</section>`))?.[1] ?? '';

describe('the Risk disclosure (docs/LEGAL.md §5)', () => {
  const risk = messages.legal.risk;

  it("ends the Risk lead with LEGAL §4's sentence", () => {
    expect(risk.lead.endsWith('Use only money you will not need for years.')).toBe(true);
    expect(risk.lead).not.toContain('afford to lose');
    expect(text(main('risk'))).toContain('you could lose all the money you put in. Use only money you will not need');
  });

  it('shows no placeholder on Risk, while Terms, Privacy, Cookies and Contact keep it', () => {
    const placeholder = messages.legal.placeholder.replace('{product}', 'Proof of Calm');
    expect(text(main('risk'))).not.toContain(placeholder);
    for (const name of ['terms', 'privacy', 'cookies', 'contact'] as const) {
      expect(text(main(name)), name).toContain(placeholder);
    }
  });

  it("has §5's sections in order under one h1", () => {
    const page = main('risk');
    expect(page.match(/<h1/g) ?? []).toHaveLength(1);
    const ids = [...page.matchAll(/<section[^>]*aria-labelledby="risk-([a-z]+)-title"/g)].map((match) => match[1]);
    expect(ids).toEqual(['dca', 'falls', 'custody', 'status', 'tax', 'scams', 'register', 'adviser', 'warnings']);
    const titles = [...page.matchAll(/<h2 id="risk-([a-z]+)-title"[^>]*>(.*?)<\/h2>/g)].map((match) => match[2]);
    const sections = risk as unknown as Record<string, { title: string } | undefined>;
    expect(titles).toEqual(ids.map((id) => sections[id ?? '']?.title));
  });

  it('lists every row of the cycles file with coin, high, low and fall', () => {
    const falls = section(main('risk'), 'falls');
    const rows = [...falls.matchAll(/<tbody>(.*?)<\/tbody>/g)].flatMap((match) =>
      [...(match[1] ?? '').matchAll(/<tr[^>]*>(.*?)<\/tr>/g)].map((row) => text(row[1] ?? '')),
    );
    expect(data.learn.falls.length).toBeGreaterThan(0);
    expect(rows).toHaveLength(data.learn.falls.length);
    // The cycles file (packages/content/cycles/drawdowns.json): Bitcoin's first fall, Solana's, and Chainlink's last.
    for (const row of [
      /^BTC8 Jun 201122 Nov 2011[-−]94 ?%$/,
      /^ETH13 Jan 201814 Dec 2018[-−]94 ?%$/,
      /^SOL6 Nov 202129 Dec 2022[-−]97 ?%$/,
      /^LINK10 May 202110 Jun 2023[-−]91 ?%$/,
    ]) {
      expect(
        rows.some((candidate) => row.test(candidate)),
        String(row),
      ).toBe(true);
    }
  });

  it('sets the source line and past-performance line right after the falls', () => {
    const falls = section(main('risk'), 'falls');
    const after = text(falls.slice(falls.indexOf('</table>')));
    expect(after).toMatch(/^ ?.*intraday highs and lows in US dollars, 8 Jun 2011 to 10 Jun 2023; the falls are/);
    expect(after.trim().endsWith(learnMessages.module.pastPerformance)).toBe(true);
  });

  it('carries the register sentence as §5 words it', () => {
    const register = section(main('risk'), 'register');
    expect(text(register)).toContain(
      "ESMA keeps a public register of the providers authorised under MiCA: ESMA's register of crypto-asset service providers. Check any provider there before sending money. Proof of Calm is not a provider and is not listed.",
    );
    const esma = RISK_LINKS.find((link) => link.id === 'esma-register');
    expect(register).toContain(`href="${esma?.url}"`);
    expect(risk.links['esma-register']).not.toMatch(/authoris|authoriz|regulat|licens|approved/i);
  });

  it('links each official warning over https with its accessed date', () => {
    const page = main('risk');
    expect(RISK_LINKS.map((link) => link.id)).toEqual([
      'esma-register',
      'cmvm',
      'bafin',
      'fca',
      'esas-pt',
      'esas-de',
      'esas-en',
    ]);
    for (const link of RISK_LINKS) {
      expect(link.url, link.id).toMatch(/^https:\/\/[^/]+\.[^/]+\//);
      expect(link.accessed, link.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const warnings = section(page, 'warnings');
    const items = [...warnings.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((match) => match[1] ?? '');
    expect(items).toHaveLength(RISK_LINKS.length - 1);
    for (const [index, link] of RISK_LINKS.slice(1).entries()) {
      const item = items[index] ?? '';
      expect(item, link.id).toContain(`href="${link.url}"`);
      expect(item, link.id).toContain('target="_blank"');
      expect(item, link.id).toContain('rel="noopener noreferrer"');
      expect(text(item), link.id).toContain(risk.links[link.id]);
      expect(text(item), link.id).toContain('15 Nov 2026');
    }
    expect(text(section(page, 'register'))).toContain('15 Nov 2026');
  });

  it('throws for risk without site data', () => {
    expect(() => renderSitePage('risk', ASSETS)).toThrow('risk renders from the loaded site data');
  });
});

describe('the Cookie-free statement (docs/LEGAL.md §5)', () => {
  it('has one h1 and names the display settings the browser keeps and the drafts', () => {
    const page = main('cookies');
    expect(page.match(/<h1/g) ?? []).toHaveLength(1);
    const stored = page.split(/(?<=\.) /).find((sentence) => sentence.includes('display settings'));
    expect(stored).toBeDefined();
    for (const setting of ['theme', 'reduced motion', 'chart range', "the Log's view"]) {
      expect(stored).toContain(setting);
    }
    expect(page).toContain('until the tab closes');
    expect(page).toContain('Delete everything in Settings clears these too.');
  });

  it('lists what the browser keeps in order, with what lasts only for the tab last', () => {
    const paragraphs = main('cookies').match(/<p>[^<]*<\/p>/g) ?? [];
    const starts = [
      'Your browser keeps your plan',
      'Your browser also keeps your display settings',
      'Your browser keeps a record of the entries you deleted',
      'It keeps a random identifier for this device',
      'Your browser keeps form drafts until the tab closes',
    ];
    expect(paragraphs.slice(-starts.length).map((p) => p.slice(3, 3 + 60))).toEqual(
      starts.map((start) => expect.stringContaining(start)),
    );
  });

  // Everything M1 keeps in the browser, each in a sentence that also says why (§5's outline).
  it.each([
    ['your plan, your entries, and the prices fetched for your coins', 'so the app works offline'],
    ["the app's files", 'so the app opens offline'],
    ['the pages you opened for up to 7 days and the latest price data for 24 hours', 'so they show offline'],
    ['the date each copy was saved', 'so copies past their limit are cleared'],
    ['your display settings', 'so they stay as you chose them'],
    ['the dates of your last JSON backup and your last change', 'so the app can remind you to export a copy'],
    ['the banners you dismissed or that showed once', 'so they stay hidden'],
    ['the date of your last annual review', 'so the next review shows when it is due'],
    ['the entries you deleted on this device', 'so an import with Add missing entries only cannot bring them back'],
    [
      'the plan and entries that Replace everything removed, in full and marked as deleted',
      'so that import cannot bring the entries back either',
    ],
    ['These records stay', "until you choose Delete everything in Settings or clear this site's data in your browser"],
    ['a random identifier for this device', 'so your changes apply in the order you made them'],
    ['It does not leave this browser', 'no request and no backup carries it'],
    ['a copy of each change to your plan and entries', 'for syncing between devices, which the app does not offer'],
    [
      'any stored data that failed its check when read',
      'set aside instead of deleted, so a failed check erases nothing',
    ],
    ['form drafts until the tab closes', 'so what you typed comes back when you return to the form'],
    ['the tab keeps a short note until it closes', 'so it reloads only once'],
  ])('names %s and why', (item, why) => {
    const sentence = main('cookies')
      .split(/(?<=\.) |<\/?p>/)
      .find((s) => s.includes(item));
    expect(sentence).toBeDefined();
    expect(sentence).toContain(why);
  });
});
