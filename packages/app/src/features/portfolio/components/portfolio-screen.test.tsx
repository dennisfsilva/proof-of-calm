// @vitest-environment jsdom
import { countryRules, loadProfile } from '@proofofcalm/content';
import { type CalendarDate, type Coin, type Entry, ok, type Plan } from '@proofofcalm/core';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SNAPSHOT } from '../../../lib/adapters';
import { I18nProvider } from '../../../lib/i18n';
import { NavigationProvider } from '../../../lib/navigation';
import type { CachedHistory, HistorySource, PricesState, Snapshot } from '../../../lib/ports';
import { type Services, ServicesProvider } from '../../../lib/services';
import { FIXTURE_DATES, type FixturePhase, fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import {
  createTestServices,
  FIXTURE_PRICES,
  fixedPriceSource,
  preloadLazyModules,
  type TestServicesOptions,
} from '../../../lib/services/testing';
import messages from '../../../messages/en/portfolio.json';
import shell from '../../../messages/en/shell.json';
import today from '../../../messages/en/today.json';
import { PortfolioScreen } from './portfolio-screen';

// The Portfolio screen over the fixture plan (docs/DOMAIN.md §3.6): the value of what is held, P/L
// against cost with the fees beside it, the allocation, the holdings and the coins not bought yet. The
// plan is Portugal's and its rules are loaded, so the figures are the ones the product shows, in pt-PT.

// The P/L line's Why? loads the Learn sheet on a press: the namespaces answer from memory, and the sheet and
// the fixture body load with this file, so a findBy waits on renders (lib/services/testing-modules.ts).
vi.mock('../../../lib/i18n/namespaces', async (original) => {
  const { namespacesInMemory } = await import('../../../lib/services/testing-modules');
  return namespacesInMemory(await original<typeof import('../../../lib/i18n/namespaces')>());
});

await preloadLazyModules([
  () => import('../../learn/components/module-sheet'),
  () => import('virtual:learn-modules').then((modules) => modules.LEARN_BODIES['risk-honestly']?.()),
]);

afterEach(cleanup);

const portugal = async () => {
  const profile = await loadProfile('PT');
  return profile === null ? null : countryRules(profile);
};

async function renderScreen(
  snapshot: Snapshot,
  phase: FixturePhase,
  prices: PricesState | null = FIXTURE_PRICES,
  overrides: TestServicesOptions = {},
): Promise<Services> {
  const nowMs = fixtureNowMs(phase);
  const services = createTestServices({
    snapshot,
    nowMs,
    rules: portugal,
    ...overrides,
    ...(prices === null ? {} : { priceSource: fixedPriceSource(prices, nowMs) }),
  });
  await act(() => services.start());
  if (prices !== null) await act(() => services.prices.refresh());
  render(
    <NavigationProvider location="memory" initialPath="/portfolio">
      <ServicesProvider services={services}>
        <I18nProvider messages={{ portfolio: messages, today, shell }}>
          <PortfolioScreen />
        </I18nProvider>
      </ServicesProvider>
    </NavigationProvider>,
  );
  return services;
}

/** The page's text with every space one U+0020, as pt-PT groups and spaces with U+00A0 and U+202F. */
const text = () => (document.body.textContent ?? '').replace(/\s/g, ' ');

// The fixture prices are fetched at 10:00 UTC on each phase's date: 11:00 summer time in Lisbon, the
// test clock's zone, in October, and 10:00 winter time in March.
const PRICES_AS_OF: Record<FixturePhase, string> = {
  buy: 'Prices as of 11:00, 20 Oct 2026 · Price data by CoinGecko',
  sell: 'Prices as of 10:00, 15 Mar 2030 · Price data by CoinGecko',
};

describe('PortfolioScreen', () => {
  for (const phase of Object.keys(FIXTURE_DATES) as FixturePhase[]) {
    it(`shows the value and P/L of the fixture plan on ${FIXTURE_DATES[phase]}, fees not in P/L`, async () => {
      await renderScreen(fixtureSnapshot(), phase);
      expect(screen.getByRole('heading', { level: 1, name: 'Portfolio' })).toBeDefined();
      // BTC 0.02215 at 60,000.12 and ETH 0.119 at 2,500.5; 1,700 invested and 150 back from a sale.
      expect(text()).toContain('Value1626,56 €');
      expect(screen.getByText(PRICES_AS_OF[phase])).toBeDefined();
      expect(text()).toContain('P/L+76,56 € (+4,5%)');
      expect(text()).toContain('Invested1700,00 €');
      expect(text()).toContain('Fees (not in P/L)0,00 €');
      expect(screen.getByRole('img', { name: 'Allocation by value: BTC 82%, ETH 18%' })).toBeDefined();
      expect(screen.getByRole('table', { name: 'Holdings' })).toBeDefined();
      expect(text()).not.toContain('Not bought yet');
      expect(text()).not.toContain('No recorded cost');
      // After the summary: the value over the device's range, from the closes of the test history source.
      expect(await screen.findByRole('img', { name: /^Portfolio value, / })).toBeDefined();
    });
  }

  // #191: with everything sold, the value is 0 and there is no allocation left to show.
  it('shows the value of a sold-out plan and no allocation', async () => {
    const snapshot = fixtureSnapshot();
    const lastSale = snapshot.entries.at(-1);
    if (lastSale === undefined) throw new Error('the fixture has entries');
    const sell = (n: string, coin: string, held: string) =>
      ({ ...lastSale, id: `${lastSale.id.slice(0, -3)}${n}`, coin, units: held }) as Entry;
    // The fixture holds BTC 0.02215 and ETH 0.119.
    await renderScreen(
      { ...snapshot, entries: [...snapshot.entries, sell('998', 'BTC', '0.02215'), sell('999', 'ETH', '0.119')] },
      'buy',
    );
    expect(text()).toContain('Value0,00 €');
    expect(screen.queryByRole('img', { name: /^Allocation/ })).toBeNull();
    expect(screen.queryByRole('table', { name: 'Holdings' })).toBeNull();
  });

  it('names the plan coins not bought yet', async () => {
    const snapshot = fixtureSnapshot();
    if (snapshot.plan === null) throw new Error('the fixture has a plan');
    const sol = { id: 'SOL', name: 'Solana', geckoId: 'solana', decimals: 4 } as Coin;
    const link = { id: 'LINK', name: 'Chainlink', geckoId: 'chainlink', decimals: 4 } as Coin;
    const ada = { id: 'ADA', name: 'Cardano', geckoId: 'cardano', decimals: 4 } as Coin;
    const coins = [...snapshot.plan.coins, sol, link, ada];
    await renderScreen({ ...snapshot, plan: { ...snapshot.plan, coins } }, 'buy');
    // One list with the serial comma, as the line on units with no recorded cost (CONTENT-STYLE §1.9).
    expect(text()).toContain('Not bought yet: SOL, LINK, and ADA.');
  });

  // DOMAIN §3.6: coins added with no cost count in the value and nowhere a cost is needed, and the line says so.
  it('names the units with no recorded cost and leaves them out of Invested and P/L', async () => {
    const snapshot = fixtureSnapshot();
    const [first] = snapshot.entries as [Entry];
    const added = (n: string, coin: string, date: string, units: string): Entry => ({
      ...first,
      id: `00000000-0000-4000-8000-000000000${n}` as Entry['id'],
      kind: 'held',
      slot: null,
      amount: null,
      fee: null,
      coin: coin as Entry['coin'],
      date: date as Entry['date'],
      units: units as Entry['units'],
    });
    // After the fixture's ETH sale, so the sale takes none of them.
    const entries = [
      ...snapshot.entries,
      added('401', 'BTC', '2024-01-10', '0.01'),
      added('402', 'ETH', '2026-10-01', '0.5'),
    ];
    await renderScreen({ ...snapshot, entries }, 'buy');
    expect(text()).toContain(
      'No recorded cost for 0,01 BTC and 0,5 ETH, so Invested, the average cost, and the P/L leave these units out.',
    );
    // The value counts them: 1626,56 € and 0.01 BTC at 60,000.12 and 0.5 ETH at 2,500.5.
    expect(text()).toContain('Value3476,81 €');
    expect(text()).toContain('P/L+76,56 € (+4,5%)');
    expect(text()).toContain('Invested1700,00 €');
  });

  it('the not-bought line links to /log and names Add coins you already have', async () => {
    const snapshot = fixtureSnapshot();
    if (snapshot.plan === null) throw new Error('the fixture has a plan');
    const sol = { id: 'SOL', name: 'Solana', geckoId: 'solana', decimals: 4 } as Coin;
    await renderScreen({ ...snapshot, plan: { ...snapshot.plan, coins: [...snapshot.plan.coins, sol] } }, 'buy');
    expect(text()).toContain(
      'Not bought yet: SOL. For coins you already have, open the Log and choose Add coins you already have.',
    );
    // The link opens the Log, so it is named Log (CONTENT-STYLE §1.7); the sentence names the button there.
    expect(screen.getByRole('link', { name: 'Log' }).getAttribute('href')).toBe('/log');
    expect(screen.queryByRole('link', { name: 'Add coins you already have' })).toBeNull();
  });

  // #136 (DOMAIN §3.7, §3.13): an import keeps a sale dated before its purchase as written, and the screen names it.
  it('names the units sold before the purchases that cover them, from imported data', async () => {
    const snapshot = fixtureSnapshot();
    const [first] = snapshot.entries as [Entry];
    expect(first.coin).toBe('BTC');
    const early: Entry = {
      ...first,
      id: '00000000-0000-4000-8000-000000000400' as Entry['id'],
      kind: 'sell',
      slot: null,
      date: '2024-01-10' as Entry['date'],
      units: '0.002' as Entry['units'],
      source: 'import-json',
    };
    await renderScreen({ ...snapshot, entries: [...snapshot.entries, early] }, 'buy');
    expect(text()).toContain(
      '0,002 BTC sold without a purchase dated on or before the sale. Check the dates and amounts in the Log.',
    );
    cleanup();
    await renderScreen(snapshot, 'buy');
    expect(text()).not.toContain('sold before purchases');
  });

  it('credits no source for prices typed by hand', async () => {
    await renderScreen(fixtureSnapshot(), 'buy', { ...FIXTURE_PRICES, source: 'manual' });
    expect(screen.getByText('Prices as of 11:00, 20 Oct 2026')).toBeDefined();
    // The value chart's source line stands invisible and unread while the closes load: it credits nothing.
    expect(screen.queryByText(/CoinGecko/, { ignore: 'script, style, [aria-hidden="true"]' })).toBeNull();
  });

  // The same line as Today's (docs/CONTENT-STYLE.md §3 "Offline"): offline, CoinGecko's stored prices
  // keep their time and credit, and the line says offline.
  it('offline, the stored prices keep the value and the line Today shows', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      await renderScreen(fixtureSnapshot(), 'buy');
      expect(text()).toContain('Value1626,56 €');
      expect(
        screen.getByText(/^Prices from \d{2}:\d{2}, 20 Oct 2026 · offline · Price data by CoinGecko$/u),
      ).toBeDefined();
      expect(screen.queryByText(/^Prices as of/u)).toBeNull();
    } finally {
      online.mockRestore();
    }
  });

  it('the server’s last good copy reads as delayed, with its own time and the credit', async () => {
    await renderScreen(fixtureSnapshot(), 'buy', { ...FIXTURE_PRICES, stale: true });
    expect(
      screen.getByText(/^Prices as of \d{2}:\d{2}, 20 Oct 2026 · delayed · Price data by CoinGecko$/u),
    ).toBeDefined();
  });

  it('gives no total value before every coin held has a price, and weighs by the amount invested', async () => {
    await renderScreen(fixtureSnapshot(), 'buy', null);
    expect(text()).not.toContain('1626,56 €');
    expect(text()).not.toContain('Prices as of');
    expect(text()).toContain('No price yet for BTC, ETH.');
    expect(screen.getByRole('img', { name: 'Allocation by amount invested: BTC 74%, ETH 26%' })).toBeDefined();
  });

  it('shows the empty state without a plan', async () => {
    await renderScreen(EMPTY_SNAPSHOT, 'buy', null);
    expect(screen.getByText('No plan yet')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Set up a plan' }).getAttribute('href')).toBe('/onboarding');
    expect(screen.getByRole('link', { name: 'import a file' }).getAttribute('href')).toBe('/settings');
    expect(text()).not.toContain('entries');
    expect(screen.queryByRole('table')).toBeNull();
  });

  // docs/EDUCATION.md, the links table (session 15c, decision 5): the P/L line's Why? opens Risk honestly, and it
  // stands wherever the P/L line does. The core gives no P/L only while a held coin has no price.
  describe("the P/L line's Why?", () => {
    const WHY = 'Why? Risk honestly';
    const IDEA = "The third fixture's idea, for Portfolio's Why? on the P/L line.";
    const why = () => screen.queryByRole('button', { name: WHY });
    /** The link sits in the P/L figure's own cell, after the figure. */
    const besidePnl = () => {
      const link = why();
      expect(link?.closest('dd')?.previousElementSibling?.textContent).toBe('P/L');
    };

    it('stands beside the P/L with no entry yet', async () => {
      await renderScreen({ ...fixtureSnapshot(), entries: [] }, 'buy');
      expect(screen.getByText('P/L', { selector: 'dt' })).toBeDefined();
      besidePnl();
    });

    it('stands beside the P/L in the hold phase, after the last buy', async () => {
      const snapshot = fixtureSnapshot();
      if (snapshot.plan === null) throw new Error('the fixture has a plan');
      const ended = '2026-09-20' as CalendarDate;
      await renderScreen({ ...snapshot, plan: { ...snapshot.plan, lastBuy: ended, endedBuyingOn: ended } }, 'buy');
      expect(text()).toContain('P/L+76,56 € (+4,5%)');
      besidePnl();
    });

    it('stands beside a loss', async () => {
      const low: PricesState = {
        ...FIXTURE_PRICES,
        snapshot: {
          ...FIXTURE_PRICES.snapshot,
          prices: {
            ...FIXTURE_PRICES.snapshot.prices,
            BTC: { EUR: '30000', USD: '35000' },
          } as PricesState['snapshot']['prices'],
        },
      };
      await renderScreen(fixtureSnapshot(), 'buy', low);
      expect(text()).toMatch(/P\/L[−-]/u);
      besidePnl();
    });

    it('stands beside the P/L when every entry was added with no cost', async () => {
      const snapshot = fixtureSnapshot();
      const [first] = snapshot.entries as [Entry];
      const held: Entry = { ...first, kind: 'held', slot: null, amount: null, fee: null };
      await renderScreen({ ...snapshot, entries: [held] }, 'buy');
      expect(text()).toContain('No recorded cost for');
      besidePnl();
    });

    it('stands beside the P/L with everything sold', async () => {
      const snapshot = fixtureSnapshot();
      const lastSale = snapshot.entries.at(-1);
      if (lastSale === undefined) throw new Error('the fixture has entries');
      const sell = (n: string, coin: string, units: string) =>
        ({ ...lastSale, id: `${lastSale.id.slice(0, -3)}${n}`, coin, units }) as Entry;
      await renderScreen(
        { ...snapshot, entries: [...snapshot.entries, sell('998', 'BTC', '0.02215'), sell('999', 'ETH', '0.119')] },
        'buy',
      );
      expect(text()).toContain('Value0,00 €');
      besidePnl();
    });

    it('is absent while a held coin has no price, with the P/L line', async () => {
      await renderScreen(fixtureSnapshot(), 'buy', null);
      expect(text()).toContain('No price yet for BTC, ETH.');
      expect(screen.queryByText('P/L', { selector: 'dt' })).toBeNull();
      expect(why()).toBeNull();
    });

    it('opens Risk honestly in a sheet, on the Portfolio route, and gives the focus back on close', async () => {
      await renderScreen(fixtureSnapshot(), 'buy');
      const link = screen.getByRole('button', { name: WHY });
      link.focus();
      fireEvent.click(link);
      expect(await screen.findByRole('dialog', { name: IDEA })).toBeDefined();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(link));
    });
  });

  // docs/LEGAL.md §4: the past-performance line once per path, directly under the historic figure. The value
  // chart carries it while it loads or draws; when it draws nothing, the Dutch line on 1 January carries it.
  describe('the Dutch value on 1 January', () => {
    const netherlands = async () => {
      const profile = await loadProfile('NL');
      return profile === null ? null : countryRules(profile);
    };
    const days = ['2029-12-30', '2029-12-31', '2030-03-13', '2030-03-14', '2030-03-15'];
    const history: HistorySource = {
      closes: async (coin, currency) =>
        ok({
          coin,
          currency,
          closes: days.map((day) => [day, coin === 'BTC' ? '50000' : '2000']),
          fetchedAt: '2030-03-15T10:00:00.000Z',
        } as unknown as CachedHistory),
    };
    const dutch = (entries: readonly Entry[], chartRange: Snapshot['prefs']['chartRange']): Snapshot => {
      const snapshot = fixtureSnapshot();
      if (snapshot.plan === null) throw new Error('no fixture plan');
      const plan: Plan = { ...snapshot.plan, country: 'NL' as Plan['country'], holdingRule: { kind: 'none' } };
      return { ...snapshot, plan, entries: [...entries], prefs: { ...snapshot.prefs, chartRange } };
    };
    const render = (snapshot: Snapshot) =>
      renderScreen(snapshot, 'sell', FIXTURE_PRICES, { rules: netherlands, historySource: history });

    it('takes the line under its figure when the chart draws none: everything sold on 1 Feb 2030, 7D', async () => {
      const { entries } = fixtureSnapshot();
      const lastSale = entries.at(-1);
      if (lastSale === undefined) throw new Error('the fixture has entries');
      const sell = (n: string, coin: string, units: string) =>
        ({
          ...lastSale,
          id: `${lastSale.id.slice(0, -3)}${n}`,
          coin,
          units,
          date: '2030-02-01' as CalendarDate,
        }) as Entry;
      await render(dutch([...entries, sell('998', 'BTC', '0.02215'), sell('999', 'ETH', '0.119')], '7d'));
      const estimate = await screen.findByText(/^Estimate from the daily closes of 31 Dec 2029/);
      expect(screen.queryByRole('img', { name: /^Portfolio value, / })).toBeNull();
      const lines = screen.getAllByText(/^Past performance is not a reliable indicator/);
      expect(lines).toHaveLength(1);
      expect(estimate.nextElementSibling).toBe(lines[0] ?? null);
      expect(lines[0]?.querySelector('a')?.getAttribute('href')).toBe('/risk');
    });

    it('leaves the line to the chart when it draws', async () => {
      await render(dutch(fixtureSnapshot().entries, 'all'));
      expect(await screen.findByRole('img', { name: /^Portfolio value, / })).toBeDefined();
      expect(await screen.findByText(/^Estimate from the daily closes of 31 Dec 2029/)).toBeDefined();
      expect(screen.getAllByText(/^Past performance is not a reliable indicator/)).toHaveLength(1);
    });
  });
});
