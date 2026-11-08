import { countryRules, loadProfile } from '@proofofcalm/content';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import { HoldingConditions } from './holding-conditions';

// The fixture plan (Portugal, 365 days) with the profile's four conditions, and with its first alone.

const FIRST = /the counterparty is tax-resident/i;
const MORE = 'Show 3 more conditions';

const portugal = (keep?: number) => ({
  services: () =>
    createTestServices({
      snapshot: fixtureSnapshot(),
      nowMs: fixtureNowMs('buy'),
      rules: async () => {
        const profile = await loadProfile('PT');
        if (profile === null) return null;
        const rules = countryRules(profile);
        return { ...rules, holdingRuleConditions: rules.holdingRuleConditions.slice(0, keep) };
      },
    }),
});

const meta = {
  title: 'Features/Learn/HoldingConditions',
  component: HoldingConditions,
  decorators: [
    (Story) => (
      <div className="p-gutter">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HoldingConditions>;

export default meta;

type Story = StoryObj<typeof meta>;

export const MoreBehindTheButton: Story = {
  parameters: portugal(),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(FIRST)).toBeVisible();
    await expect(canvas.queryByRole('list')).toBeNull();
    await expect(canvas.getByRole('link', { name: 'Sources' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: MORE }));
    await expect(await canvas.findByRole('list')).toBeVisible();
    await expect(canvas.getAllByRole('listitem')).toHaveLength(3);
  },
};

export const OneCondition: Story = {
  parameters: portugal(1),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(FIRST)).toBeVisible();
    await expect(canvas.queryByRole('button')).toBeNull();
  },
};
