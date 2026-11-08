import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { AppShell } from './app-shell';
import { ScreenError } from './screen-error';

// The screen area's error state inside the shell (ADR-0045 §9): a screen whose chunk could not be loaded
// keeps the header and the tab bar, with the heading, its line and Reload, at 360 and 1280 px, light and
// dark, with axe. The test services' platform records the reload instead of loading the page again.

const meta = {
  title: 'Features/Shell/ScreenError',
  component: AppShell,
  parameters: { path: '/portfolio' },
  args: { children: <ScreenError /> },
} satisfies Meta<typeof AppShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ChunkFailed: Story = {
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('heading', { level: 1, name: 'This screen could not be loaded.' }),
    ).toBeVisible();
    await expect(canvas.getByText('Check your connection, then reload the page.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Reload' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Portfolio' })).toHaveAttribute('aria-current', 'page');
  },
};
