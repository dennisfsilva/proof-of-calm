// @vitest-environment jsdom
import {
  addDays,
  type CalendarDate,
  type CoinId,
  type Money,
  type Percent,
  type Price,
  type PriceHistory,
  type SimulationInput,
  simulate,
  startDateSensitivity,
} from '@proofofcalm/core';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { ServicesProvider } from '../../../lib/services';
import { createTestServices } from '../../../lib/services/testing';
import learn from '../../../messages/en/learn.json';
import { buyDayFor, defaultWindow } from '../lib/simulator-dates';
import { SimulationView } from './simulation-view';

// The simulator's result (docs/EDUCATION.md §7): the path with its table view, the past-performance line and the
// credit under it, the figures, the multiple, the caveat, then the start-date table behind one disclosure. The
// closes are synthetic (ADR-0036, Reading of 2026-11-27), run through the core's simulate.

const logged = vi.spyOn(console, 'error');
afterEach(() => {
  cleanup();
  const missing = logged.mock.calls.filter((call) => String(call[0]).includes('MISSING_MESSAGE'));
  logged.mockClear();
  expect(missing).toEqual([]);
});

const BTC = 'BTC' as CoinId;

/** Daily closes from `first` for `count` days, the close given by `close(date)`. */
const closes = (first: string, count: number, close: (date: CalendarDate) => string): PriceHistory =>
  Array.from({ length: count }, (_, index) => {
    const date = addDays(first as CalendarDate, index);
    return [date, close(date) as Price] as const;
  });

/** The plan the screen would run by default over one coin's closes: 100 a month from V2's dates. */
function run(history: PriceHistory, feePercent = '0') {
  const range = { first: history[0]?.[0] as CalendarDate, last: history.at(-1)?.[0] as CalendarDate };
  const window = defaultWindow([range]);
  if (window === null) throw new Error('no window');
  const input: SimulationInput = {
    split: { [BTC]: '100' as Percent },
    monthlyAmount: '100' as Money,
    startDate: window.start,
    endDate: window.end,
    buyDay: buyDayFor(window.start),
    feePercent: feePercent as Percent,
    histories: { currency: 'EUR', coins: { [BTC]: history } },
  };
  const simulation = simulate(input);
  if (!simulation.ok) throw new Error(simulation.error.code);
  return { simulation: simulation.value, sensitivity: startDateSensitivity(input), first: window.first };
}

const ETH = 'ETH' as CoinId;

/**
 * A year of 100 a month on the 1st from 1 Jan 2024 over constant closes, split evenly over `coins`; each coin's
 * closes leave out the days `missing` names for it, so a buy due on one of them is a gap of that coin.
 */
function runWithout(missing: Readonly<Partial<Record<CoinId, readonly string[]>>>, coins = [BTC, ETH]) {
  const year = closes('2024-01-01', 366, () => '100');
  const input: SimulationInput = {
    split: Object.fromEntries(coins.map((coin) => [coin, String(100 / coins.length) as Percent])),
    monthlyAmount: '100' as Money,
    startDate: '2024-01-01' as CalendarDate,
    endDate: '2024-12-31' as CalendarDate,
    buyDay: 1,
    histories: {
      currency: 'EUR',
      coins: Object.fromEntries(
        coins.map((coin) => [coin, year.filter(([date]) => !(missing[coin] ?? []).includes(date))]),
      ),
    },
  };
  const simulation = simulate(input);
  if (!simulation.ok) throw new Error(simulation.error.code);
  return {
    simulation: simulation.value,
    sensitivity: startDateSensitivity(input),
    first: '2024-01-01' as CalendarDate,
  };
}

async function mount(result: ReturnType<typeof run>) {
  const services = createTestServices();
  await services.start();
  const view = render(
    <ServicesProvider services={services}>
      <I18nProvider messages={{ learn }}>
        <SimulationView
          simulation={result.simulation}
          sensitivity={result.sensitivity}
          currency="EUR"
          closesFrom={result.first}
        />
      </I18nProvider>
    </ServicesProvider>,
  );
  return view.container;
}

/** Three years of one close from 1 Jan 2024. */
const FLAT = closes('2024-01-01', 1096, () => '100');
/** Five weeks of closes, the published history's first weeks. */
const WEEKS = closes('2026-11-26', 36, () => '100');

/** The figure under a term of the figures' list. */
const figureOf = (term: string) => screen.getByText(term, { selector: 'dt' }).nextElementSibling?.textContent;

const CAVEAT =
  'Past prices are facts; a simulation of them is not a forecast. Taxes, fees, slippage and your own behaviour are not in this chart.';

