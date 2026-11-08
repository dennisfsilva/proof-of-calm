// @vitest-environment jsdom
import { addDays, err, ok, type Result } from '@proofofcalm/core';
import { anEntry, aPlan, BTC, date, ETH, money, split, units } from '@proofofcalm/core/testing';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useMemo } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { EMPTY_SNAPSHOT, memoryPlanStore } from '../../../lib/adapters';
import { I18nProvider } from '../../../lib/i18n';
import type { ApiFailure, CachedHistory, HistorySource, PlanStore, Snapshot } from '../../../lib/ports';
import { type Services, ServicesProvider, useSnapshot } from '../../../lib/services';
import { createTestServices } from '../../../lib/services/testing';
import messages from '../../../messages/en/portfolio.json';
import { useHistories } from '../lib/use-histories';
import { chartCoins, chartState } from '../lib/value-chart';
import { VALUE_CHART_VIEW_BOX, ValueChart } from './value-chart';

// The Portfolio value chart (ADR-0022): named by its range, its dates and its first and last values, or by
// its own dates when the closes start later, its range a device preference written as the Log writes
// `logShowAll`, the closes dated and credited with the past-performance line under it in the same type
// (docs/LEGAL.md §4), and one line for each state with nothing to draw (chartState chooses it).

afterEach(cleanup);

const plan = aPlan({ coins: [BTC], split: split({ BTC: '100' }) });
const snapshot: Snapshot = {
  ...EMPTY_SNAPSHOT,
  plan,
  entries: [
    anEntry({
      kind: 'extra',
      slot: null,
      coin: BTC.id,
      date: date('2026-10-18'),
      units: units('1'),
      amount: money('100'),
    }),
  ],
};

/** BTC at 100, 110 and 121 on the three days up to the test clock's date (20 October 2026). */
const closes: HistorySource = {
  closes: async (coin, currency) =>
    ok({
      coin,
      currency,
      closes: [
        ['2026-10-18', '100'],
        ['2026-10-19', '110'],
        ['2026-10-20', '121'],
      ] as unknown as CachedHistory['closes'],
      fetchedAt: '2026-10-20T09:00:00.000Z' as CachedHistory['fetchedAt'],
    }),
};

/** BTC bought on 13 October, at 100 from then and 121 on the test clock's date: the last 7 days covered. */
const week: HistorySource = {
  closes: async (coin, currency) =>
    ok({
      coin,
      currency,
      closes: ['13', '14', '15', '16', '17', '18', '19', '20'].map((day) => [
        `2026-10-${day}`,
        day === '20' ? '121' : '100',
      ]) as unknown as CachedHistory['closes'],
      fetchedAt: '2026-10-20T09:00:00.000Z' as CachedHistory['fetchedAt'],
    }),
};
const boughtOn13: Snapshot = {
  ...snapshot,
  entries: snapshot.entries.map((entry) => ({ ...entry, date: date('2026-10-13') })),
};

/** The chart as the screen hosts it: the closes read and the one state chosen above it. */
function Screen() {
  const current = useSnapshot((state) => state);
  const { plan, entries } = current;
  const range = current.prefs.chartRange;
  const coins = useMemo(() => (plan === null ? [] : chartCoins(plan, entries)), [plan, entries]);
  const histories = useHistories(coins, plan?.payCurrency ?? 'EUR');
  if (plan === null) return null;
  const state = chartState(plan, entries, histories, range, VALUE_CHART_VIEW_BOX);
  return <ValueChart currency={plan.payCurrency} range={range} state={state} />;
}

async function mount(historySource: HistorySource, planStore?: PlanStore, state = snapshot): Promise<Services> {
  const services = createTestServices({
    snapshot: state,
    historySource,
    ...(planStore === undefined ? {} : { planStore }),
  });
  await act(() => services.start());
  await act(async () => {
    render(
      <ServicesProvider services={services}>
        <I18nProvider messages={{ portfolio: messages }}>
          <Screen />
        </I18nProvider>
      </ServicesProvider>,
    );
  });
  return services;
}

const range = (name: string) => screen.getByRole('button', { name });

