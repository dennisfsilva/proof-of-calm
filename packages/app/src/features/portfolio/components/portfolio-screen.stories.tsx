import { countryRules, loadProfile } from '@proofofcalm/content';
import { err, ok } from '@proofofcalm/core';
import { anEntry, BTC, date, money, units } from '@proofofcalm/core/testing';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import type { CachedHistory, HistorySource, Snapshot } from '../../../lib/ports';
import { type FixturePhase, fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices, FIXTURE_PRICES, pricesAt } from '../../../lib/services/testing';
import { PortfolioScreen } from './portfolio-screen';

// The Portfolio screen over the fixture plan at its two dates, with both coins priced at the story's
// own time (so the sell-phase story's prices are dated 15 March 2030), with a holdings row open on its
// chart and one opened while the closes load, before any price, with no price
// history for the value chart, with closes that end before the first purchase, with a coin short of two
// closes, sold out before the closes, and without a plan; the test projects of vitest.config.ts render each
// at 360 and 1280 px, light and dark, with axe.
// The plan is Portugal's and its rules are loaded, so the figures are the product's, in pt-PT.

const portugal = async () => {
  const profile = await loadProfile('PT');
  return profile === null ? null : countryRules(profile);
};

const at = (
  phase: FixturePhase,
  priced = true,
  { entries, ...history }: { historySource?: HistorySource; entries?: Snapshot['entries'] } = {},
) => {
  const nowMs = fixtureNowMs(phase);
  const fixture = fixtureSnapshot();
  const snapshot: Snapshot = {
    ...fixture,
    entries: entries ?? fixture.entries,
    prices: priced ? pricesAt(FIXTURE_PRICES, nowMs) : null,
  };
  return { services: () => createTestServices({ snapshot, nowMs, rules: portugal, ...history }) };
};

/** A history source that answers every coin with these closes, fetched at the buy phase's time. */
const closesOf = (closes: readonly (readonly [string, string])[]): HistorySource => ({
  closes: async (coin, currency) =>
    ok({
      coin,
      currency,
      closes: closes as unknown as CachedHistory['closes'],
      fetchedAt: new Date(fixtureNowMs('buy')).toISOString() as CachedHistory['fetchedAt'],
    }),
});

/** The source's closes (by default the test source's), held until the play function releases them, anew each render. */
let releaseCloses: () => void = () => undefined;
const heldCloses = (source = createTestServices({ nowMs: fixtureNowMs('buy') }).history): HistorySource => {
  const held = new Promise<void>((resolve) => {
    releaseCloses = resolve;
  });
  return { closes: (coin, currency) => held.then(() => source.closes(coin, currency)) };
};

/** The device's copy of the closes, fetched late yesterday: the 30 days to yesterday, from a day in September. */
const cachedCloses: HistorySource = {
  closes: async (coin, currency) =>
    ok({
      coin,
      currency,
      closes: Array.from({ length: 31 }, (_, day) => [
        new Date(Date.parse('2026-09-19T00:00:00Z') + day * 86_400_000).toISOString().slice(0, 10),
        String(58_000 + day * 50),
      ]) as unknown as CachedHistory['closes'],
      fetchedAt: '2026-10-19T22:58:00.000Z' as CachedHistory['fetchedAt'],
    }),
};

/**
 * Where the allocation bar stands below the screen's top at each width from 280 to 800 px, so a line that
 * wraps differently before and after the closes arrive shows at some width whatever the font's metrics.
 */
const barTops = (root: HTMLElement, bar: Element): number[] => {
  const tops: number[] = [];
  for (let width = 280; width <= 800; width += 2) {
    root.style.width = `${width}px`;
    tops.push(bar.getBoundingClientRect().top - root.getBoundingClientRect().top);
  }
  root.style.width = '';
  return tops;
};

