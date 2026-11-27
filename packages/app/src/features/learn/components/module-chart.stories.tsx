import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import { useFormatters } from '../../../lib/services';
import type { PastFall } from '../../../lib/services/red-day-types';
import { DrawdownBars, ModuleChart } from './module-chart';

// The risk module's chart from the cycles file through the red-day port, in the page's measure; the test projects
// of vitest.config.ts render it at 360 and 1280 px, light and dark, with axe.

const meta = {
  title: 'Features/Learn/ModuleChart',
  component: ModuleChart,
  args: { chart: 'drawdowns-bar' },
  decorators: [
    (Story) => (
      <div className="mx-auto flex w-full max-w-reading flex-col gap-stack-lg px-gutter py-stack-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ModuleChart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const DrawdownsBar: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(
      await canvas.findByRole('img', { name: /^Falls from each high to the lowest low after it/ }),
    ).toBeVisible();
    await expect(canvasElement.querySelectorAll('[data-slot="bar-chart-bar"]')).toHaveLength(9);
    await expect(canvas.getByText(/intraday highs and lows/)).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Risk disclosure' })).toBeVisible();
  },
};

// Synthetic rows that mix the bases, dates no row of the cycles file holds: an intraday fall and one between daily
// closes, so the table names each row's publisher in its Source column.
const MIXED = [
  { coin: 'BTC', high: '2017-12-18', low: '2018-12-16', fall: '83', publisher: 'Bitstamp' },
  { coin: 'ETH', high: '2018-01-20', low: '2018-12-08', fall: '93', publisher: 'Kraken', basis: 'close' },
] as unknown as readonly PastFall[];

export const MixedBases: Story = {
  render: function Render() {
    return <DrawdownBars falls={MIXED} f={useFormatters()} />;
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByText('Show the falls as a table'));
    await expect(canvas.getByRole('columnheader', { name: 'Source' })).toBeVisible();
    const cells = canvas
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.lastElementChild?.textContent);
    await expect(cells).toEqual(['Bitstamp', 'Kraken']);
    await expect(canvas.getByText(/intraday highs and lows, and Kraken daily closes/)).toBeVisible();
  },
};

// The narrowest phone: the table stacks, and each publisher shows the column's name above it (docs/DESIGN.md §8).
export const MixedBasesStacked: Story = {
  ...MixedBases,
  globals: { viewport: { value: 'android-small', isRotated: false } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByText('Show the falls as a table'));
    const table = canvasElement.querySelector('details table');
    await waitFor(() => expect(table).toHaveAttribute('data-stacked'));
    const sources = [...canvasElement.querySelectorAll('details tbody tr')].map((row) => row.lastElementChild);
    await expect(sources.map((cell) => cell?.textContent)).toEqual(['Bitstamp', 'Kraken']);
    for (const cell of sources)
      await expect(cell === null ? 'missing' : getComputedStyle(cell, '::before').content).toMatch(/^"Source"/);
  },
};
