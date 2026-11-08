// @vitest-environment jsdom
import { countryRules, loadProfile } from '@proofofcalm/content';
import {
  type CalendarDate,
  type ChartRange,
  type Coin,
  type CoinId,
  type Entry,
  type Instant,
  type PriceHistories,
  portfolio,
} from '@proofofcalm/core';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { ServicesProvider } from '../../../lib/services';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices, FIXTURE_PRICES } from '../../../lib/services/testing';
import messages from '../../../messages/en/portfolio.json';
import type { HistoriesState } from '../lib/use-histories';
import { type ChartState, chartState } from '../lib/value-chart';
import { Holdings, type RowCharts } from './holdings';
import { VALUE_CHART_VIEW_BOX } from './value-chart';

// The holdings table (docs/DESIGN.md §7, §8): one row per coin held, showing value and P/L, each opening
// to the units, the average cost and the amount invested, and to the coin's chart over the value chart's
// range while that chart draws or loads. The plan is Portugal's and its rules are loaded, so the figures
// are the ones the product shows, in pt-PT.

afterEach(cleanup);

const portugal = async () => {
  const profile = await loadProfile('PT');
  return profile === null ? null : countryRules(profile);
};

/** An element's text with every space one U+0020, as pt-PT groups and spaces with U+00A0 and U+202F. */
const textOf = (element: Element | null) => (element?.textContent ?? '').replace(/\s/g, ' ');

const SOL = { id: 'SOL', name: 'Solana', geckoId: 'solana', decimals: 4 } as Coin;

const DAY_MS = 86_400_000;
/** A close on each of the 91 days to the fixture's buy date, 20 October 2026: every range up to 90 days is covered. */
const DAILY = Array.from({ length: 91 }, (_, day) => [
  new Date(Date.parse('2026-07-22T00:00:00Z') + day * DAY_MS).toISOString().slice(0, 10),
  String(58_000 + day * 10),
]);
const READY: HistoriesState = {
  status: 'ready',
  histories: { currency: 'EUR', coins: { BTC: DAILY, ETH: DAILY } } as unknown as PriceHistories,
  fetchedAt: '2026-10-20T10:00:00.000Z' as Instant,
};

/** The row charts over the value chart's state: by default the state the ready closes give the range. */
type Charts = {
  readonly state?: ChartState;
  readonly histories?: HistoriesState;
  readonly range?: ChartRange;
  /** Whether the entries replace the fixture's instead of adding to them. */
  readonly only?: boolean;
};

async function renderHoldings(entries: readonly Entry[], extraCoins: readonly Coin[] = [], charts: Charts = {}) {
  const { plan: fixturePlan, entries: fixtureEntries } = fixtureSnapshot();
  if (fixturePlan === null) throw new Error('the fixture has a plan');
  const plan = { ...fixturePlan, coins: [...fixturePlan.coins, ...extraCoins] };
  const all = charts.only === true ? entries : [...fixtureEntries, ...entries];
  const held = portfolio(plan, all, FIXTURE_PRICES.snapshot);
  const { histories = READY, range = '30d' } = charts;
  const rowCharts: RowCharts = {
    entries: all,
    state: charts.state ?? chartState(plan, all, histories, range, VALUE_CHART_VIEW_BOX),
    histories,
    range,
    colours: new Map<CoinId, 'btc' | 'eth'>([
      ['BTC' as CoinId, 'btc'],
      ['ETH' as CoinId, 'eth'],
    ]),
  };
  const services = createTestServices({ snapshot: fixtureSnapshot(), rules: portugal });
  await act(() => services.start());
  return render(
    <ServicesProvider services={services}>
      <I18nProvider messages={{ portfolio: messages }}>
        <Holdings plan={plan} portfolio={held} charts={rowCharts} />
      </I18nProvider>
    </ServicesProvider>,
  );
}

/** Opens a coin's row and returns its detail. */
function open(coin: string): HTMLElement {
  const button = screen.getByRole('button', { name: coin });
  fireEvent.click(button);
  const detail = document.getElementById(button.getAttribute('aria-controls') ?? '');
  if (detail === null) throw new Error('the row controls its detail');
  return detail;
}

const ROW_CHART = '[data-slot="coin-row-chart"]';
const DAY = (value: string) => value as CalendarDate;

