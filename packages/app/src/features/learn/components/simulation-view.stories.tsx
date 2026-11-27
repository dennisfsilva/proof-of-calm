import {
  addDays,
  type CalendarDate,
  type CoinId,
  type Money,
  type Percent,
  type Price,
  type PriceHistory,
  type SimulationInput,
  simulate,
  startDateSensitivity,
} from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import { buyDayFor, defaultWindow } from '../lib/simulator-dates';
import { SimulationView, type SimulationViewProps } from './simulation-view';

// The simulator's result over synthetic closes, not closes of any exchange (ADR-0036, Reading of 2026-11-27), run
// through the core's simulate with V2's default dates: three years with a fall that recovered, and five weeks, where
// 11 of the start-date table's 12 rows have no closes. The test projects of vitest.config.ts render each at 360 and
// 1280 px, light and dark, with axe.

const BTC = 'BTC' as CoinId;

/** Daily closes from `first` for `count` days, the close given by `close(index)`. */
const closes = (first: string, count: number, close: (index: number) => string): PriceHistory =>
  Array.from({ length: count }, (_, index) => [addDays(first as CalendarDate, index), close(index) as Price] as const);

function props(history: PriceHistory): SimulationViewProps {
  const window = defaultWindow([{ first: history[0]?.[0] as CalendarDate, last: history.at(-1)?.[0] as CalendarDate }]);
  if (window === null) throw new Error('no window');
  const input: SimulationInput = {
    split: { [BTC]: '100' as Percent },
    monthlyAmount: '100' as Money,
    startDate: window.start,
    endDate: window.end,
    buyDay: buyDayFor(window.start),
    histories: { currency: 'EUR', coins: { [BTC]: history } },
  };
  const simulation = simulate(input);
  if (!simulation.ok) throw new Error(simulation.error.code);
  return {
    simulation: simulation.value,
    sensitivity: startDateSensitivity(input),
    currency: 'EUR',
    closesFrom: window.first,
    feePercent: '0' as Percent,
  };
}

// A rise, a fall to half, and a recovery past the old high, over three years.
const WAVE = closes('2024-01-01', 1096, (index) =>
  String(Math.round(index < 500 ? 100 + index / 5 : index < 700 ? 200 - (index - 500) / 2 : 100 + (index - 700) / 3)),
);
const WEEKS = closes('2026-11-26', 36, (index) => String(100 + (index % 5)));

const CAVEAT =
  'Past prices are facts; a simulation of them is not a forecast. Taxes, fees, slippage and your own behaviour are not in this chart.';

const meta = {
  title: 'Features/Learn/SimulationView',
  component: SimulationView,
  decorators: [
    (Story) => (
      <div className="mx-auto flex w-full max-w-reading flex-col gap-stack-lg px-gutter py-stack-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SimulationView>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Three years with a fall that recovered; the start-date table opens on one tap. */
export const Years: Story = {
  args: props(WAVE),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('img', { name: /^Simulated value and money invested, / })).toBeVisible();
    await expect(canvas.getByText(CAVEAT)).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Risk disclosure' })).toHaveAttribute('href', '/risk');
    // A figure's term, value and line stand apart by a stack token (docs/DESIGN.md §6), not flush.
    const figure = canvas.getByText('Maximum drawdown', { selector: 'dt' }).parentElement as HTMLElement;
    await expect(Number(getComputedStyle(figure).rowGap.replace(/px$/, ''))).toBeGreaterThan(0);
    await userEvent.click(canvas.getByText('Show the plan from 12 start dates as a table'));
    await expect(canvas.getAllByRole('table').at(-1)?.querySelectorAll('tbody tr')).toHaveLength(12);
  },
};

/** Five weeks of closes: the line above the table counts the rows with none. */
export const Weeks: Story = {
  args: props(WEEKS),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByText('Show the plan from 12 start dates as a table'));
    await expect(canvas.getByText(/so 11 of its 12 rows have none\.$/)).toBeVisible();
  },
};
