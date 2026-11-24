// @vitest-environment jsdom
import { type CountryProfile, loadProfile, ruleSource } from '@proofofcalm/content';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { countryCardModel, ServicesProvider } from '../../../lib/services';
import { createTestServices } from '../../../lib/services/testing';
import countries from '../../../messages/en/countries.json';
import learn from '../../../messages/en/learn.json';
import shell from '../../../messages/en/shell.json';
import countriesPt from '../../../messages/pt-PT/countries.json';
import learnPt from '../../../messages/pt-PT/learn.json';
import shellPt from '../../../messages/pt-PT/shell.json';
import { GENERIC, GERMANY, PORTUGAL, SHAPES } from '../fixtures/profiles';
import { CountryCard } from './country-card';

// The country card (docs/JURISDICTIONS.md §1 and §2, docs/EDUCATION.md §4). Its structure and the links are
// asserted, and of Portugal's text only the summary and the first condition: the rest is the profile's to word.

afterEach(cleanup);

const RULES = ['rates', 'holdingRule', 'lotRule', 'losses', 'reporting'] as const;
const SOURCES = /^Sources for /;
// The query collapses the page's white space, U+00A0 included (`figure-join`, CONTENT-STYLE §4), so the text it
// looks for is collapsed alike.
const shown = (text: string) => text.replace(/\s+/g, ' ');

type Options = { profile?: CountryProfile; level?: 1 | 2; id?: string; nowMs?: number };

async function mount({ profile = PORTUGAL, level = 1, id, nowMs }: Options = {}) {
  const services = createTestServices(nowMs === undefined ? {} : { nowMs });
  await services.start();
  // The model as the countries port derives it at the test clock's today.
  const country = countryCardModel(profile, services.clock.today());
  const view = render(
    <ServicesProvider services={services}>
      <I18nProvider messages={{ countries, learn, shell }}>
        <CountryCard country={country} level={level} {...(id !== undefined && { id })} />
      </I18nProvider>
    </ServicesProvider>,
  );
  await act(() => Promise.resolve());
  return view.container.querySelector('article') as HTMLElement;
}

