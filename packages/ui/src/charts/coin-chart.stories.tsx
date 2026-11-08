import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import { CoinChart, type CoinChartMarker, type CoinChartPoint } from './coin-chart';

// Sixty closes of a made-up BTC year in a 300 × 100 viewBox, mapped the way the app maps them with the
// core's chart maths (docs/DOMAIN.md §3.14): x by day, y on the padded price domain, one decimal place.
const WIDTH = 300;
const HEIGHT = 100;
const months = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
const prices = Array.from({ length: 60 }, (_, index) =>
  Math.round(52_000 + index * 160 + 3_200 * Math.sin(index / 5) + 900 * Math.cos(index / 2)),
);
const low = Math.min(...prices);
const high = Math.max(...prices);
const pad = (high - low) * 0.08;
const round = (value: number) => Math.round(value * 10) / 10;
const xAt = (index: number) => round((index / (prices.length - 1)) * WIDTH);
const yAt = (price: number) => round(((high + pad - price) / (high - low + 2 * pad)) * HEIGHT);
const euros = (value: number) => `${value.toLocaleString('pt-PT')} €`;
const dateAt = (index: number) => `${(index % 5) * 6 + 1} ${months[Math.floor(index / 5)]}`;

const points: CoinChartPoint[] = prices.map((price, index) => ({
  x: xAt(index),
  y: yAt(price),
  label: `${dateAt(index)}: ${euros(price)}`,
}));
const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join('');
const last = points.at(-1) ?? { x: 0, y: 0 };
const buyDays = [2, 7, 12, 17, 22, 27, 32, 37, 42, 47, 52, 57];
const buys: CoinChartMarker[] = buyDays.map((index) => ({
  id: `buy-${index}`,
  kind: 'buy',
  x: xAt(index),
  y: yAt(prices[index] ?? 0),
}));
const averagePrice = Math.round(buyDays.reduce((sum, index) => sum + (prices[index] ?? 0), 0) / buyDays.length);

const meta = {
  title: 'Charts/Coin chart',
  component: CoinChart,
  args: {
    viewBox: { width: WIDTH, height: HEIGHT },
    colour: 'btc',
    path,
    end: last,
    markers: buys,
    average: { y: yAt(averagePrice), label: `Average ${euros(averagePrice)}` },
    gridlines: [25, 50, 75],
    axis: { top: euros(high), bottom: euros(low), start: 'Nov 2025', end: 'Oct 2026' },
    legend: { price: 'BTC price', buy: 'Buy', sell: 'Sale', average: 'Your average cost' },
    points,
    label: `BTC price, last year, from ${euros(prices[0] ?? 0)} to ${euros(prices.at(-1) ?? 0)}; 12 buys at an average of ${euros(averagePrice)}`,
    table: {
      summary: 'Show the buys as a table',
      columns: ['Date', 'Kind', 'Price'],
      rows: buyDays.map((index) => [`${dateAt(index)} ${index < 10 ? 2025 : 2026}`, 'Buy', euros(prices[index] ?? 0)]),
      numericColumns: [2],
    },
  },
} satisfies Meta<typeof CoinChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Buys: Story = {
  play: async ({ canvas, canvasElement, args }) => {
    await expect(canvas.getByRole('img', { name: args.label })).toBeVisible();
    await expect(canvasElement.querySelectorAll('[data-slot="coin-chart-buy"]')).toHaveLength(12);
    await expect(canvasElement.querySelector('[data-slot="coin-chart-average"]')).not.toBeNull();
    // Compared as written: the formatted amount holds no-break spaces, which text matchers collapse.
    const level = canvasElement.querySelector('[data-slot="coin-chart-average-label"]');
    await expect(level?.textContent).toBe(args.average?.label);
    // Every mark the chart draws is named in the legend.
    const legend = canvasElement.querySelector('[data-slot="coin-chart-legend"]');
    await expect(legend).toHaveTextContent('BTC price');
    await expect(legend).toHaveTextContent('Buy');
    await expect(legend).toHaveTextContent('Your average cost');
    await expect(legend).not.toHaveTextContent('Sale');
  },
};

export const BuysAndASale: Story = {
  args: {
    colour: 'eth',
    markers: [...buys.slice(0, 10), { id: 'sale', kind: 'sell', x: xAt(55), y: yAt(prices[55] ?? 0) }],
    legend: { price: 'ETH price', buy: 'Buy', sell: 'Sale', average: 'Your average cost' },
    label: 'ETH price, last year; 10 buys and one sale',
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-slot="coin-chart-sell"]')).toHaveLength(1);
    await expect(canvasElement.querySelector('[data-slot="coin-chart-legend"]')).toHaveTextContent('Sale');
  },
};

export const AverageOutsideTheRange: Story = {
  args: {
    average: { y: -40, label: 'Average 71 200 €' },
    markers: [
      { id: 'early', kind: 'buy', x: -5, y: 50 },
      { id: 'high', kind: 'buy', x: 150, y: -30 },
    ],
    label: 'BTC price, last year, below the average cost of 71 200 €',
  },
  play: async ({ canvasElement }) => {
    // The level is not drawn outside the range; a mark outside the plot is kept at its edge or left out.
    await expect(canvasElement.querySelector('[data-slot="coin-chart-average"]')).toBeNull();
    const marks = canvasElement.querySelectorAll('[data-slot="coin-chart-buy"] path');
    await expect(marks).toHaveLength(2);
    await expect(marks[0]?.getAttribute('d')).toBe('M150 0h0');
  },
};

export const Hover: Story = {
  play: async ({ canvasElement, args }) => {
    const plot = canvasElement.querySelector<HTMLElement>('[data-slot="coin-chart-plot"]');
    if (plot === null) throw new Error('no plot');
    const box = plot.getBoundingClientRect();
    const index = 30;
    const target = args.points?.[index];
    const clientX = box.left + ((target?.x ?? 0) / WIDTH) * box.width;
    const clientY = box.top + box.height / 2;
    plot.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX, clientY, pointerType: 'mouse' }));

    // The crosshair snaps to the nearest point and the tooltip says its date and price.
    await waitFor(() => expect(canvasElement.querySelector('[data-slot="coin-chart-crosshair"]')).not.toBeNull());
    const tooltip = () => canvasElement.ownerDocument.querySelector('[data-slot="tooltip-content"]');
    await waitFor(() => expect(tooltip()?.textContent).toBe(target?.label));

    // React reads a leave from pointerout and where the pointer went.
    const outside = canvasElement.ownerDocument.body;
    plot.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: outside, pointerType: 'mouse' }));
    await waitFor(() => expect(canvasElement.querySelector('[data-slot="coin-chart-crosshair"]')).toBeNull());
    await waitFor(() => expect(tooltip()).toBeNull());
  },
};

export const WithoutHover: Story = {
  args: { points: [] },
  play: async ({ canvasElement }) => {
    const plot = canvasElement.querySelector('[data-slot="coin-chart-plot"]');
    await expect(plot).not.toHaveClass('cursor-crosshair');
  },
};
