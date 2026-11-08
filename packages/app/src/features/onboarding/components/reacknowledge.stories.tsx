import type { Instant, Plan } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { Reacknowledge } from './reacknowledge';

// The re-ask at wording version 2, over a plan that recorded version 1 (docs/DOMAIN.md §2.1). No live build
// reaches the screen while the version is 1: this story is where it is seen.
const fixture = fixtureSnapshot();
const plan: Plan = {
  ...(fixture.plan as Plan),
  riskAcknowledgedAt: '2026-05-10T09:00:00.000Z' as Instant,
  riskWordingVersion: 1,
};

const meta = {
  title: 'Features/Onboarding/Reacknowledge',
  component: Reacknowledge,
  parameters: { path: '/today', snapshot: { ...fixture, plan } },
  args: { version: 2 },
} satisfies Meta<typeof Reacknowledge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Due: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'The risk text has changed' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Risk disclosure' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Accept and open Today' })).toBeVisible();
  },
};
