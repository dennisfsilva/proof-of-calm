import { countryRules, loadProfile } from '@proofofcalm/content';
import type { CalendarDate, CurrencyCode, Entry, Instant, Plan, PriceHistories } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import type { HistoriesState } from '../lib/use-histories';
import { JanuaryValue } from './january-value';

// The Dutch Portfolio line over the fixture plan seen on 15 March 2030, so 0.02215 BTC and 0.119 ETH are held at
// the end of 31 December 2029: the value from made-up closes of that day, labelled and credited; while the
// closes load; with no ETH close that day; and with coins added in the Log after it. The test projects of
// vitest.config.ts render each at 360 and 1280 px, light and dark, with axe.

const profile = await loadProfile('NL');
if (profile === null) throw new Error('no NL profile');
const NL = countryRules(profile);
const fixture = fixtureSnapshot();
if (fixture.plan === null) throw new Error('no fixture plan');
const plan: Plan = {
  ...fixture.plan,
  country: 'NL' as Plan['country'],
  countryRuleVersion: 1,
  holdingRule: { kind: 'none' },
};
const nowMs = fixtureNowMs('sell');

const histories = (closes: Record<string, string>): HistoriesState => ({
  status: 'ready',
  histories: {
    currency: 'EUR' as CurrencyCode,
    coins: Object.fromEntries(
      Object.entries(closes).map(([coin, close]) => [coin, [['2029-12-31', close]]]),
    ) as unknown as PriceHistories['coins'],
  },
  fetchedAt: '2030-03-15T09:00:00.000Z' as Instant,
});
const [first] = fixture.entries;
if (first === undefined) throw new Error('no fixture entry');
const added: Entry = {
  ...first,
  id: '00000000-0000-4000-8000-000000009001' as Entry['id'],
  kind: 'held',
  slot: null,
  date: '2030-01-02' as CalendarDate,
  amount: null,
};

const meta = {
  title: 'Features/Portfolio/JanuaryValue',
  component: JanuaryValue,
  parameters: { services: () => createTestServices({ snapshot: { ...fixture, plan }, nowMs, rules: async () => NL }) },
  args: { plan, entries: fixture.entries, histories: histories({ BTC: '50000', ETH: '2000' }), rules: NL },
} satisfies Meta<typeof JanuaryValue>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Valued: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Value on 1 January 2030')).toBeVisible();
    await expect(
      await canvas.findByText(
        'Estimate from the daily closes of 31 Dec 2029 for BTC and ETH · Price data by CoinGecko',
      ),
    ).toBeVisible();
  },
};

export const Loading: Story = {
  args: { histories: { status: 'loading' } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('Loading the daily closes of 31 Dec 2029.')).toBeVisible();
  },
};

export const MissingClose: Story = {
  args: { histories: histories({ BTC: '50000' }) },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        'The price history has no daily close of 31 Dec 2029 for ETH, so there is no value to show.',
      ),
    ).toBeVisible();
  },
};

export const AddedAfter: Story = {
  args: { entries: [...fixture.entries, added] },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText('Coins added in the Log with a date after 31 Dec 2029 are not in this value: BTC.'),
    ).toBeVisible();
  },
};
