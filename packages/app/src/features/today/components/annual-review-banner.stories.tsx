import type { CalendarDate } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { AnnualReviewBanner } from './annual-review-banner';

// The annual review at Today's foot, counted from the plan's creation and from the last review. The test projects of
// vitest.config.ts render each at 360 and 1280 px, light and dark, with axe.

const QUESTION = 'Is it still right? Have the rules changed?';

const meta = {
  title: 'Features/Today/AnnualReviewBanner',
  component: AnnualReviewBanner,
  parameters: { path: '/today', snapshot: fixtureSnapshot(), nowMs: fixtureNowMs('buy') },
  args: { since: { kind: 'created', on: '2026-04-05' as CalendarDate }, onLater: fn() },
} satisfies Meta<typeof AnnualReviewBanner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const FirstReview: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText(`You set up this plan on 5 Apr 2026. ${QUESTION}`)).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Review the plan' })).toHaveAttribute('href', '/plan/review');
    await userEvent.click(canvas.getByRole('button', { name: 'Later' }));
    await expect(args.onLater).toHaveBeenCalledOnce();
  },
};

export const AfterAReview: Story = {
  args: { since: { kind: 'reviewed', on: '2027-11-11' as CalendarDate } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(`You last reviewed this plan on 11 Nov 2027. ${QUESTION}`)).toBeVisible();
    await expect(canvas.getByRole('status')).toBeVisible();
  },
};
