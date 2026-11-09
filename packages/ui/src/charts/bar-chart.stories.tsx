import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { BarChart, type BarChartBar } from './bar-chart';

// The completed cycles' falls as the risk module draws them (docs/EDUCATION.md §2): one bar per coin and cycle,
// each value labelled, the same values in the table.
const FALLS: readonly [string, string, string, string, number][] = [
  ['BTC', '2011', '8 Jun 2011', '22 Nov 2011', 94],
  ['BTC', '2013', '30 Nov 2013', '14 Jan 2015', 87],
  ['BTC', '2017', '17 Dec 2017', '15 Dec 2018', 84],
  ['BTC', '2021', '10 Nov 2021', '21 Nov 2022', 78],
  ['ETH', '2018', '13 Jan 2018', '14 Dec 2018', 94],
  ['ETH', '2021', '10 Nov 2021', '18 Jun 2022', 82],
  ['SOL', '2021', '6 Nov 2021', '29 Dec 2022', 97],
];

const bars: BarChartBar[] = FALLS.map(([coin, year, , , fall]) => ({
  id: `${coin}-${year}`,
  label: `${coin} ${year}`,
  fraction: fall / 100,
  value: `−${fall}%`,
}));

const meta = {
  title: 'Charts/Bar chart',
  component: BarChart,
  args: {
    bars,
    label: 'Falls from each completed cycle’s high to its low, BTC, ETH and SOL, 8 Jun 2011 to 29 Dec 2022',
    description: 'One bar per coin and cycle, its length the fall from the intraday high to the intraday low.',
    table: {
      summary: 'Show the falls as a table',
      columns: ['Coin', 'High', 'Low', 'Fall'],
      rows: FALLS.map(([coin, , high, low, fall]) => [coin, high, low, `−${fall}%`]),
      numericColumns: [3],
    },
  },
  play: async ({ canvas, canvasElement, args }) => {
    const drawing = canvas.getByRole('img', { name: args.label });
    await expect(drawing.querySelector('desc')?.textContent).toBe(args.description);
    await expect(drawing.querySelectorAll('[data-slot="bar-chart-bar"]')).toHaveLength(args.bars.length);
    for (const bar of args.bars) {
      await expect(canvas.getByText(bar.label)).toBeVisible();
    }
    // Every value is labelled beside its bar, and the table holds the same rows.
    const values = canvasElement.querySelectorAll('[data-slot="bar-chart-value"]');
    await expect([...values].map((value) => value.textContent)).toEqual(args.bars.map((bar) => bar.value));
    const details = canvasElement.querySelector('details');
    await expect(details?.querySelectorAll('tbody tr')).toHaveLength(args.table.rows.length);
  },
} satisfies Meta<typeof BarChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CycleFalls: Story = {};

export const TwoBars: Story = {
  args: {
    bars: bars.slice(0, 2),
    label: 'Falls from each completed cycle’s high to its low, BTC, 8 Jun 2011 to 14 Jan 2015',
    description: 'One bar per cycle of BTC, its length the fall from the intraday high to the intraday low.',
    table: {
      summary: 'Show the falls as a table',
      columns: ['Coin', 'High', 'Low', 'Fall'],
      rows: FALLS.slice(0, 2).map(([coin, , high, low, fall]) => [coin, high, low, `−${fall}%`]),
      numericColumns: [3],
    },
  },
};