describe('the simulation view', () => {
  it('reads 1.00× at a constant price', async () => {
    await mount(run(FLAT));
    expect(figureOf('Value against money invested')).toBe('1.00×');
    expect(screen.getByText('The value did not fall below an earlier high.', { selector: 'dd' })).toBeTruthy();
  });

  it('reads 0.99× at a constant price with a 1 % fee', async () => {
    await mount(run(FLAT, '1'));
    expect(figureOf('Value against money invested')).toBe('0.99×');
  });

  it('shows the path, its lines, the figures, the multiple, the caveat and the table in that order', async () => {
    const container = await mount(run(FLAT));
    const text = container.textContent ?? '';
    const order = [
      'Show the values as a table',
      'Reference closes, ',
      'Past performance is not a reliable indicator of future results.',
      'Reference closes derived from Kraken and Bitstamp public data; FX: ECB reference rates',
      'Maximum drawdown',
      'Longest time below an earlier high',
      'Months in loss',
      'Buy days with no close',
      'Value against money invested',
      CAVEAT,
      'Show the plan from 12 start dates as a table',
    ].map((part) => text.indexOf(part));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(screen.getByText(CAVEAT)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Risk disclosure' }).getAttribute('href')).toBe('/risk');
    expect(text).not.toMatch(/annual/i);
  });

  // No hindsight figure without its label (docs/LEGAL.md §6 Q6): the end value is named simulated where it shows.
  it('names the value simulated in the legend and the multiple’s line', async () => {
    const container = await mount(run(FLAT));
    const legend = container.querySelector('[data-slot="simulator-chart-legend"]');
    expect(legend?.textContent).toMatch(/^Simulated value/);
    expect(screen.getByText(/^Simulated value of €.+ on .+ for €.+ invested\.$/, { selector: 'dd' })).toBeTruthy();
  });

  it('sets the caveat in its own box, as a Learn module does (docs/CONTENT-STYLE.md §5)', async () => {
    const container = await mount(run(FLAT));
    expect(container.querySelector('[data-slot="card"]')?.textContent).toBe(CAVEAT);
  });

  it('dates the path and the falls of a fall that recovered', async () => {
    const history = closes('2024-01-01', 1096, (date) => (date >= '2025-07-01' && date < '2026-01-01' ? '50' : '100'));
    await mount(run(history));
    expect(screen.getByRole('img', { name: /^Simulated value and money invested, / })).toBeTruthy();
    expect(screen.getByText(/^From the high on .+ to the low on .+, back at that high on .+\.$/)).toBeTruthy();
    // 7 units worth 700 on 30 June 2025, then 9 worth 450 after the buy at 50: a fall of 35.7 %.
    expect(figureOf('Maximum drawdown')).toMatch(/^\D35\.7\s?%$/);
  });

  // The core keeps a gap per coin and due date (docs/EDUCATION.md §8); the figure counts the buy days, its label's words.
  it('counts a buy day both coins miss once', async () => {
    const result = runWithout({ [BTC]: ['2024-03-01'], [ETH]: ['2024-03-01'] });
    expect(result.simulation.gaps).toHaveLength(2);
    await mount(result);
    expect(figureOf('Buy days with no close')).toBe('1');
  });

  it('counts a buy day one of two coins misses once', async () => {
    await mount(runWithout({ [ETH]: ['2024-03-01'] }));
    expect(figureOf('Buy days with no close')).toBe('1');
  });

  it('counts two missing buy days as 2', async () => {
    await mount(runWithout({ [BTC]: ['2024-03-01', '2024-06-01'], [ETH]: ['2024-06-01'] }));
    expect(figureOf('Buy days with no close')).toBe('2');
  });

  it('opens the start-date table on one tap, 12 rows oldest first', async () => {
    const result = run(FLAT);
    await mount(result);
    const summary = screen.getByText('Show the plan from 12 start dates as a table');
    const details = summary.closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    fireEvent.click(summary);
    expect(details.open).toBe(true);
    const rows = within(details).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(12);
    const starts = result.sensitivity.map((row) => row.startDate);
    expect([...starts].sort()).toEqual(starts);
    expect(within(details).queryByText('No closes')).toBeNull();
    expect(within(details).queryByText(/^The table starts the same plan/)).toBeNull();
  });

  it('says once, above the table, how many of its rows start before the closes begin', async () => {
    await mount(run(WEEKS));
    const details = screen.getByText('Show the plan from 12 start dates as a table').closest('details') as HTMLElement;
    const line = within(details).getByText(
      /^The table starts the same plan up to 11 months earlier; the closes begin on /,
    );
    expect(line.textContent).toMatch(/, so 11 of its 12 rows have none\.$/);
    expect(within(details).getAllByText('No closes')).toHaveLength(11);
    expect(within(details).getAllByText(/^The table starts/)).toHaveLength(1);
  });
});