describe('Holdings', () => {
  it('lists only the coins held: not one never bought, nor one sold in full', async () => {
    const { entries } = fixtureSnapshot();
    const lastSale = entries.at(-1);
    if (lastSale === undefined) throw new Error('the fixture has entries');
    // The rest of the fixture's ETH, 0.179 bought less 0.06 sold.
    const sellTheRest = { ...lastSale, id: `${lastSale.id.slice(0, -3)}999`, units: '0.119' } as Entry;
    await renderHoldings([sellTheRest], [SOL]);
    const table = screen.getByRole('table', { name: 'Holdings' });
    expect(
      within(table)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['BTC']);
    expect(within(table).queryByText('ETH')).toBeNull();
    expect(within(table).queryByText('SOL')).toBeNull();
  });

  it('shows value and P/L per coin and opens a row to its units, average cost and invested', async () => {
    await renderHoldings([]);
    const table = screen.getByRole('table', { name: 'Holdings' });
    expect(
      within(table)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['BTC', 'ETH']);
    // Two columns, the P/L beneath the value, so the table fits a phone at 125 % text.
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((head) => head.textContent),
    ).toEqual(['Coin', 'Value P/L']);
    expect(within(table).getByRole('columnheader', { name: 'Value P/L' })).toBeDefined();
    const btc = within(table).getByRole('button', { name: 'BTC' });
    const row = btc.closest('tr');
    if (row === null) throw new Error('the button sits in a row');
    expect(textOf(row)).toContain('1329,00 €+79,00 € (+6,3%)');

    const detail = document.getElementById(btc.getAttribute('aria-controls') ?? '');
    expect(detail?.hidden).toBe(true);
    fireEvent.click(btc);
    expect(btc.getAttribute('aria-expanded')).toBe('true');
    expect(detail?.hidden).toBe(false);
    expect(textOf(detail)).toContain('Units0,02215000 BTC');
    expect(textOf(detail)).toContain('Average cost56 433,41 €');
    expect(textOf(detail)).toContain('Invested1250,00 €');
  });

  it('draws a chart in an open row only, named by the coin and the value chart’s range', async () => {
    await renderHoldings([]);
    // A closed row holds its detail, hidden, with no chart in it.
    expect(document.querySelector(ROW_CHART)).toBeNull();
    const detail = open('BTC');
    expect(
      within(detail).getByRole('img', { name: /^BTC price, last 30 days \(.+ to .+\), from .+ to .+$/ }),
    ).toBeDefined();
    expect(document.querySelectorAll(ROW_CHART)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'BTC' }));
    expect(document.querySelector(ROW_CHART)).toBeNull();
  });

  it('follows the one range the value chart draws', async () => {
    await renderHoldings([], [], { range: '90d' });
    expect(within(open('ETH')).getByRole('img', { name: /^ETH price, last 90 days \(/ })).toBeDefined();
  });

  it('keeps an open row’s empty frame, busy and unread, while the closes load', async () => {
    await renderHoldings([], [], { state: { kind: 'loading' }, histories: { status: 'loading' } });
    const detail = open('BTC');
    expect(detail.querySelector(`${ROW_CHART}[aria-busy="true"]`)).not.toBeNull();
    expect(within(detail).queryByRole('img')).toBeNull();
  });

  it('keeps an open row’s empty frame, unseen and unread, when the closes fail, so the row keeps its height', async () => {
    await renderHoldings([], [], {
      state: { kind: 'unavailable' },
      histories: { status: 'failed', failure: { kind: 'http', status: 502 } },
    });
    const detail = open('BTC');
    expect(detail.querySelector(ROW_CHART)?.matches('.invisible:not([aria-busy])')).toBe(true);
    expect(within(detail).queryByRole('img')).toBeNull();
  });

  it('names the coin and the range’s dates in an open row whose closes inside the range are fewer than two', async () => {
    // A new plan whose first buys were yesterday, and ETH's history a day shorter than BTC's: All runs
    // from 26 to 27 October, which holds BTC's two closes and ETH's one.
    const [btcLump, ethLump] = fixtureSnapshot().entries;
    if (btcLump === undefined || ethLump === undefined) throw new Error('the fixture has its lumps');
    const yesterday = DAY('2026-10-26');
    const closes = (last: number) =>
      Array.from({ length: last - 19 }, (_, day) => [`2026-10-${20 + day}`, String(60_000 + day * 10)]);
    const histories: HistoriesState = {
      status: 'ready',
      histories: { currency: 'EUR', coins: { BTC: closes(27), ETH: closes(26) } } as unknown as PriceHistories,
      fetchedAt: '2026-10-27T10:00:00.000Z' as Instant,
    };
    await renderHoldings(
      [
        { ...btcLump, date: yesterday },
        { ...ethLump, date: yesterday },
      ],
      [],
      {
        histories,
        range: 'all',
        only: true,
      },
    );
    const eth = open('ETH');
    expect(eth.querySelector(ROW_CHART)).toBeNull();
    expect(within(eth).queryByRole('img')).toBeNull();
    expect(textOf(eth)).toMatch(
      /The price history has fewer than two daily closes for ETH from 26.+2026 to 27.+2026, so there is no chart\./,
    );
    expect(within(open('BTC')).getByRole('img', { name: /^BTC price, since the first entry \(/ })).toBeDefined();
  });

  // Counsel's condition (docs/LEGAL.md §4): a row chart would be the path's first historic view, without
  // the past-performance line, whenever the value chart shows a line instead of its drawing.
  const end = DAY('2026-10-20');
  const start = DAY('2026-09-20');
  const noChart: readonly ChartState[] = [
    { kind: 'none' },
    { kind: 'too-few-closes', coins: ['ETH' as CoinId] },
    { kind: 'starts-later', end },
    { kind: 'nothing-held', start, end },
    { kind: 'range-empty', range: '7d', start, end },
  ];
  for (const state of noChart) {
    it(`draws no row chart while the value chart shows its ${state.kind} line`, async () => {
      await renderHoldings([], [], { state });
      const detail = open('BTC');
      expect(detail.querySelector(ROW_CHART)).toBeNull();
      expect(within(detail).queryByRole('img')).toBeNull();
    });
  }
});