describe('CountryCard', () => {
  it('shows the summary first, then the sections one level below the title, and the conditions in a list', async () => {
    const card = await mount();
    const [title, ...sections] = within(card).getAllByRole('heading');
    expect(title?.tagName).toBe('H1');
    expect(title?.textContent).toBe('Portugal');
    expect(sections.map((heading) => heading.tagName)).toEqual(Array(sections.length).fill('H2'));
    expect(sections.map((heading) => heading.textContent)).toEqual([
      'How crypto is classified',
      'What is taxed',
      'Rates',
      'Allowances',
      'Holding rule',
      'Matching sales to purchases',
      'Losses',
      'Reporting',
      'Questions for an accountant',
      `Sources for ${PORTUGAL.name}`,
    ]);
    expect(card.children[1]?.textContent).toBe(PORTUGAL.card.summary60);
    const [first] = PORTUGAL.holdingRuleConditions;
    expect(screen.getByText(shown(first as string)).tagName).toBe('LI');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(/^Selling for money · Taxable$/)).toBeDefined();
    expect(screen.getAllByText(/^From \d+\s\w+\s\d{4}$/u)).toHaveLength(PORTUGAL.card.rates.length);
    expect(card.children[card.children.length - 2]?.textContent).toMatch(
      /^Reviewed on .+ · general information, not advice$/,
    );
  });

  it('links each rule to the source its key names, named by its rule, in a new tab', async () => {
    await mount();
    const links = screen.getAllByRole('link', { name: SOURCES });
    expect(links).toHaveLength(RULES.length);
    expect(screen.getAllByRole('link')).toHaveLength(RULES.length + PORTUGAL.sources.length);
    RULES.forEach((rule, index) => {
      const link = links[index] as HTMLAnchorElement;
      expect(link.getAttribute('href')).toBe(ruleSource(PORTUGAL, rule));
      expect(link.textContent).toBe('Sources');
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    });
    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual([
      'Sources for the rates',
      'Sources for the holding rule',
      'Sources for matching sales to purchases',
      'Sources for losses',
      'Sources for reporting',
    ]);
  });

  it("ends with every source of the profile, in the file's order, each with its publisher and date", async () => {
    // The foot lists `sources` as they stand (docs/JURISDICTIONS.md §2): the file holds only what backs a card line.
    expect(PORTUGAL.sources.length).toBeGreaterThan(0);
    const card = await mount();
    const foot = card.lastElementChild as HTMLElement;
    expect(within(foot).getByRole('heading', { level: 2 }).textContent).toBe(`Sources for ${PORTUGAL.name}`);
    const items = within(foot).getAllByRole('listitem');
    expect(items).toHaveLength(PORTUGAL.sources.length);
    PORTUGAL.sources.forEach((source, index) => {
      const item = items[index] as HTMLElement;
      const link = within(item).getByRole('link');
      expect(link.textContent).toBe(source.title);
      expect(link.getAttribute('href')).toBe(source.url);
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
      const dated = source.published === null ? 'accessed' : 'dated';
      expect(item.textContent).toMatch(new RegExp(`· ${dated} \\d+\\s\\w+\\s\\d{4}$`, 'u'));
      expect(item.textContent).toContain(source.publisher);
    });
  });

  // The sources heading takes the name's `for` form (`learn.sourceList`, lib/countries).
  it.each([
    ['NL', 'Sources for the Netherlands'],
    ['DE', 'Sources for Germany'],
  ])("heads %s's sources “%s”", async (code, heading) => {
    const profile = await loadProfile(code);
    if (profile === null) throw new Error(`no profile ${code}`);
    const card = await mount({ profile });
    const foot = card.lastElementChild as HTMLElement;
    expect(within(foot).getByRole('heading', { level: 2 }).textContent).toBe(heading);
  });

  // A source's title keeps the language it is written in, whatever the screen's (BUILD-PROMPT, the `lang` mark).
  it.each([
    ['DE', 'de'],
    ['US', 'en'],
  ])("marks each of %s's source links with the language of its title, %s", async (code, lang) => {
    const profile = await loadProfile(code);
    if (profile === null) throw new Error(`no profile ${code}`);
    const card = await mount({ profile });
    const links = within(card.lastElementChild as HTMLElement).getAllByRole('link');
    expect(links).toHaveLength(profile.sources.length);
    expect(links.map((link) => link.getAttribute('lang'))).toEqual(Array(links.length).fill(lang));
    // The mark is on the link alone: the publisher line is the app's.
    for (const link of links) expect(link.nextElementSibling?.hasAttribute('lang')).toBe(false);
  });

  it('lists no source that only a pending change lists', async () => {
    // A pending change's source that is none of the profile's, so the assertion holds whatever the file lists.
    const [change] = PORTUGAL.pendingChanges;
    if (change === undefined) throw new Error('Portugal lists a pending change');
    const pending = { ...change, source: { ...change.source, url: 'https://example.org/pending-change' } };
    await mount({ profile: { ...PORTUGAL, pendingChanges: [pending] } });
    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).not.toContain(pending.source.url);
    expect(hrefs).toEqual(expect.arrayContaining(PORTUGAL.sources.map((source) => source.url)));
  });

  it('shows no pending change', async () => {
    const card = await mount();
    expect(PORTUGAL.pendingChanges.length).toBeGreaterThan(0);
    for (const change of PORTUGAL.pendingChanges) expect(card.textContent).not.toContain(change.title);
  });

  // A review moves the profile's dates (docs/CONTENT-OPS.md §8): the twelve months run from a literal nextReviewDue.
  const DUE: CountryProfile = { ...PORTUGAL, status: { ...PORTUGAL.status, nextReviewDue: '2027-11-02' } };

  it('under review shows only the title and the under-review line, with no link', async () => {
    // nextReviewDue 2027-11-02: under review from 2028-11-03.
    const card = await mount({ profile: DUE, nowMs: Date.parse('2028-11-03T10:00:00Z') });
    expect(card.children).toHaveLength(2);
    expect(within(card).getAllByRole('heading')).toHaveLength(1);
    expect(card.lastElementChild?.textContent).toMatch(/^Not reviewed since .+ · general information, not advice$/);
    expect(screen.queryByRole('link')).toBeNull();
    expect(card.textContent).not.toContain(PORTUGAL.card.summary60);
  });

  it('is not under review on the last day of the twelve months', async () => {
    const card = await mount({ profile: DUE, nowMs: Date.parse('2028-11-02T10:00:00Z') });
    expect(card.textContent).toContain(PORTUGAL.card.summary60);
  });

  it('the generic profile takes the generic line and links no source, never under review', async () => {
    for (const nowMs of [undefined, Date.parse('2030-01-01T10:00:00Z')]) {
      const card = await mount({ profile: GENERIC, ...(nowMs !== undefined && { nowMs }) });
      expect(card.lastElementChild?.textContent).toMatch(/^Reviewed on .+: the general profile, not a rule/);
      expect(within(card).queryByRole('heading', { name: /^Sources for / })).toBeNull();
      expect(card.textContent).toContain(GENERIC.card.summary60);
      expect(screen.queryByRole('link')).toBeNull();
      cleanup();
    }
  });

  it('leaves the allowances out when the profile lists none', async () => {
    await mount({ profile: SHAPES['wealth-snapshot'] });
    expect(screen.queryByRole('heading', { name: 'Allowances' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Holding rule' })).toBeDefined();
  });

  it('applies the level and the id to the title', async () => {
    const card = await mount({ level: 2, id: 'country-pt' });
    const [title, ...sections] = within(card).getAllByRole('heading');
    expect(title?.tagName).toBe('H2');
    expect(title?.id).toBe('country-pt');
    expect(title?.getAttribute('tabindex')).toBe('-1');
    expect(new Set(sections.map((heading) => heading.tagName))).toEqual(new Set(['H3']));
  });
});

describe('CountryCard in pt-PT (WCAG 2.2 SC 3.1.2, ADR-0057)', () => {
  const IN_ENGLISH = learnPt.card.inEnglish;
  // Every element with a `lang`, and the source links with theirs: a profile in the page language marks only those.
  const marked = (card: HTMLElement) =>
    [...card.querySelectorAll('[lang]')].map((element) => [element.tagName, element.getAttribute('lang')]);
  const sourceMarks = (profile: CountryProfile) => profile.sources.map((source) => ['A', source.lang]);
  const mountPt = async (profile: CountryProfile) => {
    const services = createTestServices({ language: 'pt-PT' });
    await services.start();
    const view = render(
      <ServicesProvider services={services}>
        <I18nProvider locale="pt-PT" messages={{ countries: countriesPt, learn: learnPt, shell: shellPt }}>
          <CountryCard country={countryCardModel(profile, services.clock.today())} level={1} />
        </I18nProvider>
      </ServicesProvider>,
    );
    await act(() => Promise.resolve());
    return view.container.querySelector('article') as HTMLElement;
  };

  it("marks an English profile's text lang=en and says so in Portuguese, under the title", async () => {
    const card = await mountPt(GERMANY);
    expect(within(card).getByRole('heading', { level: 1 }).getAttribute('lang')).toBe('en');
    expect(screen.getByText(shown(GERMANY.card.summary60)).getAttribute('lang')).toBe('en');
    expect(screen.getByText(shown(GERMANY.card.holdingRuleText)).getAttribute('lang')).toBe('en');
    expect(screen.getByText(shown(GERMANY.card.lotRuleText)).getAttribute('lang')).toBe('en');
    const line = screen.getByText(IN_ENGLISH);
    expect(card.children[1]).toBe(line);
    expect(line.closest('[lang]')).toBeNull();
    expect(screen.getByRole('heading', { name: learnPt.card.holdingRule }).closest('[lang]')).toBeNull();
  });

  it("gives a translated profile's text no lang and no line", async () => {
    const portugal = await loadProfile('PT', 'pt-PT');
    if (portugal === null) throw new Error('no profile PT');
    const card = await mountPt(portugal);
    expect(marked(card)).toEqual(sourceMarks(portugal));
    expect(screen.queryByText(IN_ENGLISH)).toBeNull();
  });

  it('gives a copy no loader returned the page language: no lang, no line', async () => {
    const card = await mountPt(SHAPES.none);
    expect(marked(card)).toEqual(sourceMarks(SHAPES.none));
    expect(screen.queryByText(IN_ENGLISH)).toBeNull();
  });

  // The sources heading takes the name's `for` form, contracted (`learn.sourceList`, CONTENT-STYLE §9).
  it.each([
    ['NL', 'Fontes dos Países Baixos'],
    ['DE', 'Fontes da Alemanha'],
    ['ES', 'Fontes de Espanha'],
  ])("heads %s's sources «%s»", async (code, heading) => {
    const profile = await loadProfile(code, 'pt-PT');
    if (profile === null) throw new Error(`no profile ${code}`);
    const card = await mountPt(profile);
    const foot = card.lastElementChild as HTMLElement;
    expect(within(foot).getByRole('heading', { level: 2 }).textContent).toBe(heading);
  });

  // A model cached across a switch to English: the text is Portuguese, so the line that says it is English never shows.
  it('marks a Portuguese profile lang=pt-PT on an English screen and shows no line that it is in English', async () => {
    const portugal = await loadProfile('PT', 'pt-PT');
    if (portugal === null) throw new Error('no profile PT');
    const services = createTestServices();
    await services.start();
    const { container } = render(
      <ServicesProvider services={services}>
        <I18nProvider messages={{ countries, learn, shell }}>
          <CountryCard country={countryCardModel(portugal, services.clock.today())} level={1} />
        </I18nProvider>
      </ServicesProvider>,
    );
    await act(() => Promise.resolve());
    expect(screen.getByText(shown(portugal.card.summary60)).getAttribute('lang')).toBe('pt-PT');
    expect(screen.queryByText(learn.card.inEnglish)).toBeNull();
    expect(container.textContent).not.toContain(learn.card.inEnglish);
  });
});
