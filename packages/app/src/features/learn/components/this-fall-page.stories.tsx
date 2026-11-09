import type { Coin, Plan } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import type { PastFall, RedDayModel } from '../../../lib/services/red-day-types';
import { ThisFallView } from './this-fall-page';

// The fall page in the states its route keeps: a fall of one coin, of several with one the price history lacks,
// a failed read, and the model still asked; in the page's measure. The test projects of vitest.config.ts render
// each at 360 and 1280 px, light and dark, with axe.

const fixture = fixtureSnapshot().plan;
if (fixture === null) throw new Error('the fixture snapshot has a plan');
const PLAN: Plan = { ...fixture, why: 'I buy every month and hold for four years.' };
const KAS = { id: 'KAS', name: 'Kaspa', geckoId: 'kaspa', decimals: 8 } as Coin;

type Figure = NonNullable<RedDayModel['figure']>;
const FIGURE = {
  coins: ['BTC'],
  missing: [],
  sevenDay: '-16.9876',
  fromHigh90: '-33.4567',
  first: '2025-11-10',
  last: '2026-11-08',
  currency: 'EUR',
  shortWindow: false,
} as unknown as Figure;
const BITCOIN = { coin: 'BTC', name: 'Bitcoin' };
const EPISODE = {
  state: 'episode',
  held: [BITCOIN],
  figure: FIGURE,
  episode: { start: '2026-11-07', last: '2026-11-08' },
  lastRed: { date: '2026-11-08', sevenDay: FIGURE.sevenDay, fromHigh90: FIGURE.fromHigh90 },
  nextBuy: '2026-12-01',
  buyDayToday: false,
} as unknown as RedDayModel;
const FALLS = [
  { coin: 'BTC', high: '2017-12-17', low: '2018-12-15', fall: '84', publisher: 'Bitstamp' },
  { coin: 'BTC', high: '2021-11-10', low: '2022-11-21', fall: '78', publisher: 'Bitstamp' },
  { coin: 'ETH', high: '2021-11-10', low: '2022-06-18', fall: '82', publisher: 'Bitstamp' },
] as unknown as readonly PastFall[];

const meta = {
  title: 'Features/Learn/ThisFallPage',
  component: ThisFallView,
  parameters: { path: '/learn/fall-under-way' },
  decorators: [
    (Story) => (
      <div className="mx-auto flex w-full max-w-reading flex-col gap-stack-lg px-gutter py-stack-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ThisFallView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const OneCoin: Story = {
  args: { plan: { ...PLAN, coins: PLAN.coins.slice(0, 1) }, model: EPISODE, falls: FALLS },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'The fall under way and your plan' })).toBeVisible();
    await expect(canvas.getByText(/^Bitcoin is 33\s?% below its 90-day high/)).toBeVisible();
    await expect(canvas.getAllByRole('listitem')).toHaveLength(2);
    await expect(canvas.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Back to Today',
      'Risk disclosure',
    ]);
    await expect(canvas.getByRole('heading', { level: 2, name: 'Your note to yourself' })).toBeVisible();
  },
};

/** ETH left the plan while its entries stay, so it is held; KAS has no price history. */
export const SeveralCoins: Story = {
  args: {
    plan: { ...PLAN, coins: [...PLAN.coins.filter((coin) => coin.id === 'BTC'), KAS] },
    model: {
      ...EPISODE,
      held: [BITCOIN, { coin: 'ETH', name: 'Ethereum' }, { coin: 'KAS', name: 'Kaspa' }],
      figure: { ...FIGURE, coins: ['BTC', 'ETH'], missing: ['KAS'] },
    } as unknown as RedDayModel,
    falls: FALLS,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/^Bitcoin and Ethereum, in the amounts you hold/)).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Why? The fall under way' })).toBeVisible();
    await expect(canvas.getByText(/^Kaspa is not in these figures/)).toBeVisible();
    await expect(canvas.getByText(/^Earlier falls of Ethereum/)).toBeVisible();
    await expect(canvas.getByText(/no dated earlier fall for Kaspa/)).toBeVisible();
  },
};

export const Failed: Story = {
  args: {
    plan: PLAN,
    model: { ...EPISODE, state: 'failed', figure: null, episode: null, lastRed: null } as RedDayModel,
    falls: FALLS,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/^The price history could not be loaded/)).toBeVisible();
    await expect(canvas.queryByText(/Price data by CoinGecko/)).toBeNull();
    // ETH is a plan coin at 0 units: only Bitcoin's falls, with the past-performance line under them.
    await expect(canvas.getAllByRole('listitem')).toHaveLength(2);
    await expect(canvas.getByText(/^Past performance/)).toBeVisible();
  },
};

/** The earlier falls wait for the model, which names the held coins. */
export const Pending: Story = {
  args: { plan: PLAN, model: null, falls: null },
  play: async ({ canvasElement, canvas }) => {
    await expect(canvasElement.querySelectorAll('[aria-busy="true"]')).toHaveLength(1);
    await expect(canvas.queryAllByRole('listitem')).toHaveLength(0);
    await expect(canvas.queryByText(/^Past performance/)).toBeNull();
  },
};