describe('ValueChart', () => {
  it('names the drawing by its own dates when the closes start after the range, dated, credited, disclosed', async () => {
    await mount(closes);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe(
      'Portfolio value, 18\u00a0Oct\u00a02026 to 20\u00a0Oct\u00a02026, from €100.00 to €121.00',
    );
    expect(range('30D, last 30 days').getAttribute('aria-pressed')).toBe('true');
    expect(
      screen.getByText(/^Daily closes, 18 Oct 2026 to 20 Oct 2026, as of .+, 20 Oct 2026 · Price data by CoinGecko$/),
    ).toBeTruthy();
    // The disclosure wears the type of the line beside it (docs/LEGAL.md §4).
    const disclosure = screen.getByText(/^Past performance is not a reliable indicator of future results\./);
    const source = screen.getByText(/^Daily closes/, { ignore: '[aria-hidden="true"]' });
    expect([...source.classList]).toEqual(expect.arrayContaining([...disclosure.classList]));
    expect(screen.getByRole('link', { name: 'Risk disclosure' }).getAttribute('href')).toBe('/risk');
    expect(screen.getAllByRole('row')).toHaveLength(4);
  });

  it('names the drawing by its range when the closes cover it', async () => {
    await mount(week, undefined, boughtOn13);
    await act(async () => fireEvent.click(range('7D, last 7 days')));
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe(
      'Portfolio value, last 7 days (13\u00a0Oct\u00a02026 to 20\u00a0Oct\u00a02026), from €100.00 to €121.00',
    );
  });

  it('names every range by its visible label and then the range in words (WCAG 2.5.3)', async () => {
    await mount(closes);
    const names = [
      '7D, last 7 days',
      '30D, last 30 days',
      '90D, last 90 days',
      '1Y, last 12 months',
      'All, since the first entry',
    ];
    for (const name of names) expect(range(name).textContent?.startsWith(name.split(',')[0] ?? '')).toBe(true);
    await act(async () => fireEvent.click(range('1Y, last 12 months')));
    expect(range('1Y, last 12 months').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('img')).toBeTruthy();
  });

  it('keeps the range control and says so when the range has no value to draw', async () => {
    // Bought on 1 August and sold on 2 August: nothing is held in the last 30 days, all of it since then.
    const sold: Snapshot = {
      ...snapshot,
      entries: [
        anEntry({
          kind: 'extra',
          slot: null,
          coin: BTC.id,
          date: date('2026-08-01'),
          units: units('1'),
          amount: money('100'),
        }),
        anEntry({
          kind: 'sell',
          slot: null,
          coin: BTC.id,
          date: date('2026-08-02'),
          units: units('1'),
          amount: money('100'),
        }),
      ],
    };
    const year: HistorySource = {
      closes: async (coin, currency) =>
        ok({
          coin,
          currency,
          closes: [
            ['2026-08-01', '100'],
            ['2026-08-02', '100'],
            ['2026-10-20', '121'],
          ] as unknown as CachedHistory['closes'],
          fetchedAt: '2026-10-20T09:00:00.000Z' as CachedHistory['fetchedAt'],
        }),
    };
    await mount(year, undefined, sold);
    expect(screen.queryByRole('img')).toBeNull();
    expect(
      screen.getByText(
        'There is no value to draw for the last 30 days, 20 Sept 2026 to 20 Oct 2026. Choose a longer range.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/^Past performance/)).toBeNull();
    await act(async () => fireEvent.click(range('All, since the first entry')));
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/^Portfolio value, since the first entry \(/);
  });

  it('says on every range when the closes end before the first entry, and that the next close starts the chart', async () => {
    // Bought on 21 October, the day after the last close: no range can draw, so none asks for a longer one.
    const today: Snapshot = {
      ...snapshot,
      entries: snapshot.entries.map((entry) => ({ ...entry, date: date('2026-10-21') })),
    };
    await mount(closes, undefined, today);
    const line =
      'There is no value to draw since the first entry: the daily closes end on 20 Oct 2026. The chart starts with the next daily close.';
    // The default range first, then each of the others.
    expect(range('30D, last 30 days').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(line)).toBeTruthy();
    for (const name of ['7D, last 7 days', '90D, last 90 days', '1Y, last 12 months', 'All, since the first entry']) {
      await act(async () => fireEvent.click(range(name)));
      expect(range(name).getAttribute('aria-pressed')).toBe('true');
      expect(screen.queryByRole('img')).toBeNull();
      expect(screen.getByText(line)).toBeTruthy();
      expect(screen.queryByText(/Choose a longer range/)).toBeNull();
    }
  });

  // Sold out before the closes (1 BTC bought on 10 January 2025, sold on 1 March), or on 21 October 2026, the day
  // after the last close (bought and sold that day); 365 closes from 21 October 2025.
  it.each([
    ['before the closes', '2025-01-10', '2025-03-01'],
    ['after the last close', '2026-10-21', '2026-10-21'],
  ])('says nothing was held on the closes’ days, on every range, when sold out %s', async (_, bought, sold) => {
    const soldOut: Snapshot = {
      ...snapshot,
      entries: [
        anEntry({
          kind: 'extra',
          slot: null,
          coin: BTC.id,
          date: date(bought),
          units: units('1'),
          amount: money('100'),
        }),
        anEntry({
          kind: 'sell',
          slot: null,
          coin: BTC.id,
          date: date(sold),
          units: units('1'),
          amount: money('100'),
        }),
      ],
    };
    const year: HistorySource = {
      closes: async (coin, currency) =>
        ok({
          coin,
          currency,
          closes: Array.from({ length: 365 }, (_, day) => [
            addDays(date('2025-10-21'), day),
            '100',
          ]) as unknown as CachedHistory['closes'],
          fetchedAt: '2026-10-20T09:00:00.000Z' as CachedHistory['fetchedAt'],
        }),
    };
    await mount(year, undefined, soldOut);
    const line =
      'There is no value to draw: you held no coins from 21 Oct 2025 to 20 Oct 2026, the dates the daily closes cover.';
    expect(screen.getByText(line)).toBeTruthy();
    expect(screen.queryByText(/starts with the next daily close/)).toBeNull();
    for (const name of ['7D, last 7 days', '90D, last 90 days', '1Y, last 12 months', 'All, since the first entry']) {
      await act(async () => fireEvent.click(range(name)));
      expect(range(name).getAttribute('aria-pressed')).toBe('true');
      expect(screen.queryByRole('img')).toBeNull();
      expect(screen.getByText(line)).toBeTruthy();
      expect(screen.queryByText(/starts with the next daily close|Choose a longer range/)).toBeNull();
    }
  });

  it('renders nothing before the first entry', async () => {
    await mount(closes, undefined, { ...snapshot, entries: [] });
    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(document.querySelector('section')).toBeNull();
  });

  it('names the coins with fewer than two closes, with no retry step, when a coin with entries lacks them', async () => {
    // BTC has three closes, ETH one: no range can draw a whole value, as with a single coin with one close.
    const twoCoins: Snapshot = {
      ...snapshot,
      plan: aPlan({ coins: [BTC, ETH], split: split({ BTC: '70', ETH: '30' }) }),
      entries: [
        ...snapshot.entries,
        anEntry({
          kind: 'extra',
          slot: null,
          coin: ETH.id,
          date: date('2026-10-20'),
          units: units('1'),
          amount: money('100'),
        }),
      ],
    };
    const partial: HistorySource = {
      closes: async (coin, currency) => {
        const btc = await closes.closes(coin, currency);
        if (coin === BTC.id || !btc.ok) return btc;
        return ok({ ...btc.value, closes: btc.value.closes.slice(-1) });
      },
    };
    await mount(partial, undefined, twoCoins);
    expect(screen.queryByRole('img')).toBeNull();
    expect(
      screen.getByText('The price history has fewer than two daily closes for ETH, so there is no chart.'),
    ).toBeTruthy();
    expect(screen.queryByText(/could not be loaded|retry|^There is no value to draw/)).toBeNull();
  });

  it('names a coin outside the catalogue as one without closes, never as a read to retry', async () => {
    // An imported page file may carry a coin the history route refuses with 400, as it does KAS.
    const kas = anEntry({
      kind: 'extra',
      slot: null,
      coin: 'KAS' as never,
      date: date('2026-10-19'),
      units: units('100'),
      amount: money('10'),
    });
    const refusing: HistorySource = {
      closes: async (coin, currency) =>
        coin === BTC.id ? closes.closes(coin, currency) : err({ kind: 'http', status: 400 }),
    };
    const line = 'The price history has fewer than two daily closes for KAS, so there is no chart.';
    for (const entries of [[...snapshot.entries, kas], [kas]]) {
      cleanup();
      await mount(refusing, undefined, { ...snapshot, entries });
      expect(screen.queryByRole('img')).toBeNull();
      expect(screen.getByText(line)).toBeTruthy();
      expect(screen.queryByText(/could not be loaded|Open Portfolio again to retry/)).toBeNull();
    }
  });

  it('writes the chosen range to the device preferences and draws it', async () => {
    const services = await mount(week, undefined, boughtOn13);
    await act(async () => fireEvent.click(range('7D, last 7 days')));
    expect(services.domain.store.getState().snapshot.prefs.chartRange).toBe('7d');
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/^Portfolio value, last 7 days \(/);
    expect(range('7D, last 7 days').getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the range and says so when the preference write fails', async () => {
    const store = memoryPlanStore(snapshot);
    const failing: PlanStore = {
      ...store,
      write: async () => {
        throw new Error('QuotaExceededError');
      },
    };
    const services = await mount(closes, failing);
    await act(async () => fireEvent.click(range('1Y, last 12 months')));
    expect(services.domain.store.getState().snapshot.prefs.chartRange).toBe('30d');
    expect(range('30D, last 30 days').getAttribute('aria-pressed')).toBe('true');
    expect(services.toasts.getSnapshot()?.title).toBe('The chart range could not be saved. Choose it again.');
  });

  it('shows one line when the closes cannot be loaded, and nothing drawn while they load', async () => {
    const failed: HistorySource = {
      closes: async (): Promise<Result<CachedHistory, ApiFailure>> => err({ kind: 'network' }),
    };
    await mount(failed);
    expect(screen.queryByRole('img')).toBeNull();
    expect(
      screen.getByText('The price history could not be loaded, so there is no chart. Open Portfolio again to retry.'),
    ).toBeTruthy();

    cleanup();
    await mount({ closes: () => new Promise(() => undefined) });
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByText(/could not be loaded/)).toBeNull();
    expect(document.querySelector('section[aria-busy="true"]')).not.toBeNull();
  });

  it('keeps the drawn tree while the closes load, so the ranges stay and nothing below moves', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await mount({ closes: async (coin, currency) => held.then(() => closes.closes(coin, currency)) });
    const section = document.querySelector('section');
    expect(section?.getAttribute('aria-busy')).toBe('true');
    const group = screen.getByRole('group', { name: 'Chart range' });
    expect(section?.contains(group)).toBe(true);
    // The figure is laid out at its loaded height, out of reach and out of the accessibility tree.
    const wrapper = section?.querySelector('[inert]');
    expect(wrapper?.getAttribute('aria-hidden')).toBe('true');
    expect(wrapper?.querySelector('figure')).not.toBeNull();
    expect(section?.contains(screen.getByText(/^Past performance is not a reliable indicator/))).toBe(true);
    // The source line's place: its widest forms, one per month at least, unseen and unread; no drawn line yet.
    const widest = screen.getAllByText(/^Daily closes, 28 /);
    expect(widest.length).toBeGreaterThanOrEqual(12);
    for (const line of widest) expect(line.matches('[aria-hidden="true"].invisible')).toBe(true);
    expect(screen.queryByText(/^Daily closes/, { ignore: '[aria-hidden="true"]' })).toBeNull();

    await act(async () => release());
    expect(screen.getByRole('img')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Chart range' })).toBe(group);
    expect(document.querySelector('section')?.getAttribute('aria-busy')).toBeNull();
    expect(document.querySelector('[inert]')).toBeNull();
    // The same widest forms stay under the drawn line, so the place keeps its height.
    expect(screen.getAllByText(/^Daily closes, 28 /)).toHaveLength(widest.length);
    expect(screen.getByText(/^Daily closes, 18 Oct/, { ignore: '[aria-hidden="true"]' })).toBeTruthy();
  });

  it('keeps the loading tree when the closes fail, its line in the frame’s place, so nothing below moves', async () => {
    let fail: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      fail = resolve;
    });
    await mount({ closes: async () => held.then(() => err({ kind: 'http', status: 502 })) });
    const section = document.querySelector('section');
    const group = screen.getByRole('group', { name: 'Chart range' });
    const widest = screen.getAllByText(/^Daily closes, 28 /).length;

    await act(async () => fail());
    // The same section and ranges, no longer busy; the empty frame keeps its height, unseen and unread.
    expect(document.querySelector('section')).toBe(section);
    expect(section?.getAttribute('aria-busy')).toBeNull();
    expect(screen.getByRole('group', { name: 'Chart range' })).toBe(group);
    const frame = section?.querySelector('figure')?.closest('[inert]');
    expect(frame?.matches('[aria-hidden="true"].invisible')).toBe(true);
    // The line stands in the frame's grid cell, read as the chart's place.
    const line = screen.getByText(/^The price history could not be loaded/);
    expect(line.parentElement).toBe(frame?.parentElement);
    expect([...line.classList]).toEqual(expect.arrayContaining(['col-start-1', 'row-start-1']));
    // The source line's and the disclosure's places stay, unseen: no past performance is shown.
    expect(screen.getAllByText(/^Daily closes, 28 /)).toHaveLength(widest);
    expect(screen.queryByText(/^Daily closes/, { ignore: '[aria-hidden="true"]' })).toBeNull();
    const disclosure = screen.getByText(/^Past performance is not a reliable indicator/);
    expect(disclosure.matches('[aria-hidden="true"].invisible')).toBe(true);
    expect(screen.queryByRole('link', { name: 'Risk disclosure' })).toBeNull();
  });

  it('draws the frame seen and in reach, its cell no wider than the section, so a phone never scrolls sideways', async () => {
    await mount(closes);
    const frame = screen.getByRole('img').closest('figure')?.parentElement;
    expect(frame?.matches('[inert], [aria-hidden], .invisible')).toBe(false);
    expect(screen.queryByText(/^The price history could not be loaded/)).toBeNull();
    // An auto column would take the chart's min-content width; one minmax(0, 1fr) column takes the section's.
    expect([...(frame?.parentElement?.classList ?? [])]).toEqual(['grid', 'grid-cols-1']);
    expect(screen.getByText(/^Past performance is not a reliable indicator/).matches('[aria-hidden], .invisible')).toBe(
      false,
    );
  });
});
