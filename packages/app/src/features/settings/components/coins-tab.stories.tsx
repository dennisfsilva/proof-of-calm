import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { CoinsTab } from './coins-tab';

// Settings' Coins & split tab over the fixture plan, a split off 100 refused with the focus on the first
// share, and the empty state; the test projects of vitest.config.ts render each at 360 and 1280 px, light
// and dark, with axe.
const withPlan = { path: '/settings', snapshot: fixtureSnapshot(), nowMs: fixtureNowMs('buy') };

const meta = {
  title: 'Features/Settings/CoinsTab',
  component: CoinsTab,
  parameters: { path: '/settings' },
} satisfies Meta<typeof CoinsTab>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithPlan: Story = {
  parameters: withPlan,
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByLabelText('Bitcoin share (%)')).toHaveValue('70'));
    await expect(canvas.getByLabelText('Ethereum share (%)')).toHaveValue('30');
    await expect(canvas.getByRole('button', { name: 'Add Solana' })).toBeVisible();
  },
};

export const SplitOff100: Story = {
  parameters: withPlan,
  play: async ({ canvas }) => {
    const ethereum = await canvas.findByLabelText('Ethereum share (%)');
    await userEvent.clear(ethereum);
    await userEvent.type(ethereum, '20');
    await userEvent.click(canvas.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(canvas.getByLabelText('Bitcoin share (%)')).toHaveFocus());
    await expect(canvas.getByText('Make the shares add up to 100 %.')).toBeVisible();
  },
};

export const NoPlan: Story = {
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByText('No plan yet')).toBeVisible());
  },
};
