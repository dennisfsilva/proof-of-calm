import type { CalendarDate } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import type { PastFall } from '../../../lib/services/red-day-types';
import { SiteFalls } from './falls';
import { StaticLearn } from './static';

// The Risk page's falls table in the site's column (apps/web/src/site/layout.tsx); the test projects of
// vitest.config.ts render it at 360 and 1280 px, light and dark, with axe.

const meta = {
  title: 'Features/Learn/SiteFalls',
  component: SiteFalls,
  decorators: [
    (Story) => (
      <StaticLearn today={'2026-11-15' as CalendarDate}>
        <div className="mx-auto flex w-full max-w-reading flex-col gap-stack-lg px-gutter py-stack-lg">
          <Story />
        </div>
      </StaticLearn>
    ),
  ],
} satisfies Meta<typeof SiteFalls>;

export default meta;

type Story = StoryObj<typeof meta>;

// Synthetic rows that mix the bases and the publishers, on dates no row of the cycles file holds: intraday falls, one
// from two series, and falls between Kraken's daily closes, so the table adds its Source column.
const MIXED = [
  {
    coin: 'BTC',
    high: '2011-06-09',
    low: '2011-11-21',
    fall: '93',
    publisher: 'Bitcoinity (Mt. Gox) and CoinMarketCap',
  },
  { coin: 'BTC', high: '2017-12-18', low: '2018-12-16', fall: '83', publisher: 'Bitstamp' },
  { coin: 'ETH', high: '2018-01-20', low: '2018-12-08', fall: '93', publisher: 'Kraken', basis: 'close' },
  { coin: 'SOL', high: '2021-11-07', low: '2022-12-28', fall: '95', publisher: 'Kraken', basis: 'close' },
  { coin: 'LINK', high: '2021-05-11', low: '2023-06-09', fall: '90', publisher: 'Bitstamp' },
] as unknown as readonly PastFall[];

export const MixedBases: Story = { args: { falls: MIXED } };

// The narrowest phone at 125 % text: the fall, the main figure after the coin (docs/DESIGN.md §8), reads in the box
// before any scroll, in the header and in every row, though the Source column takes room after it.
export const MixedNarrow: Story = {
  args: { falls: MIXED },
  globals: { textZoom: '125', viewport: { value: 'android-small', isRotated: false } },
  play: async ({ canvas }) => {
    const region = canvas.getByRole('region', { name: /^Falls from each high/ });
    await expect(region.scrollLeft).toBe(0);
    const edge = region.getBoundingClientRect().right;
    const falls = [
      canvas.getByRole('columnheader', { name: 'Fall' }),
      ...[...region.querySelectorAll('tbody tr')].map((row) => row.children[1]),
    ];
    await expect(falls).toHaveLength(MIXED.length + 1);
    for (const cell of falls) await expect(cell?.getBoundingClientRect().right).toBeLessThanOrEqual(edge);
  },
};