/** The closes arrive after the first render: at every width, nothing below the chart moves. */
const keepsItsHeight: Story['play'] = async ({ canvas, canvasElement }) => {
  await expect(await canvas.findByText('1626,56 €')).toBeVisible();
  await expect(canvasElement.querySelector('section[aria-busy="true"]')).not.toBeNull();
  const bar = canvasElement.querySelector('[data-slot="allocation-bar"]');
  if (bar === null) throw new Error('No allocation bar');
  // The typeface first: a font that loads between the two sweeps would move the bar by itself.
  await canvasElement.ownerDocument.fonts.ready;
  const before = barTops(canvasElement, bar);
  releaseCloses();
  await expect(await canvas.findByRole('img', { name: VALUE_CHART })).toBeVisible();
  const after = barTops(canvasElement, bar);
  const moved = before.flatMap((top, index) =>
    Math.abs((after[index] ?? Number.NaN) - top) <= 0.5 ? [] : [`${280 + index * 2} px: ${top} to ${after[index]}`],
  );
  await expect(moved).toEqual([]);
};

// The test source's three closes start after the 30 days, so the charts name their own dates.
const VALUE_CHART = /^Portfolio value, .+ to .+, from .+ to .+$/;
const BTC_CHART = /^BTC price, .+ to .+, from .+ to .+$/;

/** Opens a coin's holdings row and returns the detail row that holds its chart. */
const openRow = async (
  canvas: Parameters<NonNullable<Story['play']>>[0]['canvas'],
  coin: string,
): Promise<HTMLElement> => {
  const button = canvas.getByRole('button', { name: coin });
  await userEvent.click(button);
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  const detail = button.ownerDocument.getElementById(button.getAttribute('aria-controls') ?? '');
  if (detail === null) throw new Error('The row controls no detail');
  return detail;
};

/** The 31 closes of the 30 days to the buy date, so the range holds the fixture's ETH sale of 20 September. */
const monthOfCloses = closesOf(
  Array.from({ length: 31 }, (_, day) => [
    new Date(Date.parse('2026-09-20T00:00:00Z') + day * 86_400_000).toISOString().slice(0, 10),
    String(2400 + day * 5),
  ]),
);

const meta = {
  title: 'Features/Portfolio/PortfolioScreen',
  component: PortfolioScreen,
  parameters: { path: '/portfolio' },
} satisfies Meta<typeof PortfolioScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Buying: Story = {
  parameters: at('buy'),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('1626,56 €')).toBeVisible();
    const btc = canvas.getByRole('button', { name: 'BTC' });
    await userEvent.click(btc);
    await expect(btc).toHaveAttribute('aria-expanded', 'true');
    await expect(canvas.getByText('56 433,41 €')).toBeVisible();
    // Each row holds its detail; BTC's comes first and only it is open (its chart's legend may name the average too).
    const [btcAverage, ethAverage] = canvas.getAllByText('Average cost', { selector: 'dt' });
    await expect(btcAverage).toBeVisible();
    await expect(ethAverage).not.toBeVisible();
    await expect(await canvas.findByRole('img', { name: VALUE_CHART })).toBeVisible();
    await expect(canvas.getByRole('button', { name: '30D, last 30 days' })).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByText(/^Past performance is not a reliable indicator/)).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Risk disclosure' })).toHaveAttribute('href', '/risk');
  },
};

export const Selling: Story = {
  parameters: at('sell'),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('1626,56 €')).toBeVisible();
    await expect(canvas.getByRole('table', { name: 'Holdings' })).toBeVisible();
    await expect(await canvas.findByRole('img', { name: VALUE_CHART })).toBeVisible();
  },
};

/** The closes arrive after the first render: the section keeps its drawn height, so nothing below moves. */
export const ChartLoads: Story = {
  parameters: {
    services: () => at('buy', true, { historySource: heldCloses() }).services(),
  },
  play: keepsItsHeight,
};

/** The same from the device's copy: the range's dates and the fetch time differ from the first render's. */
export const ChartLoadsFromCache: Story = {
  parameters: {
    services: () => at('buy', true, { historySource: heldCloses(cachedCloses) }).services(),
  },
  play: keepsItsHeight,
};

/** An open row draws its coin's closes over the value chart's range, credited, with no past-performance line of its own. */
export const RowOpen: Story = {
  parameters: at('buy'),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('img', { name: VALUE_CHART })).toBeVisible();
    const detail = await openRow(canvas, 'BTC');
    await expect(await within(detail).findByRole('img', { name: BTC_CHART })).toBeVisible();
    await expect(within(detail).getByText('Price data by CoinGecko')).toBeVisible();
    await expect(within(detail).queryByText(/^Past performance/)).toBeNull();
    await expect(canvas.getAllByText(/^Past performance/)).toHaveLength(1);
  },
};

