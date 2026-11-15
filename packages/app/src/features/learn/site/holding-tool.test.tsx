// @vitest-environment jsdom
import type { CalendarDate } from '@proofofcalm/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import learn from '../../../messages/en/learn.json';
import { decodeHoldingRule, effectsOf } from './holding-tool.ts';
import { type CountrySite, loadCountrySite, SiteHoldingTool, type SiteLinks, StaticLearn } from './index';

// The holding-date tool's markup (its design check of 2026-11-15), rendered as the
// web host's prerender renders it: a form shown only with script, posting nowhere, and a hidden result block per
// country that the page's script reveals; every word in it is from the messages or the profiles.

const TODAY = '2026-11-15' as CalendarDate;
/** More than twelve months past every profile's `nextReviewDue`: every card is under review. */
const LATE = '2031-01-01' as CalendarDate;

const LINKS: SiteLinks = {
  learn: '/site/learn',
  module: (slug) => `/site/learn/${slug}`,
  countries: '/site/countries',
  country: (code) => `/site/country-of/${code}`,
  holding: '/site/holding-date',
};

const T = learn.holding.tool;

let site: CountrySite;
let late: CountrySite;
beforeAll(async () => {
  [site, late] = await Promise.all([loadCountrySite(TODAY), loadCountrySite(LATE)]);
});

const markup = (from: CountrySite, today: CalendarDate) =>
  renderToStaticMarkup(
    <StaticLearn today={today}>
      <SiteHoldingTool entries={from.entries} cards={from.cards} rules={from.rules} links={LINKS} today={today} />
    </StaticLearn>,
  );
const dom = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const all = (root: ParentNode, selector: string) => [...root.querySelectorAll<HTMLElement>(selector)];
const blockOf = (doc: Document, code: string) => {
  const block = doc.querySelector<HTMLElement>(`[data-country="${code.toLowerCase()}"]`);
  if (block === null) throw new Error(`no block ${code}`);
  return block;
};

