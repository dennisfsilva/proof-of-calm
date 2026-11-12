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
import learn from '../../../messages/en/learn.json';
import shell from '../../../messages/en/shell.json';
import { TAXES_MODULE, YOUR_COUNTRY } from '../lib/taxes';
import { LearnScreen } from './learn-screen';

// The tax module's route (docs/EDUCATION.md §4): the caveat, the card of the rules the plan's country runs on, the
// module's text, then the library's rows below it, the plan's country left out. The names are read from the profiles.

await preloadLazyModules([
  () => import('virtual:learn-modules').then((modules) => modules.LEARN_BODIES[TAXES_MODULE]?.()),
]);

afterEach(cleanup);

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
          <I18nProvider messages={{ learn, shell }}>
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
