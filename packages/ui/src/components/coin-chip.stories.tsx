import type { Meta, StoryObj } from '@storybook/react-vite';
import { coinColour } from '#lib/series';
import { CoinChip } from './coin-chip';

const meta = {
  title: 'Components/Coin chip',
  component: CoinChip,
  args: { coin: 'BTC', colour: 'btc', amount: '175 €' },
} satisfies Meta<typeof CoinChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Bitcoin: Story = {};

export const WithoutAmount: Story = { args: { coin: 'ETH', colour: 'eth', amount: undefined } };

const plan = [
  { coin: 'BTC', amount: '120 €' },
  { coin: 'ETH', amount: '60 €' },
  { coin: 'SOL', amount: '30 €' },
  { coin: 'LINK', amount: '20 €' },
  { coin: 'ADA', amount: '10 €' },
  { coin: 'DOT', amount: '10 €' },
];

export const PlanCoins: Story = {
  render: () => {
    const others = plan.filter(({ coin }) => !['BTC', 'ETH', 'SOL', 'LINK'].includes(coin)).map(({ coin }) => coin);
    return (
      <div className="flex flex-wrap gap-1">
        {plan.map(({ coin, amount }) => (
          <CoinChip key={coin} coin={coin} colour={coinColour(coin, others.indexOf(coin))} amount={amount} />
        ))}
      </div>
    );
  },
};
