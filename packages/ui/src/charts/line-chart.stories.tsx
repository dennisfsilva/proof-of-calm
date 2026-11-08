import type { Meta, StoryObj } from '@storybook/react-vite';
import { LineChart } from './line-chart';

const meta = {
  title: 'Charts/Line chart',
  component: LineChart,
  args: {
    viewBox: { width: 300, height: 100 },
    gridlines: [0, 50, 100],
    series: [
      {
        id: 'value',
        label: 'Portfolio value',
        colour: 'btc',
        path: 'M0 92 L30 88 L60 84 L90 79 L120 81 L150 70 L180 62 L210 58 L240 44 L270 37 L300 30',
        end: { x: 300, y: 30 },
      },
    ],
    axis: { top: '1 900 €', bottom: '1 100 €', start: 'Oct 2025', end: 'Oct 2026' },
    label: 'Portfolio value, last year, from 1 200 € to 1 860 €, +55 %',
    table: {
      summary: 'Show the values as a table',
      columns: ['Month', 'Value'],
      rows: [
        ['October 2025', '1 200 €'],
        ['April 2026', '1 420 €'],
        ['October 2026', '1 860 €'],
      ],
      numericColumns: [1],
    },
  },
} satisfies Meta<typeof LineChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PortfolioValue: Story = {};

export const TwoCoins: Story = {
  args: {
    series: [
      {
        id: 'btc',
        label: 'BTC',
        colour: 'btc',
        path: 'M0 80 L50 72 L100 76 L150 60 L200 52 L250 40 L300 34',
        end: { x: 300, y: 34 },
      },
      {
        id: 'eth',
        label: 'ETH',
        colour: 'eth',
        path: 'M0 60 L50 66 L100 58 L150 70 L200 64 L250 72 L300 68',
        end: { x: 300, y: 68 },
      },
    ],
    label: 'BTC and ETH value, last year: BTC from 820 € to 1 410 €, +72 %; ETH from 380 € to 450 €, +18 %',
  },
};
