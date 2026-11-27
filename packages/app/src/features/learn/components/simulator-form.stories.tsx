import type { CalendarDate, CoinId, Plan } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { defaultWindow } from '../lib/simulator-dates';
import { SimulatorForm, type SimulatorFormProps } from './simulator-form';

// The simulator's form over synthetic closes' dates, not those of any exchange (ADR-0036, Reading of 2026-11-27). The
// test projects of vitest.config.ts render each at 360 and 1280 px, light and dark, with axe.

const RANGE = { first: '2023-01-01' as CalendarDate, last: '2026-11-26' as CalendarDate };

function props(closes: SimulatorFormProps['closes']): SimulatorFormProps {
  return {
    closes,
    window: defaultWindow([RANGE]),
    plan: fixtureSnapshot().plan as Plan,
    onCoins: fn(),
    onRun: fn(),
    onEdit: fn(),
  };
}

const meta = {
  title: 'Features/Learn/SimulatorForm',
  component: SimulatorForm,
  decorators: [
    (Story) => (
      <div className="mx-auto flex w-full max-w-reading flex-col gap-stack-lg px-gutter py-stack-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SimulatorForm>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The form as it opens: no coin chosen; a run is refused on the split and focuses its first Add button. */
export const Empty: Story = {
  args: props({}),
  play: async ({ canvas, args }) => {
    await expect(canvas.getByText('€100.00 a month on day 5: BTC 70%, ETH 30%.')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Run the simulation' }));
    await expect(args.onRun).not.toHaveBeenCalled();
    await expect(canvas.getByRole('button', { name: 'Add Aave' })).toHaveFocus();
  },
};

/** Filled from the plan with Ethereum's closes not yet published: its row carries the line and takes the focus. */
export const NoCloses: Story = {
  args: props({ ['BTC' as CoinId]: RANGE, ['ETH' as CoinId]: 'none' }),
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Fill in from your plan' }));
    await expect(
      canvas.getByText('No reference closes for Ethereum yet. Set its share to 0 to simulate the other coins.'),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Run the simulation' }));
    await expect(args.onRun).not.toHaveBeenCalled();
    await expect(canvas.getByRole('textbox', { name: 'Ethereum share (%)' })).toHaveFocus();
  },
};

/** Filled from the plan while Ethereum's closes still load: its row says so, and a run is refused there. */
export const Loading: Story = {
  args: props({ ['BTC' as CoinId]: RANGE }),
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Fill in from your plan' }));
    await expect(canvas.getByText('The reference closes for Ethereum are still loading.')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Run the simulation' }));
    await expect(args.onRun).not.toHaveBeenCalled();
    await expect(canvas.getByRole('textbox', { name: 'Ethereum share (%)' })).toHaveFocus();
  },
};

/** Filled from the plan with every coin's closes: the run hands its inputs over. */
export const Filled: Story = {
  args: props({ ['BTC' as CoinId]: RANGE, ['ETH' as CoinId]: RANGE }),
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Fill in from your plan' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Run the simulation' }));
    await expect(args.onRun).toHaveBeenCalledOnce();
  },
};
