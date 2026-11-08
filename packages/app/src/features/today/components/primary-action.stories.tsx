import type { Action, CalendarDate, Money, MonthKey, Pause, Phase } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices, FIXTURE_PRICES } from '../../../lib/services/testing';
import { PrimaryAction } from './primary-action';

// The primary action over the fixture plan on 20 October 2026: due with its coin chips, late with the one
// tap, recorded, paused, and paused by a pause that has ended. The test projects of vitest.config.ts render each at 360 and 1280 px, light and dark, with axe.

const october = (status: Action['status']): Action => ({
  kind: 'dca',
  slot: '2026-10' as MonthKey,
  due: '2026-10-05' as CalendarDate,
  status,
  plannedAmount: '100' as Money,
  loggedAmount: (status === 'done' ? '100' : '0') as Money,
});
const buying = (pause: Pause | null = null): Phase => ({ kind: 'buy', openEnded: false, pause });

const meta = {
  title: 'Features/Today/PrimaryAction',
  component: PrimaryAction,
  parameters: {
    path: '/today',
    services: () => createTestServices({ snapshot: fixtureSnapshot(), nowMs: fixtureNowMs('buy') }),
  },
} satisfies Meta<typeof PrimaryAction>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Due: Story = {
  args: { action: october('due'), handled: null, phase: buying() },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('heading', { name: 'Today is the October\u00a02026 buy day' })).toBeVisible();
    await expect(canvas.getAllByRole('listitem')).toHaveLength(2);
  },
};

/** The tap records October and gives the focus to the heading, as the buttons leave once the month is recorded. */
export const Late: Story = {
  args: { action: october('late'), handled: null, phase: buying() },
  parameters: {
    services: () =>
      createTestServices({ snapshot: { ...fixtureSnapshot(), prices: FIXTURE_PRICES }, nowMs: fixtureNowMs('buy') }),
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('button', { name: 'Bought a different amount' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Bought as planned' }));
    await waitFor(() => expect(canvas.getByRole('heading', { name: 'October\u00a02026 is still open' })).toHaveFocus());
  },
};

export const Recorded: Story = {
  args: { action: null, handled: october('done'), phase: buying() },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('Next buy day: 5 Nov 2026.')).toBeVisible();
  },
};

export const Paused: Story = {
  args: {
    action: null,
    handled: october('paused'),
    phase: buying({ id: 'p', from: '2026-10-01', until: '2026-12-31', note: '' } as Pause),
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('heading', { name: 'Paused until 31\u00a0Dec\u00a02026' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Resume' })).toBeVisible();
    await expect(canvas.queryByRole('link', { name: 'Record a purchase' })).toBeNull();
  },
};

const WHY = 'Why? The hold phase';
const past = (kind: Phase['kind']): Phase => ({ kind, openEnded: false, pause: null });

/** The hold phase: "Why?" closes the line that says when the sell window opens. */
export const Hold: Story = {
  args: { action: null, handled: null, phase: past('hold') },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('heading', { name: 'In the hold phase' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: WHY })).toHaveTextContent('Why?');
  },
};

/** An open-ended plan has no such line, so "Why?" stands on its own at the 44 px target. */
export const OpenEndedHold: Story = {
  args: { action: null, handled: null, phase: past('done') },
  parameters: {
    services: () => {
      const fixture = fixtureSnapshot();
      const plan = fixture.plan && { ...fixture.plan, sellWindow: null };
      return createTestServices({ snapshot: { ...fixture, plan }, nowMs: fixtureNowMs('buy') });
    },
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('heading', { name: 'In the hold phase' })).toBeVisible();
    const { width, height } = canvas.getByRole('button', { name: WHY }).getBoundingClientRect();
    await expect(Math.min(width, height)).toBeGreaterThanOrEqual(44);
  },
};

export const PauseEnded: Story = {
  args: { action: null, handled: october('paused'), phase: buying() },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('heading', { name: 'October\u00a02026 is paused' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Record a purchase' })).toBeVisible();
  },
};