/**
 * A row opened while the closes load holds the empty frame, busy and unread, at the height the chart draws
 * in, also once the legend gains the Sale its range holds.
 */
export const RowOpensWhileLoading: Story = {
  parameters: {
    services: () => at('buy', true, { historySource: heldCloses(monthOfCloses) }).services(),
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(await canvas.findByText('1626,56 €')).toBeVisible();
    const detail = await openRow(canvas, 'ETH');
    await expect(detail.querySelector('[data-slot="coin-row-chart"][aria-busy="true"]')).not.toBeNull();
    await expect(within(detail).queryByRole('img')).toBeNull();
    await canvasElement.ownerDocument.fonts.ready;
    const before = detail.getBoundingClientRect().height;
    releaseCloses();
    await expect(await within(detail).findByRole('img', { name: /^ETH price, last 30 days \(/ })).toBeVisible();
    await expect(within(detail).getByText('Sale')).toBeVisible();
    await expect(detail.getBoundingClientRect().height).toBe(before);
  },
};

export const ChartUnavailable: Story = {
  parameters: at('buy', true, { historySource: { closes: async () => err({ kind: 'network' }) } }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/^The price history could not be loaded/)).toBeVisible();
    await expect(canvas.queryByRole('img', { name: VALUE_CHART })).toBeNull();
  },
};

/**
 * The closes end before the first purchase: the ranges stay and one dated line takes the chart's place, on
 * the default range too, since no range can draw.
 */
export const ChartStartsLater: Story = {
  parameters: at('buy', true, {
    historySource: closesOf([
      ['2026-03-01', '58000'],
      ['2026-03-02', '60000.12'],
    ]),
  }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        /^There is no value to draw since the first entry: the daily closes end on .+\. The chart starts with the next daily close.$/,
      ),
    ).toBeVisible();
    await expect(canvas.getByRole('group', { name: 'Chart range' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: '30D, last 30 days' })).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.queryByRole('img', { name: VALUE_CHART })).toBeNull();
    await expect(canvas.queryByText(/^Past performance/)).toBeNull();
  },
};

/** Each coin has one close: one line names them, with no ranges and no retry step. */
export const ChartTooFewCloses: Story = {
  parameters: at('buy', true, { historySource: closesOf([['2026-03-01', '58000']]) }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        /^The price history has fewer than two daily closes for BTC.+ETH, so there is no chart\.$/,
      ),
    ).toBeVisible();
    await expect(canvas.queryByRole('group', { name: 'Chart range' })).toBeNull();
    await expect(canvas.queryByRole('img', { name: VALUE_CHART })).toBeNull();
  },
};

/** Everything bought was sold before the closes start: the ranges stay and the line dates the closes. */
export const ChartNothingHeld: Story = {
  parameters: at('buy', true, {
    entries: [
      anEntry({
        kind: 'extra',
        slot: null,
        coin: BTC.id,
        date: date('2026-04-05'),
        units: units('1'),
        amount: money('100'),
      }),
      anEntry({
        kind: 'sell',
        slot: null,
        coin: BTC.id,
        date: date('2026-04-06'),
        units: units('1'),
        amount: money('100'),
      }),
    ],
    historySource: closesOf([
      ['2026-05-01', '58000'],
      ['2026-05-02', '60000.12'],
    ]),
  }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        /^There is no value to draw: you held no coins from .+ to .+, the dates the daily closes cover\.$/,
      ),
    ).toBeVisible();
    await expect(canvas.getByRole('group', { name: 'Chart range' })).toBeVisible();
    await expect(canvas.queryByText(/starts with the next daily close/)).toBeNull();
    await expect(canvas.queryByRole('img', { name: VALUE_CHART })).toBeNull();
  },
};

export const BeforePrices: Story = {
  parameters: at('buy', false),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('No price yet for BTC, ETH.')).toBeVisible();
  },
};

export const NoPlan: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('link', { name: 'Set up a plan' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'import a file' })).toBeVisible();
  },
};
