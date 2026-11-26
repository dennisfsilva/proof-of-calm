// @vitest-environment jsdom
import { addDays, type CoinId, type CurrencyCode, type Price, type PriceHistory } from '@proofofcalm/core';
import { anEntry, date, money, units } from '@proofofcalm/core/testing';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { ServicesProvider } from '../../../lib/services';
import { createTestServices } from '../../../lib/services/testing';
import messages from '../../../messages/en/portfolio.json';
import { type CoinChartModel, coinChart } from '../lib/coin-chart';
import { CoinRowChart, type CoinRowChartProps } from './coin-row-chart';

// A holdings row's price chart (ADR-0022): named by the coin, the range, its dates and the first and last
// close, with no change figure (docs/DESIGN.md §4), its table holding every point, credited under it.

afterEach(cleanup);

const BTC = 'BTC' as CoinId;
const EUR = 'EUR' as CurrencyCode;
const history = ['100', '110', '120', '130', '140', '150'].map((value, offset) => [
  addDays(date('2026-01-01'), offset),
  value,
]) as unknown as PriceHistory;
const bought = anEntry({
  kind: 'extra',
  slot: null,
  coin: BTC,
  date: date('2026-01-02'),
  amount: money('100'),
  units: units('1'),
});
const model = coinChart(
  [bought],
  BTC,
  history,
  { start: date('2025-12-07'), end: date('2026-01-06') },
  '100' as Price,
  { width: 300, height: 100 },
) as CoinChartModel;

async function mount(chart: CoinRowChartProps['chart']) {
  const services = createTestServices();
  await act(() => services.start());
  await act(async () => {
    render(
      <ServicesProvider services={services}>
        <I18nProvider messages={{ portfolio: messages }}>
          <CoinRowChart coin={BTC} colour="btc" currency={EUR} chart={chart} />
        </I18nProvider>
      </ServicesProvider>,
    );
  });
}

// A formatted date joins its parts with a space or a no-break space.
const day = (value: string) => value.replaceAll(' ', '[\\s ]');

describe('CoinRowChart', () => {
  it('names the chart by the coin, the range, its dates and the first and last close', async () => {
    await mount({ kind: 'draws', model, range: '30d', ownDates: false });
    const name = new RegExp(
      `^BTC price, last 30 days \\(${day('1 Jan 2026')} to ${day('6 Jan 2026')}\\), from €100\\.00 to €150\\.00$`,
    );
    expect(screen.getByRole('img', { name })).toBeTruthy();
    // The credit is set at 14 px (ADR-0050).
    expect(screen.getByText('Price data by CoinGecko').classList).toContain('text-14');
  });

  it('names it by its own dates alone when the closes start after the range', async () => {
    await mount({ kind: 'draws', model, range: '30d', ownDates: true });
    const name = new RegExp(`^BTC price, ${day('1 Jan 2026')} to ${day('6 Jan 2026')}, from €100\\.00 to €150\\.00$`);
    expect(screen.getByRole('img', { name })).toBeTruthy();
  });

  it('holds every point in the table, with what was bought that day', async () => {
    await mount({ kind: 'draws', model, range: '30d', ownDates: false });
    const table = screen.getByRole('table', { hidden: true });
    const rows = within(table).getAllByRole('row', { hidden: true });
    expect(rows).toHaveLength(model.points.length + 1);
    expect(rows[2]?.textContent).toMatch(new RegExp(`^${day('2 Jan 2026')}€110\\.00€100\\.00$`));
  });

  it('names a purchase and a sale in the legend, as nouns, never a bare "Buy"', async () => {
    const sold = anEntry({
      kind: 'sell',
      slot: null,
      coin: BTC,
      date: date('2026-01-04'),
      amount: money('260'),
      units: units('2'),
    });
    const traded = coinChart(
      [bought, sold],
      BTC,
      history,
      { start: date('2025-12-07'), end: date('2026-01-06') },
      '100' as Price,
      { width: 300, height: 100 },
    ) as CoinChartModel;
    await mount({ kind: 'draws', model: traded, range: '30d', ownDates: false });
    const legend = document.querySelector('[data-slot="coin-chart-legend"]');
    expect(legend?.textContent).toContain('Purchase');
    expect(legend?.textContent).toContain('Sale');
    expect(legend?.textContent).not.toContain('Buy');
  });

  it('keeps the frame unseen, out of reach and unread while the closes load, its legend, toggle and credit too', async () => {
    await mount({ kind: 'loading' });
    const chart = document.querySelector('[data-slot="coin-row-chart"]');
    expect(chart?.getAttribute('aria-busy')).toBe('true');
    const frame = chart?.querySelector(':scope > [inert]');
    expect(frame?.matches('[aria-hidden="true"].invisible')).toBe(true);
    for (const label of ['BTC price', 'Show the daily closes as a table', 'Price data by CoinGecko']) {
      expect(frame?.contains(screen.getByText(label))).toBe(true);
    }
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('keeps the frame’s height, unseen, unread and not busy, with the value chart’s line at its top when the closes fail', async () => {
    const line = 'The price history could not be loaded, so there is no chart. Open Portfolio again to retry.';
    await mount({ kind: 'unavailable', line });
    const chart = document.querySelector('[data-slot="coin-row-chart"]');
    expect(chart?.matches('[aria-busy], [aria-hidden], .invisible')).toBe(false);
    const frame = chart?.querySelector(':scope > [inert][aria-hidden="true"].invisible');
    expect(frame?.querySelector('figure')).not.toBeNull();
    // The line shares the frame's grid cell, at its top, seen and read, and never live: the value chart's says it.
    const shown = screen.getByText(line);
    expect(shown.parentElement).toBe(chart);
    expect([...shown.classList]).toEqual(expect.arrayContaining(['col-start-1', 'row-start-1']));
    expect(shown.matches('[role], [aria-live]')).toBe(false);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('starts no transition when the frame is shown or hidden, since a reduced-motion one never ends in a closed table', async () => {
    const line = 'The price history could not be loaded, so there is no chart. Open Portfolio again to retry.';
    const charts: CoinRowChartProps['chart'][] = [
      { kind: 'loading' },
      { kind: 'draws', model, range: '30d', ownDates: false },
      { kind: 'unavailable', line },
    ];
    for (const chart of charts) {
      await mount(chart);
      const frame = document.querySelector('[data-slot="coin-row-chart"] > div');
      expect([...(frame?.classList ?? [])]).toEqual(expect.arrayContaining(['transition-none', '**:transition-none']));
      cleanup();
    }
  });
});