describe('SiteHoldingTool', () => {
  it('has no script and no style attribute, posts nowhere and is hidden without script', () => {
    const html = markup(site, TODAY);
    expect(html).not.toContain('<script');
    expect(html).not.toContain('style="');
    const form = dom(html).querySelector('form');
    expect(form?.getAttribute('method')).toBe('dialog');
    expect(form?.classList.contains('noscript:hidden')).toBe(true);
    expect(form?.hasAttribute('action')).toBe(false);
  });

  it('says what the app does with the rule', () => {
    expect(dom(markup(site, TODAY)).body.textContent).toContain(T.app);
  });

  it('lists a radio per country in the library’s order, none checked, each with its rule', () => {
    const radios = all(dom(markup(site, TODAY)), 'input[type="radio"]') as HTMLInputElement[];
    expect(radios.map((radio) => radio.value)).toEqual(site.entries.map((entry) => entry.code.toLowerCase()));
    expect(radios.every((radio) => radio.name === 'country' && !radio.checked)).toBe(true);
    for (const radio of radios) {
      const rules = site.rules.get(radio.value.toUpperCase());
      expect(decodeHoldingRule(radio.dataset.rule ?? ''), radio.value).toEqual(rules);
    }
  });

  it('carries no rule on the radio of a country under review', () => {
    const radios = all(dom(markup(late, LATE)), 'input[type="radio"]');
    expect(radios).toHaveLength(late.entries.length);
    expect(radios.every((radio) => !radio.hasAttribute('data-rule'))).toBe(true);
  });

  it('has one empty date field from the first block to the build’s day plus one year, and a submit button', () => {
    const doc = dom(markup(site, TODAY));
    const dates = all(doc, 'input[type="date"]') as HTMLInputElement[];
    expect(dates).toHaveLength(1);
    const [field] = dates;
    expect(field?.name).toBe('bought');
    expect(field?.hasAttribute('value')).toBe(false);
    expect([field?.min, field?.max]).toEqual(['2009-01-03', '2027-11-15']);
    expect(doc.querySelector(`label[for="${field?.id}"]`)?.textContent).toBe(T.bought);
    expect(doc.querySelector('button[type="submit"]')?.textContent).toBe(T.submit);
  });

  it('keeps a hidden block per country in a polite live region, with a hidden date hint', () => {
    const doc = dom(markup(site, TODAY));
    const region = doc.querySelector('[aria-live="polite"]');
    expect(region).not.toBeNull();
    const blocks = all(region as Element, '[data-country]');
    expect(blocks.map((block) => block.dataset.country)).toEqual(site.entries.map((e) => e.code.toLowerCase()));
    expect(blocks.every((block) => block.hidden)).toBe(true);
    const hint = doc.querySelector<HTMLElement>('[data-holding-invalid]');
    expect(hint?.hidden).toBe(true);
    expect(hint?.textContent).toBe('Enter a purchase date from 3 Jan 2009 to 15 Nov 2027.');
  });

  it('gives every listed block its Sources link and date line', () => {
    const doc = dom(markup(site, TODAY));
    for (const entry of site.entries) {
      const block = blockOf(doc, entry.code);
      const card = site.cards.get(entry.code);
      const source = card?.ruleSources.holdingRule ?? null;
      expect(source, entry.code).not.toBeNull();
      expect(all(block, `a[href="${source}"]`).map((link) => link.textContent)).toContain(learn.card.sources);
      expect(block.textContent).toContain('Reviewed on');
    }
  });

  it('puts the date, the purchase date, the note and the conditions on every dated effect, and no date elsewhere', () => {
    const doc = dom(markup(site, TODAY));
    const dated: string[] = [];
    for (const entry of site.entries) {
      const block = blockOf(doc, entry.code);
      const rules = site.rules.get(entry.code);
      const card = site.cards.get(entry.code);
      if (rules === undefined || card === undefined) throw new Error(entry.code);
      const effects = effectsOf(rules.rule, rules.overrides);
      const children = all(block, '[data-effect]');
      expect(children.map((child) => child.dataset.effect)).toEqual(effects);
      if (effects.length === 0) {
        expect(block.textContent).toContain(card.card.holdingRuleText);
        expect(block.querySelector('time')).toBeNull();
        continue;
      }
      dated.push(entry.code);
      for (const child of children) {
        expect(child.hidden).toBe(true);
        expect(child.querySelector('time[data-from]')).not.toBeNull();
        expect(child.querySelector('time[data-bought]')).not.toBeNull();
        expect(child.textContent).toContain(T.note);
        const [first, ...rest] = card.holdingRuleConditions;
        if (first !== undefined) expect(child.textContent).toContain(first);
        const details = child.querySelector('details');
        if (rest.length === 0) expect(details).toBeNull();
        else {
          expect(details?.open).toBe(false);
          expect(details?.querySelector('summary')?.textContent).toBe(
            rest.length === 1 ? 'Show 1 more condition' : `Show ${rest.length} more conditions`,
          );
          expect(all(details as Element, 'li').map((li) => li.textContent)).toEqual(rest);
        }
      }
    }
    expect(dated.sort()).toEqual(['DE', 'PT', 'US']);
    const effectText = (code: string) => blockOf(doc, code).querySelector('[data-effect]')?.textContent ?? '';
    expect(effectText('PT')).toContain('Tax-free from');
    expect(effectText('US')).toContain('Long-term rate from');
  });

  it('shows a country under review by its name and the under-review date line, with no date or Sources', () => {
    const doc = dom(markup(late, LATE));
    for (const entry of late.entries) {
      const block = blockOf(doc, entry.code);
      expect(block.querySelector('h2')?.textContent).toBe(entry.name);
      expect(block.textContent).toContain('Not reviewed since');
      expect(block.querySelector('[data-effect]')).toBeNull();
      expect(all(block, 'a').map((link) => link.textContent)).not.toContain(learn.card.sources);
    }
  });
});
