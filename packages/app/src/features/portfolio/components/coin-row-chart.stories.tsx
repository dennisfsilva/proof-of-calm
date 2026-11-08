import { addDays, type CoinId, type CurrencyCode, type Price, type PriceHistory } from '@proofofcalm/core';
import { anEntry, date, money, units } from '@proofofcalm/core/testing';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { expect, waitFor } from 'storybook/test';
import { COIN_CHART_VIEW_BOX, type CoinChartModel, coinChart } from '../lib/coin-chart';
import { CoinRowChart, type CoinRowChartProps } from './coin-row-chart';

// A holdings row's BTC chart over 30 made-up daily closes, placed by coinChart as the app places them: three
// monthly buys, a sale and the average cost; while the closes load, then drawn; and the line a coin with fewer
// than two closes inside the range shows instead. The test projects of
// vitest.config.ts render each at 360 and 1280 px, light and dark, with axe.

const BTC = 'BTC' as CoinId;
const EUR = 'EUR' as CurrencyCode;
const START = date('2026-09-21');
const history = Array.from({ length: 30 }, (_, day) => [
  addDays(START, day),
  String(58_000 + day * 120 + (day % 4) * 900 - (day % 7) * 600),
]) as unknown as PriceHistory;
const trade = (kind: 'dca' | 'sell', day: number, amount: string, quantity: string) =>
  anEntry({
    kind,
    slot: kind === 'dca' ? ('2026-10' as never) : null,
    coin: BTC,
    date: addDays(START, day),
    amount: money(amount),
    units: units(quantity),
  });
const entries = [
  trade('dca', 2, '100', '0.0017'),
  trade('dca', 12, '100', '0.00166'),
  trade('sell', 18, '150', '0.0025'),
  trade('dca', 24, '100', '0.00163'),
];
const model = coinChart(
  entries,
  BTC,
  history,
  { start: START, end: addDays(START, 29) },
  '59500' as Price,
  COIN_CHART_VIEW_BOX,
) as CoinChartModel;
const drawn: CoinRowChartProps['chart'] = { kind: 'draws', model, range: '30d', ownDates: false };

/** The closes arrive when the play function dispatches `draw` here. */
const closes = new EventTarget();
function LoadsThenDraws() {
  const [chart, setChart] = useState<CoinRowChartProps['chart']>({ kind: 'loading' });
  useEffect(() => {
    const arrive = () => setChart(drawn);
    closes.addEventListener('draw', arrive);
    return () => closes.removeEventListener('draw', arrive);
  }, []);
  return <CoinRowChart coin={BTC} colour="btc" currency={EUR} chart={chart} />;
}

const NAME = /^BTC price, last 30 days \(.+ to .+\), from .+ to .+$/;

const meta = {
  title: 'Features/Portfolio/CoinRowChart',
  component: CoinRowChart,
  args: { coin: BTC, colour: 'btc', currency: EUR, chart: drawn },
} satisfies Meta<typeof CoinRowChart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Draws: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('img', { name: NAME })).toBeVisible();
    await expect(canvas.getByText('Price data by CoinGecko')).toBeVisible();
    await expect(canvas.getByText('Sale')).toBeVisible();
  },
};

export const Loading: Story = {
  args: { chart: { kind: 'loading' } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('img')).toBeNull();
  },
};

/** The closes could not be had: the frame keeps its place unseen, and the value chart's line says why. */
export const Unavailable: Story = {
  args: { chart: { kind: 'unavailable' } },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.queryByRole('img')).toBeNull();
    await expect(canvasElement.querySelector('[data-slot="coin-row-chart"]')).not.toBeVisible();
  },
};

/** The closes arrive after the first render: the row keeps its height. */
export const KeepsItsHeight: Story = {
  render: () => <LoadsThenDraws />,
  play: async ({ canvas, canvasElement }) => {
    const root = canvasElement.querySelector('[data-slot="coin-row-chart"]');
    if (root === null) throw new Error('No row chart');
    await canvasElement.ownerDocument.fonts.ready;
    const before = root.getBoundingClientRect().height;
    closes.dispatchEvent(new Event('draw'));
    await waitFor(() => expect(canvas.getByRole('img', { name: NAME })).toBeVisible());
    await expect(root.getBoundingClientRect().height).toBe(before);
  },
};

/** Fewer than two closes inside the range: one line names the coin and the range's dates, and no chart. */
export const FewCloses: Story = {
  args: { chart: { kind: 'few-closes', start: date('2026-10-26'), end: date('2026-10-27') } },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        /^The price history has fewer than two daily closes for BTC from .+ to .+, so there is no chart\.$/,
      ),
    ).toBeVisible();
    await expect(canvas.queryByRole('img')).toBeNull();
  },
};
