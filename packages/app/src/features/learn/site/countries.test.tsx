import type { CalendarDate } from '@proofofcalm/core';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CountryCardModel, CountryEntry } from '../../../lib/services';
import learn from '../../../messages/en/learn.json';
import {
  type CountrySite,
  loadCountrySite,
  SiteCountryList,
  SiteCountryPage,
  SiteCountryRows,
  SiteHoldingDates,
  type SiteLinks,
  StaticLearn,
} from './index';

// The country library and the holding rules as script-free static pages (ADR-0048 Deviations of 2026-11-15), rendered
// to a string as the web host's prerender renders them, in Node, from the real profiles at the today passed in.

const TODAY = '2026-11-15' as CalendarDate;
/** More than twelve months past every profile's `nextReviewDue`: every card is under review (docs/JURISDICTIONS.md §1). */
const LATE = '2031-01-01' as CalendarDate;

const LINKS: SiteLinks = {
  learn: '/site/learn',
  module: (slug) => `/site/learn/${slug}`,
  countries: '/site/countries',
  country: (code) => `/site/country-of/${code}`,
  holding: '/site/holding-date',
};

const html = (node: ReactNode, today = TODAY) => renderToStaticMarkup(<StaticLearn today={today}>{node}</StaticLearn>);
/** A text as the markup escapes it. */
const esc = (text: string) => renderToStaticMarkup(text);

/** No script, and no style attribute, which the site's CSP refuses (ADR-0045 §3 and §6). */
const expectStatic = (markup: string) => {
  expect(markup).not.toContain('<script');
  expect(markup).not.toContain('style="');
};

/** Every link to a country is one `links.country` made, for a listed code. */
const expectCountryLinks = (markup: string, entries: readonly CountryEntry[]) => {
  const hrefs = [...markup.matchAll(/href="(\/site\/country[^"]*)"/g)].map((match) => match[1]);
  expect(hrefs).toEqual(entries.map((entry) => LINKS.country(entry.code)));
};

let site: CountrySite;
let late: CountrySite;
beforeAll(async () => {
  [site, late] = await Promise.all([loadCountrySite(TODAY), loadCountrySite(LATE)]);
});

const card = (code: string, from = site): CountryCardModel => {
  const found = from.cards.get(code);
  if (found === undefined) throw new Error(`no card ${code}`);
  return found;
};

describe('loadCountrySite', () => {
  it('lists every profile but the generic one by name, with a card per listed code', () => {
    const codes = site.entries.map((entry) => entry.code);
    expect(codes).not.toContain('XX');
    expect(codes).toContain('PT');
    expect([...site.cards.keys()].sort()).toEqual([...codes].sort());
    expect(site.entries.map((entry) => entry.name)).toEqual([...site.entries.map((entry) => entry.name)].sort());
  });

  it('derives each card at the today passed in', () => {
    expect(card('PT').underReview).toBe(false);
    expect(card('PT', late).underReview).toBe(true);
  });
});

describe('SiteCountryList', () => {
  it('links each country through links.country and never lists the generic profile', () => {
    const markup = html(<SiteCountryList entries={site.entries} links={LINKS} />);
    expectStatic(markup);
    expectCountryLinks(markup, site.entries);
    expect(markup).toContain(`href="${LINKS.learn}"`);
    expect(markup).toContain(learn.countries.title);
    expect(markup).not.toContain('Other country');
  });
});

describe('SiteCountryRows', () => {
  it('lists every country under Countries, each through links.country', () => {
    const markup = html(<SiteCountryRows entries={site.entries} links={LINKS} />);
    expectStatic(markup);
    expectCountryLinks(markup, site.entries);
    expect(markup).toContain(`<h2 class="text-20">${learn.countries.title}</h2>`);
  });
});

describe('SiteCountryPage', () => {
  it('renders the card with its holding rule, every condition and the way back to the list', () => {
    const pt = card('PT');
    const markup = html(<SiteCountryPage card={pt} links={LINKS} />);
    expectStatic(markup);
    expect(markup).toContain(`href="${LINKS.countries}"`);
    expect(markup).toContain(learn.countries.back);
    expect(markup).toContain(esc(pt.card.summary60));
    expect(markup).toContain(esc(pt.card.holdingRuleText));
    for (const condition of pt.holdingRuleConditions) expect(markup).toContain(esc(condition));
  });

  it('renders a card under review as its title and the under-review date line only', () => {
    const pt = card('PT', late);
    const markup = html(<SiteCountryPage card={pt} links={LINKS} />, LATE);
    expectStatic(markup);
    expect(markup).toContain(`>${esc(pt.name)}</h1>`);
    expect(markup).toContain('Not reviewed since');
    expect(markup).not.toContain(esc(pt.card.summary60));
    expect(markup).not.toContain(esc(pt.card.holdingRuleText));
    expect(markup).not.toContain('Sources');
  });

  /** The page as the host renders it with the country's rules: the links to the tool it holds. */
  const toolLinks = (code: string, from = site, today = TODAY) => {
    const rules = from.rules.get(code);
    const markup = html(
      <SiteCountryPage
        card={card(code, from)}
        holding={rules === undefined ? undefined : { code, rules }}
        links={LINKS}
      />,
      today,
    );
    return [...markup.matchAll(/href="(\/site\/holding-date[^"]*)"[^>]*>([^<]*)</g)].map(([, href, text]) => ({
      href,
      text,
    }));
  };

  it('links the holding-date tool, its country chosen, for a dated rule only: PT, DE and US', () => {
    const linked = site.entries.filter((entry) => toolLinks(entry.code).length > 0).map((entry) => entry.code);
    expect(linked.sort()).toEqual(['DE', 'PT', 'US']);
    for (const code of linked) {
      expect(toolLinks(code)).toEqual([
        { href: `${LINKS.holding}#country=${code.toLowerCase()}`, text: learn.countries.holdingTool },
      ]);
    }
  });

  it('links no tool for a country under review, nor without its rules', () => {
    expect(late.entries.length).toBeGreaterThan(0);
    for (const entry of late.entries) expect(toolLinks(entry.code, late, LATE), entry.code).toEqual([]);
    expect(html(<SiteCountryPage card={card('PT')} links={LINKS} />)).not.toContain(LINKS.holding);
  });
});

describe('SiteHoldingDates', () => {
  it('shows every holding rule with all its conditions, its sources and its date line', () => {
    const markup = html(<SiteHoldingDates entries={site.entries} cards={site.cards} links={LINKS} />);
    expectStatic(markup);
    expectCountryLinks(markup, site.entries);
    expect(markup).toContain(learn.holding.title);
    expect(markup).not.toContain('Other country');
    for (const entry of site.entries) {
      const country = card(entry.code);
      expect(markup).toContain(esc(country.card.holdingRuleText));
      for (const condition of country.holdingRuleConditions) expect(markup).toContain(esc(condition));
      if (country.ruleSources.holdingRule !== null)
        expect(markup).toContain(`href="${country.ruleSources.holdingRule}"`);
    }
    expect(markup.match(/general information, not advice/g)).toHaveLength(site.entries.length);
  });

  it('shows a country under review by its name and the under-review date line only', () => {
    const markup = html(<SiteHoldingDates entries={late.entries} cards={late.cards} links={LINKS} />, LATE);
    expectStatic(markup);
    expect(markup.match(/Not reviewed since/g)).toHaveLength(late.entries.length);
    const pt = card('PT', late);
    expect(markup).toContain(esc(pt.name));
    expect(markup).not.toContain(esc(pt.card.holdingRuleText));
    expect(markup).not.toContain('Sources');
  });
});
