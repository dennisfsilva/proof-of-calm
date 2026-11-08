import type { CalendarDate, CountryCode } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { RuleChangeBanner } from './rule-change-banner';

// The notice at Today's foot, with the profile's sentence, the generic one and the generic profile's. The
// test projects of vitest.config.ts render each at 360 and 1280 px, light and dark, with axe.

const notice = {
  country: 'PT' as CountryCode,
  version: 2,
  changedOn: '2026-10-16' as CalendarDate,
  changeNotice: null,
};

const meta = {
  title: 'Features/Today/RuleChangeBanner',
  component: RuleChangeBanner,
  parameters: { path: '/today', snapshot: fixtureSnapshot(), nowMs: fixtureNowMs('buy') },
  args: { notice, country: 'Portugal' },
} satisfies Meta<typeof RuleChangeBanner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Generic: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText('16 Oct 2026: the rules for Portugal changed. Review your plan.')).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Review' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Dismiss' })).toBeVisible();
  },
};

export const GenericProfile: Story = {
  args: { notice: { ...notice, country: 'XX' as CountryCode }, country: 'Other country' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('16 Oct 2026: the general profile changed. Review your plan.')).toBeVisible();
  },
};

export const ProfileSentence: Story = {
  args: { notice: { ...notice, changeNotice: 'Portugal updated its rule for 2027. Review your plan.' } },
  play: async ({ canvas }) => {
    const sentence = '16 Oct 2026: Portugal updated its rule for 2027. Review your plan.';
    await expect(canvas.getByText(sentence)).toBeVisible();
    await expect(canvas.getByRole('status')).toBeVisible();
  },
};
