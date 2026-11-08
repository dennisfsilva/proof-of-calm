import type { CalendarDate, Plan } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect } from 'storybook/test';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { earlyOpenOf, type SellWindowValue, sellWindowOf } from '../lib/sell-window';
import { SellWindowEditor } from './sell-window-editor';

// The sell-window editor held as a host holds it, with the issues of sellWindowOf: the fixture's window, no
// window, dates out of order, and a window that opens before the last buy passes the rule, not yet accepted;
// the test projects render each at 360 and 1280 px, light and dark, with axe.

const plan = fixtureSnapshot().plan as Plan;
const day = (text: string) => text as CalendarDate;
const fixture: SellWindowValue = {
  mode: 'dates',
  opens: day('2029-09-01'),
  closes: day('2030-08-31'),
  exitBy: day('2030-12-31'),
  acceptEarly: false,
};

function Host({ initial }: { initial: SellWindowValue }) {
  const [value, setValue] = useState(initial);
  const result = sellWindowOf(plan, value);
  const early = earlyOpenOf(plan, value);
  return (
    <SellWindowEditor
      value={value}
      issues={result.ok ? [] : result.error}
      early={early && { ...early, rule: 'own' }}
      onChange={setValue}
    />
  );
}

const meta = {
  title: 'Features/Plan/SellWindowEditor',
  component: Host,
  args: { initial: fixture },
} satisfies Meta<typeof Host>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Window: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('group', { name: 'Sell window' })).toBeVisible();
    await expect(canvas.getByLabelText('Out by')).toHaveValue('2030-12-31');
  },
};

export const NoWindow: Story = {
  args: { initial: { mode: 'none', opens: '', closes: '', exitBy: '', acceptEarly: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('radio', { name: 'No sell window' })).toHaveAttribute('aria-checked', 'true');
  },
};

export const OutOfOrder: Story = {
  args: { initial: { ...fixture, closes: day('2029-08-31') } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Choose a closing date on or after the opening date.')).toBeVisible();
  },
};

export const OpensEarly: Story = {
  args: { initial: { ...fixture, opens: day('2028-01-01') } },
  play: async ({ canvas, userEvent }) => {
    const box = canvas.getByRole('checkbox', {
      name: 'Open the sell window on 1\u00a0Jan\u00a02028, before your last buy passes the holding rule',
    });
    await expect(box).toHaveAttribute('aria-invalid', 'true');
    await userEvent.click(box);
    await expect(box).toHaveAttribute('aria-checked', 'true');
  },
};
