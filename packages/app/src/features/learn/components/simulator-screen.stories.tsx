import { addDays, type CalendarDate, type CoinId, type Result } from '@proofofcalm/core';
import type { Dataset } from '@proofofcalm/data';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import type { ClosesFailure } from '../lib/reference-closes';
import { SimulatorScreen } from './simulator-screen';

// The simulator's route in each state, its closes stubbed through the screen's `load` prop, so no story fetches:
// still asked, not published yet, failed (offline and invalid) with Reload, the form over BTC's file, an added
// coin with no closes, a run with its result, and a fill from the plan. Synthetic closes only (ADR-0036, Reading
// of 2026-11-27). The test projects of vitest.config.ts render each at 360 and 1280 px, light and dark, with axe.

type Loaded = Result<Dataset, ClosesFailure>;
type Load = (coin: CoinId) => Promise<Loaded>;

/** Sixty synthetic days of a coin from 2 Mar 2026, rising 1 a day from 100: not closes of any exchange. */
const dataset = (coin: CoinId): Dataset =>
  ({
    coin,
    currency: 'EUR',
    days: Array.from({ length: 60 }, (_, index) => ({
      date: addDays('2026-03-02' as CalendarDate, index),
      close: String(100 + index),
      sources: 2,
    })),
  }) as Dataset;

const settled =
  (result: Loaded): Load =>
  async () =>
    result;
const failed = (kind: ClosesFailure['kind']) => settled({ ok: false, error: { kind } });
/** Every coin's file a dataset of that coin, but ETH's, which answers as given. */
const files =
  (eth?: Loaded): Load =>
  async (coin) =>
    (coin === 'ETH' ? eth : undefined) ?? { ok: true, value: dataset(coin) };

const FAILED = 'The price history could not be loaded. Check your connection, then reload the page.';
const CREDIT = 'Reference closes derived from Kraken and Bitstamp public data; FX: ECB reference rates';
const RUN = { name: 'Run the simulation' };

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
    await expect(canvas.queryByRole('button', RUN)).toBeNull();
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

/** The file answered but is not this coin's dataset: worded as the offline failure. */
export const FailedInvalid: Story = {
  args: { load: failed('invalid') },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(FAILED)).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Reload' })).toBeVisible();
    await expect(canvas.queryByText(/^Data from/)).toBeNull();
  },
};

/** BTC's file loaded: the form, the data's first day under the start, and no credit until a run. */
export const Data: Story = {
  args: { load: files() },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText('Data from 2 Mar 2026, the first day with closes from two exchanges.'),
    ).toBeVisible();
    await expect(canvas.getByRole('button', RUN)).toBeVisible();
    await expect(canvas.queryByText(CREDIT)).toBeNull();
    await expect(canvas.queryByRole('button', { name: 'Reload' })).toBeNull();
  },
};

/** ETH's file is not published: its row says so, and the run focuses its share. */
export const CoinWithoutCloses: Story = {
  args: { load: files({ ok: false, error: { kind: 'unpublished' } }) },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Add Ethereum' }));
    await userEvent.type(canvas.getByRole('textbox', { name: 'Ethereum share (%)' }), '100');
    await userEvent.type(canvas.getByRole('textbox', { name: 'Monthly amount (EUR)' }), '100');
    await userEvent.click(canvas.getByRole('button', RUN));
    await expect(await canvas.findByText(/^No reference closes for Ethereum yet\./)).toBeVisible();
    await expect(canvas.getByRole('textbox', { name: 'Ethereum share (%)' })).toHaveFocus();
  },
};

/** A run: the result under its heading, which takes the focus, with the one credit. */
export const Ran: Story = {
  args: { load: files() },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Add Bitcoin' }));
    await userEvent.type(canvas.getByRole('textbox', { name: 'Bitcoin share (%)' }), '100');
    await userEvent.type(canvas.getByRole('textbox', { name: 'Monthly amount (EUR)' }), '100');
    await userEvent.click(canvas.getByRole('button', RUN));
    await expect(await canvas.findByRole('heading', { level: 2, name: 'Result' })).toHaveFocus();
    await expect(canvas.getAllByText(CREDIT)).toHaveLength(1);
  },
};

/** Filled from the stored plan and run: the Portfolio line stands under the result. */
export const FilledFromPlan: Story = {
  args: { load: files() },
  parameters: { snapshot: fixtureSnapshot() },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Fill in from your plan' }));
    await userEvent.click(canvas.getByRole('button', RUN));
    await expect(await canvas.findByText('Your own purchases and their value are on Portfolio.')).toBeVisible();
  },
};
