import { GENERIC_COUNTRY, loadProfiles } from '@proofofcalm/content';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Suspense } from 'react';
import { expect } from 'storybook/test';
import { GENERIC, PORTUGAL } from '../fixtures/profiles';
import { CountryList, CountryRoute } from './country-library';

// The country library's two screens in the page's measure, each suspending on the profiles as on the route;
// the test projects of vitest.config.ts render them at 360 and 1280 px, light and dark, with axe. The list's
// seed is the shipped profiles, read here as the screen reads them, so a new profile shows without an edit.

const PROFILES = await loadProfiles();
const NAMES = PROFILES.filter((profile) => profile.code !== GENERIC_COUNTRY)
  .map((profile) => profile.name)
  .sort((a, b) => a.localeCompare(b, 'en'));

const meta = {
  title: 'Features/Learn/CountryLibrary',
  component: CountryList,
  parameters: { path: '/learn/countries' },
  decorators: [
    (Story) => (
      <div className="mx-auto flex w-full max-w-reading flex-col gap-stack-lg px-gutter py-stack-lg">
        <Suspense>
          <Story />
        </Suspense>
      </div>
    ),
  ],
} satisfies Meta<typeof CountryList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const List: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('heading', { level: 1, name: 'Countries' })).toBeVisible();
    const rows = canvas.getAllByRole('listitem');
    await expect(rows.map((row) => row.querySelector('a')?.textContent)).toEqual(NAMES);
    await expect(canvas.queryByText(GENERIC.name)).toBeNull();
    for (const link of canvas.getAllByRole('link')) {
      await expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
  },
};

export const Portugal: Story = {
  parameters: { path: '/learn/countries/pt' },
  render: () => <CountryRoute code="pt" />,
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('heading', { level: 1, name: PORTUGAL.name })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Back to countries' })).toBeVisible();
    await expect(canvas.getByRole('heading', { level: 2, name: 'Sources for this card' })).toBeVisible();
  },
};
