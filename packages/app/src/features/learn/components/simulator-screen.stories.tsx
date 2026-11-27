import type { CoinId, Result } from '@proofofcalm/core';
import type { Dataset } from '@proofofcalm/data';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import type { ClosesFailure } from '../lib/reference-closes';
import { SimulatorScreen } from './simulator-screen';

// The simulator's route in each data state, its closes stubbed through the screen's `load` prop, so no story
// fetches: still asked, not published yet, failed (offline and invalid) with Reload, and a dataset. Synthetic
// closes only (ADR-0036, Reading of 2026-11-27). The test projects of vitest.config.ts render each at 360 and
// 1280 px, light and dark, with axe.

type Loaded = Result<Dataset, ClosesFailure>;
type Load = (coin: CoinId) => Promise<Loaded>;

// Two synthetic days, not closes of any exchange.
const DATASET = {
  coin: 'BTC',
  currency: 'EUR',
  days: [
    { date: '2026-03-02', close: '100', sources: 2 },
    { date: '2026-03-03', close: '101.25', sources: 2 },
  ],
} as Dataset;

const settled =
  (result: Loaded): Load =>
  async () =>
    result;
const failed = (kind: ClosesFailure['kind']) => settled({ ok: false, error: { kind } });

const FAILED = 'The price history could not be loaded. Check your connection, then reload the page.';
const CREDIT = 'Reference closes derived from Kraken and Bitstamp public data; FX: ECB reference rates';

const meta = {
  title: 'Features/Learn/SimulatorScreen',
  component: SimulatorScreen,
  parameters: { path: '/learn/simulator' },
  decorators: [
    (Story) => (
      <div className="mx-auto flex w-full max-w-reading flex-col gap-stack-lg px-gutter py-stack-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SimulatorScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The closes are still asked for: a load that never settles. */
export const Loading: Story = {
  args: { load: () => new Promise<Loaded>(() => undefined) },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Simulator' })).toBeVisible();
    await expect(canvas.getByTestId('simulator-result')).toHaveAttribute('aria-busy', 'true');
    await expect(canvas.queryByRole('button', { name: 'Reload' })).toBeNull();
  },
};

export const Unpublished: Story = {
  args: { load: failed('unpublished') },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText('The price history the simulator runs on is not published yet.'),
    ).toBeVisible();
    await expect(canvas.getByTestId('simulator-result')).toHaveAttribute('aria-busy', 'false');
    await expect(canvas.queryByRole('button', { name: 'Reload' })).toBeNull();
    await expect(canvas.queryByText(CREDIT)).toBeNull();
  },
};

/** The site could not be reached; Reload goes to the stories' recording platform. */
export const FailedOffline: Story = {
  args: { load: failed('offline') },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(FAILED)).toBeVisible();
    const reload = canvas.getByRole('button', { name: 'Reload' });
    await expect(reload).toBeVisible();
    await userEvent.click(reload);
    await expect(canvas.queryByText(CREDIT)).toBeNull();
  },
};
