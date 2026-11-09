import { countryRules, loadProfile } from '@proofofcalm/content';
import type { Instant } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import type { Snapshot } from '../../../lib/ports';
import { type FixturePhase, fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import {
  clearRedDay,
  createTestServices,
  FIXTURE_PRICES,
  pricesAt,
  recordingPlatform,
} from '../../../lib/services/testing';
import { TodayScreen } from './today-screen';

// Today over the fixture plan on 20 October 2026 (October's buy is late, so it leads) and on
// 15 March 2030 (in the sell window, the unlogged buys from October 2026 on still open: the phase leads,
// the open months are listed), priced at the story's own time; exported after the last change, so the
// durability line stands where the backup banner would, in a browser tab and in the installed app; with the
// rule-change notice dismissed from the foot; and before a plan exists. The
// test projects of vitest.config.ts render each at 360 and 1280 px, light and dark, with axe.

const portugal = async () => {
  const profile = await loadProfile('PT');
  return profile === null ? null : countryRules(profile);
};

const at = (phase: FixturePhase, lastBackupAt?: Instant, installed = false) => {
  const nowMs = fixtureNowMs(phase);
  const fixture = fixtureSnapshot();
  const prefs = lastBackupAt === undefined ? fixture.prefs : { ...fixture.prefs, lastBackupAt };
  const snapshot: Snapshot = { ...fixture, prefs, prices: pricesAt(FIXTURE_PRICES, nowMs) };
  const platform = recordingPlatform({ installed });
  // No episode under way: the foot settles on the next box once its red-day half has loaded.
  return { services: () => ({ ...createTestServices({ snapshot, nowMs, rules: portugal, platform }), redDay: clearRedDay() }) };
};

const meta = {
  title: 'Features/Today/TodayScreen',
  component: TodayScreen,
  parameters: { path: '/today' },
} satisfies Meta<typeof TodayScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Late: Story = {
  parameters: at('buy'),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('heading', { name: 'October\u00a02026 is still open' })).toBeVisible();
    await expect(canvas.getByRole('list', { name: 'Planned split' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Bought as planned' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Your plan' })).toBeVisible();
    // The foot waits for its red-day half, which loads on demand.
    await expect(await canvas.findByRole('link', { name: 'Export a copy.' })).toBeVisible();
  },
};

export const Exported: Story = {
  parameters: at('buy', '2026-10-01T10:00:00+01:00' as Instant),
  play: async ({ canvas }) => {
    const line = 'Your data lives only in this browser. Install the app or export a copy to keep it.';
    await expect(await canvas.findByText(line)).toBeVisible();
    await expect(canvas.queryByRole('status')).toBeNull();
  },
};

export const ExportedInstalled: Story = {
  parameters: at('buy', '2026-10-01T10:00:00+01:00' as Instant, true),
  play: async ({ canvas }) => {
    const line = 'Your data lives only on this device. Export a copy to keep it.';
    await expect(await canvas.findByText(line)).toBeVisible();
    await expect(canvas.queryByRole('status')).toBeNull();
  },
};

export const SellingWithOpenMonths: Story = {
  parameters: at('sell'),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('heading', { name: 'In the sell window' })).toBeVisible();
    const pending = canvas.getByRole('list', { name: 'Also open' });
    await expect(pending).toHaveTextContent(/October 2026: /u);
    await expect(pending).toHaveTextContent('March 2027: due 5 Mar 2027');
    // On a line of its own, not in a sentence: the 44 px target both ways (docs/DESIGN.md §6).
    const why = canvas.getByRole('button', { name: 'Why? The sell window' }).getBoundingClientRect();
    await expect(Math.min(why.width, why.height)).toBeGreaterThanOrEqual(44);
  },
};

/** The plan has seen no version of Portugal's rules, so the rule-change notice stands at the foot. */
const unseen = () => {
  const nowMs = fixtureNowMs('buy');
  const fixture = fixtureSnapshot();
  const plan = fixture.plan && { ...fixture.plan, countryRuleVersion: 0 };
  const snapshot: Snapshot = { ...fixture, plan, prices: pricesAt(FIXTURE_PRICES, nowMs) };
  return { services: () => createTestServices({ snapshot, nowMs, rules: portugal }) };
};

// Read at the foot, the notice's Dismiss by keyboard puts the focus on the action card's heading, which
// comes into view by the least scroll, however far above the window it was (docs/DESIGN.md §6).
export const RuleNoticeDismissed: Story = {
  parameters: unseen(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const dismiss = await canvas.findByRole('button', { name: 'Dismiss' });
    const view = canvasElement.ownerDocument.defaultView;
    view?.scrollTo(0, canvasElement.ownerDocument.documentElement.scrollHeight);
    dismiss.focus({ preventScroll: true });
    await userEvent.keyboard('{Enter}');
    const heading = canvas.getByRole('heading', { name: 'October 2026 is still open' });
    await waitFor(() => expect(heading).toHaveFocus());
    const { top, bottom } = heading.getBoundingClientRect();
    await expect(top).toBeGreaterThanOrEqual(0);
    await expect(bottom).toBeLessThanOrEqual(view?.innerHeight ?? 0);
  },
};

export const Empty: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('link', { name: 'Set up a plan' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'import a file' })).toBeVisible();
  },
};
