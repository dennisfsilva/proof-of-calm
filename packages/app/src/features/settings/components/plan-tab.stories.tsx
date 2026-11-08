import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { PlanTab } from './plan-tab';

// Settings' Plan tab over the fixture plan, a refused save with the focus on the first invalid field, and
// the empty state; the test projects of vitest.config.ts render each at 360 and 1280 px, light and dark,
// with axe.
const withPlan = { path: '/settings', snapshot: fixtureSnapshot(), nowMs: fixtureNowMs('buy') };

const meta = {
  title: 'Features/Settings/PlanTab',
  component: PlanTab,
  parameters: { path: '/settings' },
} satisfies Meta<typeof PlanTab>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithPlan: Story = {
  parameters: withPlan,
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByLabelText('Monthly amount (EUR)')).toHaveValue('100.00'));
    await expect(canvas.getByLabelText('Starting amount (EUR)')).toHaveValue('1,000.00');
    await expect(canvas.getByRole('button', { name: 'Save changes' })).toBeVisible();
  },
};

export const Refused: Story = {
  parameters: withPlan,
  play: async ({ canvas }) => {
    const monthly = await canvas.findByLabelText('Monthly amount (EUR)');
    await userEvent.clear(monthly);
    await userEvent.type(monthly, '0');
    await userEvent.clear(canvas.getByLabelText('Starting amount (EUR)'));
    await userEvent.click(canvas.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(monthly).toHaveFocus());
    await expect(canvas.getByText('Enter a monthly amount, a starting amount, or both.')).toBeVisible();
  },
};

export const NoPlan: Story = {
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByText('No plan yet')).toBeVisible());
  },
};
