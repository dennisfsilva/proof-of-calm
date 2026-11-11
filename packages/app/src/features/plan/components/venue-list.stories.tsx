import type { CalendarDate, CoinId, Units } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import type { CoinVenues } from '../lib/venues';
import { VenueList } from './venue-list';

// The review page's units per venue on 20 Oct 2026: a Log with an exchange, a wallet, units with no venue and
// one-tap estimates; one that names no venue; and one with nothing held. The test projects render each at 360 and
// 1280 px, light and dark, with axe.

const today = '2026-10-20' as CalendarDate;
const coin = (id: string, decimals: number, venues: [string | null, string][], estimated = 0): CoinVenues => ({
  coin: id as CoinId,
  decimals,
  venues: venues.map(([venue, units]) => ({ venue, units: units as Units })),
  estimated,
});

const meta = {
  title: 'Features/Plan/VenueList',
  component: VenueList,
  args: { today, venues: [] },
} satisfies Meta<typeof VenueList>;

export default meta;

type Story = StoryObj<typeof meta>;

/** `Open the Log` meets the 44 px target (docs/DESIGN.md §5). */
async function target(root: HTMLElement) {
  const link = root.querySelector<HTMLElement>('a');
  await expect(link?.getBoundingClientRect().height ?? 0).toBeGreaterThanOrEqual(44);
}

export const Venues: Story = {
  args: {
    venues: [
      coin(
        'BTC',
        8,
        [
          ['Bitvavo', '0.01523'],
          ['Ledger Nano X in the drawer at home', '0.0099'],
          [null, '0.0042'],
        ],
        14,
      ),
      coin('ETH', 6, [['Kraken', '0.5']], 1),
      coin('SOL', 8, [['kraken', '2']]),
    ],
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText('With no venue')).toBeVisible();
    await expect(canvas.getByText(/^Bought as planned estimated the units of 14 BTC entries/)).toBeVisible();
    await expect(canvas.getByText(/^Bought as planned estimated the units of 1 ETH entry/)).toBeVisible();
    await target(canvasElement);
  },
};

export const NoVenueNamed: Story = {
  args: { venues: [coin('BTC', 8, [[null, '0.01523']], 12), coin('ETH', 6, [[null, '0.4']], 12)] },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText('With no venue')).toHaveLength(2);
  },
};

export const NothingHeld: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText(/^The Log shows no coins held at the end of 20\sOct\s2026\.$/u)).toBeVisible();
    await target(canvasElement);
  },
};
