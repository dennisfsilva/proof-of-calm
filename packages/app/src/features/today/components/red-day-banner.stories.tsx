import type { CalendarDate, CoinId, Percent } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { RedDayBanner } from './red-day-banner';

// The red-day banner at Today's foot (docs/CONTENT-STYLE.md §3): the seven-day sentence, the 90-day-high one and
// several coins named, the figure combined. The test projects of vitest.config.ts render each at 360 and 1280 px,
// light and dark, with axe.

const lastRed = { date: '2026-10-19' as CalendarDate, sevenDay: '-16.4' as Percent, fromHigh90: '-12' as Percent };
const BTC = { coin: 'BTC' as CoinId, name: 'Bitcoin' };
const ETH = { coin: 'ETH' as CoinId, name: 'Ethereum' };

const meta = {
  title: 'Features/Today/RedDayBanner',
  component: RedDayBanner,
  parameters: { path: '/today', snapshot: fixtureSnapshot(), nowMs: fixtureNowMs('buy') },
  args: { lastRed, coins: [BTC], onOpen: fn(), onDismiss: fn() },
} satisfies Meta<typeof RedDayBanner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SevenDays: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText(/^Bitcoin fell 16% in the seven days to 19/u)).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'See the fall under way and your plan' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Dismiss' }));
    await expect(args.onDismiss).toHaveBeenCalledOnce();
  },
};

export const FromTheHigh: Story = {
  args: { lastRed: { ...lastRed, sevenDay: null, fromHigh90: '-33.2' as Percent } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Bitcoin was 33% below its 90-day high\.$/u)).toBeVisible();
  },
};

export const SeveralCoins: Story = {
  args: { coins: [BTC, ETH] },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(/^Bitcoin and Ethereum, in the amounts you hold, fell 16% in the seven days to 19/u),
    ).toBeVisible();
    await expect(canvas.getByRole('status')).toBeVisible();
  },
};
