// @vitest-environment jsdom
import { GENERIC_COUNTRY, loadProfiles } from '@proofofcalm/content';
import type { Plan } from '@proofofcalm/core';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { Component, type ReactNode, Suspense } from 'react';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { NavigationProvider, Route } from '../../../lib/navigation';
import { ServicesProvider } from '../../../lib/services';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices, preloadLazyModules } from '../../../lib/services/testing';
import countries from '../../../messages/en/countries.json';
import learn from '../../../messages/en/learn.json';
import shell from '../../../messages/en/shell.json';
import countriesPt from '../../../messages/pt-PT/countries.json';
import learnPt from '../../../messages/pt-PT/learn.json';
import shellPt from '../../../messages/pt-PT/shell.json';
import { TAXES_MODULE, YOUR_COUNTRY } from '../lib/taxes';
import { LearnScreen } from './learn-screen';

// The tax module's route (docs/EDUCATION.md §4): the caveat, the card of the rules the plan's country runs on, the
// module's text, then the library's rows below it, the plan's country left out. The names are read from the profiles.

// pt-PT's Learn metadata (ADR-0057): the fixture folder has no translation, so start-here's comes from here.
vi.mock('virtual:learn-modules', async (original) => {
  const modules = await original<typeof import('virtual:learn-modules')>();
  const start = modules.LEARN_MODULES.find((module) => module.slug === 'start-here');
  if (start === undefined) throw new Error('the start-here fixture is missing');
  const translated = { ...start, title: 'Começar aqui', idea: 'Uma ideia traduzida.' };
  return {
    ...modules,
    LEARN_META: { 'pt-PT': () => Promise.resolve({ default: { 'start-here': translated } }) },
  };
});

await preloadLazyModules([
  () => import('virtual:learn-modules').then((modules) => modules.LEARN_BODIES[TAXES_MODULE]?.()),
]);

const logged = vi.spyOn(console, 'error');
afterEach(() => {
  cleanup();
  const missing = logged.mock.calls.filter((call) => String(call[0]).includes('MISSING_MESSAGE'));
  logged.mockClear();
  expect(missing).toEqual([]);
});

const NAMES = (await loadProfiles())
  .filter((profile) => profile.code !== GENERIC_COUNTRY)
  .map((profile) => profile.name)
  .sort((a, b) => a.localeCompare(b, 'en'));

/** Stands for the screen boundary of the route table. */
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError = () => ({ failed: true });
  override render = () => (this.state.failed ? <p>The screen boundary</p> : this.props.children);
}

type Options = Parameters<typeof createTestServices>[0];

async function mount(country: string | null, options: Options = {}) {
  const snapshot = fixtureSnapshot();
  const services = createTestServices({
    snapshot:
      country === null
        ? { ...snapshot, plan: null, entries: [] }
        : { ...snapshot, plan: { ...(snapshot.plan as Plan), country: country as Plan['country'] } },
    ...options,
  });
  await services.start();
  // Rendered in an awaited act, so React retries the route that suspended on a profile once it is in.
  await act(async () => {
    render(
      <NavigationProvider location="memory" initialPath={`/learn/${TAXES_MODULE}`}>
        <ServicesProvider services={services}>
          <I18nProvider messages={{ countries, learn, shell }}>
            <Boundary>
              <Suspense fallback={<p>pending</p>}>
                <Route path="/learn" nest>
                  <LearnScreen />
                </Route>
              </Suspense>
            </Boundary>
          </I18nProvider>
        </ServicesProvider>
      </NavigationProvider>,
    );
  });
}

const body = () => screen.getByText(/^A rate of 28/);
const rowsUnder = (heading: HTMLElement) =>
  within(heading.closest('section') as HTMLElement)
    .getAllByRole('listitem')
    .map((row) => row.querySelector('a')?.textContent);
const before = (first: Element, second: Element) =>
  Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('the tax module on its route', () => {
  it("a plan in Portugal: the caveat, Portugal's card, the text, then Other countries without Portugal", async () => {
    await mount('PT');
    const card = await screen.findByRole('heading', { level: 2, name: 'Portugal' });
    expect(card.id).toBe(YOUR_COUNTRY);
    const caveat = screen.getByText("The tax fixture's caveat, in its box.");
    const others = screen.getByRole('heading', { level: 2, name: 'Other countries' });
    expect(before(caveat, card) && before(card, body()) && before(body(), others)).toBe(true);
    expect(rowsUnder(others)).toEqual(NAMES.filter((name) => name !== 'Portugal'));
    expect(screen.queryByRole('heading', { name: 'Countries' })).toBeNull();
  });

  it.each(['XX', 'BR'])('a plan on %s: the generic card, then every row under Countries', async (code) => {
    await mount(code);
    const card = await screen.findByRole('heading', { level: 2, name: 'Other country' });
    expect(card.id).toBe(YOUR_COUNTRY);
    const countries = screen.getByRole('heading', { level: 2, name: 'Countries' });
    expect(before(body(), countries)).toBe(true);
    expect(rowsUnder(countries)).toEqual(NAMES);
  });

  it('with no plan: no card, and every row under Countries', async () => {
    await mount(null);
    const countries = await screen.findByRole('heading', { level: 2, name: 'Countries' });
    expect(document.getElementById(YOUR_COUNTRY)).toBeNull();
    expect(rowsUnder(countries)).toEqual(NAMES);
    expect(body()).toBeDefined();
  });

  it('a profile that fails to load fails the route to the screen boundary; the text never shows alone', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    const countries = createTestServices().countries;
    await mount('PT', {
      nowMs: Date.parse('2026-12-04T10:00:00Z'),
      countries: { ...countries, planCard: () => Promise.reject(new Error('offline')) },
    });
    expect(await screen.findByText('The screen boundary')).toBeDefined();
    expect(screen.queryByText(/^A rate of 28/)).toBeNull();
  });
});

describe('the index on a pt-PT screen', () => {
  it("shows a translated module's title and idea unmarked, and lang=en only on the English rows' title and idea", async () => {
    const services = createTestServices({ language: 'pt-PT' });
    await services.start();
    const { container } = render(
      <NavigationProvider location="memory" initialPath="/learn">
        <ServicesProvider services={services}>
          <I18nProvider locale="pt-PT" messages={{ countries: countriesPt, learn: learnPt, shell: shellPt }}>
            <Route path="/learn" nest>
              <LearnScreen />
            </Route>
          </I18nProvider>
        </ServicesProvider>
      </NavigationProvider>,
    );
    const link = await screen.findByRole('link', { name: /^Começar aquiUma ideia traduzida\./ });
    expect(link.querySelector('[lang]')).toBeNull();
    const marked = [...container.querySelectorAll('[lang]')];
    expect(marked.map((element) => [element.textContent, element.getAttribute('lang')])).toEqual(
      ['Risk honestly', 'Taxes where you live', 'When the market drops'].flatMap((title) => [
        [title, 'en'],
        [expect.any(String), 'en'],
      ]),
    );
    expect(marked.every((element) => element.tagName === 'SPAN' && element.closest('a') !== null)).toBe(true);
  });
});
