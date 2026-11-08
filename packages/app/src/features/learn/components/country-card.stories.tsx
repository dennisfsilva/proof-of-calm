import type { CalendarDate } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { countryCardModel } from '../../../lib/services';
import { TEST_TODAY } from '../../../lib/services/testing';
import { GENERIC, GERMANY, PORTUGAL, SHAPES } from '../fixtures/profiles';
import { CountryCard } from './country-card';

// The card of each shipped profile, one under review, and the four shapes the next countries take (issues 268
// and 269), derived from Portugal's: each renders from the same fields, so those countries need files, not code.
// Each story's model is the profile as the countries port derives it at the test clock's today.

const SOURCES = /^Sources for /;
const model = (profile: Parameters<typeof countryCardModel>[0], today = TEST_TODAY) => countryCardModel(profile, today);

const meta = {
  title: 'Features/Learn/CountryCard',
  component: CountryCard,
  args: { country: model(PORTUGAL), level: 1 },
  decorators: [
    (Story) => (
      <div className="p-gutter">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CountryCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Portugal: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Portugal' })).toBeVisible();
    await expect(canvas.getByText(PORTUGAL.card.summary60)).toBeVisible();
    const links = canvas.getAllByRole('link', { name: SOURCES });
    await expect(links).toHaveLength(5);
    // Each Sources link stands on a line of its own, so it takes the 44 px target (docs/DESIGN.md §6).
    for (const link of links) await expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    // The card ends with every source of the profile, each its title as a link that opens outside the app
    // (docs/JURISDICTIONS.md §2, docs/LEGAL.md §4); the list is never empty, since the schema wants one source.
    const foot = canvas.getByRole('heading', { level: 2, name: 'Sources for this card' });
    await expect(foot).toBeVisible();
    await expect(PORTUGAL.sources.length).toBeGreaterThan(0);
    const items = foot.parentElement?.querySelectorAll('li') ?? [];
    await expect(items).toHaveLength(PORTUGAL.sources.length);
    for (const source of PORTUGAL.sources) {
      const link = canvas.getByRole('link', { name: source.title });
      await expect(link).toHaveAttribute('href', source.url);
      await expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
    await expect(canvas.queryByRole('button')).toBeNull();
  },
};

export const Germany: Story = {
  args: { country: model(GERMANY) },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Germany' })).toBeVisible();
    await expect(canvas.getAllByRole('link', { name: SOURCES })).toHaveLength(5);
  },
};

export const Generic: Story = {
  args: { country: model(GENERIC) },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/the general profile, not a rule for your country/)).toBeVisible();
    await expect(canvas.queryByRole('link')).toBeNull();
  },
};

/** Portugal's nextReviewDue is 2027-11-02: from 2028-11-03 the card is under review. */
export const UnderReview: Story = {
  args: { country: model(PORTUGAL, '2028-11-03' as CalendarDate), level: 2 },
  parameters: { nowMs: Date.parse('2028-11-03T10:00:00Z') },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/^Not reviewed since /)).toBeVisible();
    await expect(canvas.getAllByRole('heading')).toHaveLength(1);
    await expect(canvas.queryByRole('link')).toBeNull();
  },
};

export const NoHoldingRule: Story = { name: 'Shape: none', args: { country: model(SHAPES.none) } };

export const LowerRate: Story = { name: 'Shape: lower-rate', args: { country: model(SHAPES['lower-rate']) } };

export const PortfolioWide: Story = {
  name: 'Shape: portfolio-wide',
  args: { country: model(SHAPES['portfolio-wide']) },
};

export const WealthSnapshot: Story = {
  name: 'Shape: wealth-snapshot',
  args: { country: model(SHAPES['wealth-snapshot']) },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('heading', { name: 'Allowances' })).toBeNull();
  },
};
