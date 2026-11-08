import type { Meta, StoryObj } from '@storybook/react-vite';
import { AllocationBar } from './allocation-bar';

const meta = {
  title: 'Charts/Allocation bar',
  component: AllocationBar,
  args: {
    segments: [
      { id: 'BTC', label: 'BTC', colour: 'btc', start: 0, end: 0.62, share: '62 %' },
      { id: 'ETH', label: 'ETH', colour: 'eth', start: 0.62, end: 0.85, share: '23 %' },
      { id: 'SOL', label: 'SOL', colour: 'sol', start: 0.85, end: 0.95, share: '10 %' },
      { id: 'LINK', label: 'LINK', colour: 'link', start: 0.95, end: 1, share: '5 %' },
    ],
    label: 'Allocation by value on 17 October 2026: BTC 62 %, ETH 23 %, SOL 10 %, LINK 5 %',
    table: {
      summary: 'Show the allocation as a table',
      columns: ['Coin', 'Share', 'Value'],
      rows: [
        ['BTC', '62 %', '1 153 €'],
        ['ETH', '23 %', '428 €'],
        ['SOL', '10 %', '186 €'],
        ['LINK', '5 %', '93 €'],
      ],
      numericColumns: [1, 2],
    },
  },
} satisfies Meta<typeof AllocationBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FourCoins: Story = {};

export const WithOther: Story = {
  args: {
    segments: [
      { id: 'BTC', label: 'BTC', colour: 'btc', start: 0, end: 0.55, share: '55 %' },
      { id: 'ETH', label: 'ETH', colour: 'eth', start: 0.55, end: 0.8, share: '25 %' },
      { id: 'other', label: 'Other', colour: 'other', start: 0.8, end: 1, share: '20 %' },
    ],
    label: 'Allocation by value on 17 October 2026: BTC 55 %, ETH 25 %, other coins 20 %',
  },
};

export const OnTheBackground: Story = { args: { on: 'background', legend: false } };
