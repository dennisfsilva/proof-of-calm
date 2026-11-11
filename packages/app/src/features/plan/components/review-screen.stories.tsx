import { countryRules, loadProfile } from '@proofofcalm/content';
import type { Instant, Plan } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import type { Snapshot } from '../../../lib/ports';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import { ReviewScreen } from './review-screen';

// The review page over the fixture plan (Portugal, set up on 5 Apr 2026) on 20 Oct 2026 unless named; the test
// projects of vitest.config.ts render each at 360 and 1280 px, light and dark, with axe.
const at = (snapshot: () => Snapshot, nowMs = fixtureNowMs('buy'), code = 'PT') => ({
  path: '/plan/review',
  services: () =>
    createTestServices({
      snapshot: snapshot(),
      nowMs,
      rules: async () => {
        const profile = await loadProfile(code);
        return profile === null ? null : countryRules(profile);
      },
    }),
});

const withPlan =
  (changes: Partial<Plan>, prefs: Partial<Snapshot['prefs']> = {}) =>
  (): Snapshot => {
    const snapshot = fixtureSnapshot();
    return { ...snapshot, plan: { ...(snapshot.plan as Plan), ...changes }, prefs: { ...snapshot.prefs, ...prefs } };
  };

const meta = {
  title: 'Features/Plan/ReviewScreen',
  component: ReviewScreen,
  parameters: { path: '/plan/review' },
} satisfies Meta<typeof ReviewScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Every link and the button meet the 44 px target (docs/DESIGN.md §5). */
async function targets(root: HTMLElement) {
  for (const control of root.querySelectorAll<HTMLElement>('a, button')) {
    await expect(control.getBoundingClientRect().height, control.textContent ?? '').toBeGreaterThanOrEqual(44);
  }
}

export const SetUp: Story = {
  parameters: at(withPlan({ why: 'Buy every month for a year, then hold.' })),
  play: async ({ canvas, canvasElement }) => {
    await waitFor(() => expect(canvas.getByText("Your plan's country: Portugal.")).toBeVisible());
    await expect(canvas.getByText('You set up this plan on 5 Apr 2026.')).toBeVisible();
    await expect(canvas.getByText('In your words: Buy every month for a year, then hold.')).toBeVisible();
    await targets(canvasElement);
  },
};

export const Reviewed: Story = {
  parameters: at(
    withPlan({}, { reviewedAt: '2027-11-11T09:00:00.000Z' as Instant }),
    Date.parse('2028-01-10T10:00:00Z'),
  ),
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByText('You last reviewed this plan on 11 Nov 2027.')).toBeVisible());
  },
};

export const RuleChange: Story = {
  parameters: at(withPlan({ countryRuleVersion: 1 })),
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByText(/^5 Nov 2026: /)).toBeVisible());
  },
};

export const UnderReview: Story = {
  parameters: at(withPlan({}), Date.parse('2028-11-03T10:00:00Z')),
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByText(/^Not reviewed since 5 Nov 2026/)).toBeVisible());
  },
};

export const GeneralProfile: Story = {
  parameters: at(withPlan({ country: 'XX' as Plan['country'] }), fixtureNowMs('buy'), 'XX'),
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByRole('link', { name: 'See the countries' })).toBeVisible());
    await expect(canvas.getByText(/the general profile, not a rule for your country/)).toBeVisible();
  },
};

export const NoPlan: Story = {
  parameters: at(() => ({ ...fixtureSnapshot(), plan: null, entries: [] })),
};
