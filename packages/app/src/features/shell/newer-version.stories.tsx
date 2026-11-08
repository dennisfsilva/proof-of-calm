import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { EMPTY_SNAPSHOT } from '../../lib/adapters';
import { AppShell } from './app-shell';

// Rows a newer build wrote, inside the shell (ADR-0019 readings): a newer plan takes the screen area with
// the heading, its line and Reload; newer entries alone add one line above Today. At 360 and 1280 px,
// light and dark, with axe. The test services' platform records the reload instead of loading the page.

const meta = {
  title: 'Features/Shell/NewerVersion',
  component: AppShell,
  parameters: { path: '/today' },
  args: { children: <h1>Today</h1> },
} satisfies Meta<typeof AppShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const NewerPlan: Story = {
  parameters: { snapshot: { ...EMPTY_SNAPSHOT, newer: { plans: 1, entries: 0 } } },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('heading', {
        level: 1,
        name: 'Your plan was saved by a newer version of Proof of Calm.',
      }),
    ).toBeVisible();
    await expect(
      canvas.getByText(
        'If this screen comes back after the reload, your plan stays on this device, unread; a newer version of Proof of Calm can open it.',
      ),
    ).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Reload' })).toBeVisible();
    await expect(canvas.queryByRole('heading', { name: 'Today' })).toBeNull();
  },
};

export const NewerEntries: Story = {
  parameters: { snapshot: { ...EMPTY_SNAPSHOT, newer: { plans: 0, entries: 2 } } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expect(
      canvas.getByText(
        '2 entries were saved by a newer version of Proof of Calm, so they are not shown here. Reload the page to see them.',
      ),
    ).toBeVisible();
  },
};
