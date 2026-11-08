import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { useBoot } from '../../../lib/services';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { SettingsScreen } from './settings-screen';

// The Settings screen's four tabs: on Plan with the fixture plan, then Currency & data; on Currency & data
// without a plan; and About below the tabs, with the site line and the legal pages. The test projects of
// vitest.config.ts render each at 360 and 1280 px, light and dark, with axe. The screen mounts once the
// services are ready, as the shell's first-boot gate mounts it.
function WhenReady({ children }: { children: ReactNode }) {
  return useBoot() === 'ready' ? children : null;
}
const whenReady: Decorator = (Story) => (
  <WhenReady>
    <Story />
  </WhenReady>
);

const meta = {
  title: 'Features/Settings/SettingsScreen',
  component: SettingsScreen,
  decorators: [whenReady],
  parameters: { path: '/settings' },
} satisfies Meta<typeof SettingsScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithPlan: Story = {
  parameters: { path: '/settings', snapshot: fixtureSnapshot(), nowMs: fixtureNowMs('buy') },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByRole('tab', { name: 'Plan' })).toHaveAttribute('aria-selected', 'true'));
    await expect(canvas.getByRole('group', { name: 'Amounts and dates' })).toBeVisible();
    await userEvent.click(canvas.getByRole('tab', { name: 'Currency & data' }));
    await expect(await canvas.findByRole('heading', { level: 2, name: 'Your data' })).toBeVisible();
  },
};

export const NoPlan: Story = {
  play: async ({ canvas }) => {
    await waitFor(() =>
      expect(canvas.getByRole('tab', { name: 'Currency & data' })).toHaveAttribute('aria-selected', 'true'),
    );
    await expect(canvas.getByRole('heading', { level: 2, name: 'Your data' })).toBeVisible();
    // The Plan tab's empty state leads back here: "import a file" opens Currency & data.
    await userEvent.click(canvas.getByRole('tab', { name: 'Plan' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'import a file' }));
    await expect(canvas.getByRole('tab', { name: 'Currency & data' })).toHaveFocus();
    await expect(await canvas.findByRole('heading', { level: 2, name: 'Your data' })).toBeVisible();
  },
};

export const About: Story = {
  parameters: { path: '/settings', snapshot: fixtureSnapshot(), nowMs: fixtureNowMs('buy') },
  play: async ({ canvas }) => {
    const about = await canvas.findByRole('region', { name: 'About' });
    await expect(about).toHaveTextContent('Data and tools, not advice. Crypto-assets can lose all their value.');
    const links = within(about).getAllByRole('link');
    await expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/risk',
      '/terms',
      '/privacy',
      '/cookies',
      '/contact',
    ]);
    await expect(within(about).getByRole('link', { name: 'Risk disclosure' })).toBeVisible();
  },
};
