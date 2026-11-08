import { COINS } from '@proofofcalm/content';
import type { CoinId } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { CoinsStep } from './coins-step';

// The custom path's coins: none chosen yet (Continue waits), two coins split 60/40, and a split off 100
// refused by Continue.

const meta = {
  title: 'Features/Onboarding/CoinsStep',
  component: CoinsStep,
  args: { value: { coins: [], shares: {} }, issues: [], onChange: fn(), onBack: fn(), onContinue: fn() },
} satisfies Meta<typeof CoinsStep>;

export default meta;

type Story = StoryObj<typeof meta>;

const twoCoins = (btc: string, eth: string) => ({
  coins: COINS.filter((coin) => coin.id === 'BTC' || coin.id === 'ETH'),
  shares: { ['BTC' as CoinId]: btc, ['ETH' as CoinId]: eth },
});

export const NoCoins: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Continue' })).toBeDisabled();
  },
};

export const TwoCoins: Story = { args: { value: twoCoins('60', '40') } };

export const Refused: Story = {
  args: { value: twoCoins('60', '30'), issues: [{ code: 'split-sum', path: ['split'] }] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Make the shares add up to 100 %.')).toBeVisible();
  },
};
