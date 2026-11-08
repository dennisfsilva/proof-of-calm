import type { Meta, StoryObj } from '@storybook/react-vite';
import { Sparkline } from './sparkline';

const meta = {
  title: 'Charts/Sparkline',
  component: Sparkline,
  args: {
    viewBox: { width: 100, height: 30 },
    path: 'M0 24 L10 22 L20 25 L30 19 L40 21 L50 15 L60 17 L70 12 L80 14 L90 8 L100 10',
    end: { x: 100, y: 10 },
    colour: 'btc',
    label: 'BTC price, last 30 days, from 58 120 € to 61 640 €, +6.1 %',
    table: {
      summary: 'Show the prices as a table',
      columns: ['Date', 'Price'],
      rows: [
        ['17 September 2026', '58 120 €'],
        ['2 October 2026', '59 980 €'],
        ['17 October 2026', '61 640 €'],
      ],
      numericColumns: [1],
    },
  },
} satisfies Meta<typeof Sparkline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Bitcoin: Story = {};

export const Ether: Story = {
  args: {
    colour: 'eth',
    path: 'M0 8 L20 12 L40 10 L60 18 L80 16 L100 22',
    end: { x: 100, y: 22 },
    label: 'ETH price, last 30 days, from 2 710 € to 2 552 €, −5.8 %',
  },
};
