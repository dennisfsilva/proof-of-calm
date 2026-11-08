// @vitest-environment jsdom
import { GENERIC_COUNTRY, loadProfiles } from '@proofofcalm/content';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { NavigationProvider, Route, usePathname } from '../../../lib/navigation';
import { ServicesProvider } from '../../../lib/services';
import { createTestServices } from '../../../lib/services/testing';
import learn from '../../../messages/en/learn.json';
import shell from '../../../messages/en/shell.json';
import { GENERIC, GERMANY, PORTUGAL } from '../fixtures/profiles';
import { LearnScreen } from './learn-screen';

// The country library (docs/EDUCATION.md): `/learn/countries` lists every reviewed profile by name, the
// generic one left out, and `/learn/countries/<code>` shows one card; any other code lands on the list. The
// names are read from the profiles, never written here, so a profile's rewording cannot break the test. The screens
// read the test services' countries port, whose profiles load once per file and answer from memory.

afterEach(cleanup);

/** The names the list shows: the test services' profiles (loaded as `testing.ts` loads them) but the generic one, by name. */
const NAMES = (await loadProfiles())
  .filter((profile) => profile.code !== GENERIC_COUNTRY)
  .map((profile) => profile.name)
  .sort((a, b) => a.localeCompare(b, 'en'));

const Path = () => <output data-testid="path">{usePathname()}</output>;

async function mount(initialPath: string, nowMs?: number) {
  const services = createTestServices(nowMs === undefined ? {} : { nowMs });
  await services.start();
  // Rendered in an awaited act, so React retries the screens that suspended on a profile once it is in.
  await act(async () => {
    render(
      <NavigationProvider location="memory" initialPath={initialPath}>
        <ServicesProvider services={services}>
          <I18nProvider messages={{ learn, shell }}>
            <Suspense fallback={<p>pending</p>}>
              <Route path="/learn" nest>
                <LearnScreen />
              </Route>
            </Suspense>
            <Path />
          </I18nProvider>
        </ServicesProvider>
      </NavigationProvider>,
    );
  });
}

const path = () => screen.getByTestId('path').textContent;

describe('CountryList', () => {
  it('lists the reviewed countries by name, each linking its page, and leaves the generic profile out', async () => {
    await mount('/learn/countries');
    expect(await screen.findByRole('heading', { level: 1, name: 'Countries' })).toBeDefined();
    expect(NAMES).toEqual(expect.arrayContaining([GERMANY.name, PORTUGAL.name]));
    const rows = screen.getAllByRole('listitem');
    expect(rows.map((row) => row.querySelector('a')?.textContent)).toEqual(NAMES);
    for (const row of rows) expect(row.textContent).toMatch(/Last reviewed \d+\s\w+\s\d{4}$/u);
    expect(screen.getByRole('link', { name: PORTUGAL.name }).getAttribute('href')).toBe('/learn/countries/pt');
    expect(screen.queryByText(GENERIC.name)).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to Learn' }).getAttribute('href')).toBe('/learn');
  });

  it("a row whose card is under review reads as its card's date line does; the others keep Last reviewed", async () => {
    // Under review from the day after twelve months past nextReviewDue (docs/JURISDICTIONS.md §1).
    const [year, month, day] = GERMANY.status.nextReviewDue.split('-').map(Number) as [number, number, number];
    await mount('/learn/countries', Date.UTC(year + 1, month - 1, day + 1, 10));
    const row = (name: string) => screen.getByRole('link', { name }).closest('li')?.textContent;
    expect(await screen.findByRole('heading', { level: 1, name: 'Countries' })).toBeDefined();
    expect(row(GERMANY.name)).toMatch(/Not reviewed since \d+\s\w+\s\d{4}$/u);
    expect(row(PORTUGAL.name)).toMatch(/Last reviewed \d+\s\w+\s\d{4}$/u);
  });

  it('a row opens its country', async () => {
    await mount('/learn/countries');
    const row = await screen.findByRole('link', { name: PORTUGAL.name });
    // In an awaited act, as the mount, since the country's page suspends on its profile.
    await act(async () => {
      fireEvent.click(row);
    });
    expect(await screen.findByRole('heading', { level: 1, name: PORTUGAL.name })).toBeDefined();
    expect(path()).toBe('/learn/countries/pt');
  });
});

describe('CountryRoute', () => {
  it('/learn/countries/pt shows the card at level 1, with the way back to the list', async () => {
    await mount('/learn/countries/pt');
    expect(await screen.findByRole('heading', { level: 1, name: PORTUGAL.name })).toBeDefined();
    expect(screen.getByText(PORTUGAL.card.summary60)).toBeDefined();
    fireEvent.click(screen.getByRole('link', { name: 'Back to countries' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Countries' })).toBeDefined();
    expect(path()).toBe('/learn/countries');
  });

  // `zz` is a user-assigned ISO code, so no profile ever takes it; `xx` is the generic profile's.
  it.each(['/learn/countries/zz', '/learn/countries/xx', '/learn/countries/PT'])(
    '%s lands on the list',
    async (initialPath) => {
      await mount(initialPath);
      expect(await screen.findByRole('heading', { level: 1, name: 'Countries' })).toBeDefined();
      expect(path()).toBe('/learn/countries');
    },
  );
});
