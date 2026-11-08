import type { CalendarDate } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { DatesStep } from './dates-step';

// The custom path's amounts and dates: a filled schedule ending on Continue, and a last buy before the
// first refused by Continue.

const meta = {
  title: 'Features/Onboarding/DatesStep',
  component: DatesStep,
  args: {
    value: {
      monthlyAmount: '100',
      startingAmount: '',
      firstBuy: '2026-10-20' as CalendarDate,
      buyDay: 20,
      lastBuy: '2036-10-01' as CalendarDate,
      acceptEarly: false,
    },
    issues: [],
    currency: 'EUR',
    onChange: fn(),
    onBack: fn(),
    onContinue: fn(),
  },
} satisfies Meta<typeof DatesStep>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Filled: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Continue' })).toBeVisible();
  },
};

export const Refused: Story = {
  args: {
    value: { ...meta.args.value, lastBuy: '2026-01-01' as CalendarDate },
    issues: [{ code: 'last-buy-before-first-buy', path: ['lastBuy'] }],
  },
};
