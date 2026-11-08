import type { CalendarDate, Plan } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect } from 'storybook/test';
import { createNumberInput } from '../../../lib/format';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { type ScheduleValue, schedule } from '../lib/schedule';
import { earlyOpen } from '../lib/sell-window';
import { ScheduleEditor } from './schedule-editor';

// The amount-and-dates editor held as a host holds it, with the issues of schedule in en-GB: the
// fixture's amounts and dates, no amount with a last buy before the first, a plan over 20 years, and a last
// buy that opens the fixture's sell window early, not yet accepted; the test projects render each at 360 and 1280 px, light and dark, with axe.

const plan = fixtureSnapshot().plan as Plan;
const english = createNumberInput('en-GB');
const day = (text: string) => text as CalendarDate;
const fixture: ScheduleValue = {
  monthlyAmount: '100.00',
  startingAmount: '1,000.00',
  firstBuy: plan.firstBuy,
  buyDay: plan.buyDay,
  lastBuy: plan.lastBuy,
  acceptEarly: false,
};

function Host({ initial }: { initial: ScheduleValue }) {
  const [value, setValue] = useState(initial);
  const result = schedule(plan, value, english);
  const { lastBuy } = value;
  const early = lastBuy === '' ? null : earlyOpen({ ...plan, lastBuy }, plan.sellWindow);
  return (
    <ScheduleEditor
      value={value}
      issues={result.ok ? [] : result.error}
      currency={plan.payCurrency}
      early={early && { ...early, rule: 'country' }}
      onChange={setValue}
    />
  );
}

const meta = {
  title: 'Features/Plan/ScheduleEditor',
  component: Host,
  args: { initial: fixture },
} satisfies Meta<typeof Host>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Schedule: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('group', { name: 'Amounts and dates' })).toBeVisible();
    await expect(canvas.getByRole('combobox', { name: 'Buy day' })).toHaveTextContent('5');
  },
};

export const NoAmountAndDatesOutOfOrder: Story = {
  args: { initial: { ...fixture, monthlyAmount: '0', startingAmount: '', lastBuy: day('2026-03-05') } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Choose a last buy on or after the first buy.')).toBeVisible();
  },
};

export const PlanTooLong: Story = {
  args: { initial: { ...fixture, lastBuy: day('2046-04-05') } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('A plan holds at most 240 monthly buys. Choose an earlier last buy.')).toBeVisible();
    await expect(canvas.getByLabelText('Last buy')).toHaveAttribute('aria-invalid', 'true');
  },
};

export const WindowOpensEarly: Story = {
  args: { initial: { ...fixture, lastBuy: day('2030-01-05') } },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        'The sell window opens on 1 Sept 2029. This last buy is tax-free from 5 Jan 2031 under your ' +
          "plan's holding rule. You can also choose an earlier last buy.",
      ),
    ).toBeVisible();
    await expect(canvas.getByRole('checkbox')).toHaveAttribute('aria-invalid', 'true');
  },
};
