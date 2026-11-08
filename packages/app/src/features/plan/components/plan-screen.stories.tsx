import { countryRules, loadProfile } from '@proofofcalm/content';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import type { Snapshot } from '../../../lib/ports';
import { type FixturePhase, fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import { PlanScreen } from './plan-screen';

// The fixture plan (Portugal, 365 days) at its two dates, and the screen before a plan exists; the test
// projects of vitest.config.ts render each at 360 and 1280 px, light and dark, with axe.
const at = (phase: FixturePhase, snapshot: () => Snapshot = fixtureSnapshot) => ({
  path: '/plan',
  services: () =>
    createTestServices({
      snapshot: snapshot(),
      nowMs: fixtureNowMs(phase),
      rules: async () => {
        const profile = await loadProfile('PT');
        return profile === null ? null : countryRules(profile);
      },
    }),
});

const meta = {
  title: 'Features/Plan/PlanScreen',
  component: PlanScreen,
  parameters: { path: '/plan' },
} satisfies Meta<typeof PlanScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

/** No summary line or date runs past its column or the window, at 360 px too (docs/DESIGN.md §7). */
async function fitsTheWidth(root: HTMLElement) {
  for (const line of root.querySelectorAll<HTMLElement>('p, li')) {
    await expect(line.scrollWidth, line.textContent ?? '').toBeLessThanOrEqual(line.clientWidth);
    await expect(line.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth);
  }
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
}

export const Buying: Story = {
  parameters: at('buy'),
  play: async ({ canvas, canvasElement }) => {
    await waitFor(() => expect(canvas.getByText(/invested so far/)).toBeVisible());
    await expect(canvas.queryByText(/sellable now/)).toBeNull();
    await fitsTheWidth(canvasElement);
  },
};

export const Selling: Story = {
  parameters: at('sell'),
  play: async ({ canvas, canvasElement }) => {
    await waitFor(() => expect(canvas.getAllByText(/sellable now/)).toHaveLength(2));
    await expect(canvas.getByText(/ invested \(/)).toBeVisible();
    await expect(canvas.queryByText(/Buys left/)).toBeNull();
    await expect(canvas.getByRole('button', { name: 'Why? The sell window' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Why? The three parts' })).toBeVisible();
    await fitsTheWidth(canvasElement);
  },
};

/** An extra buy dated 15 Mar 2026, before the first buy day: the totals leave it out and the next line says so. */
export const ExtraBuyBeforeFirstBuy: Story = {
  parameters: at('buy', () => {
    const snapshot = fixtureSnapshot();
    const extra = snapshot.entries.find((entry) => entry.kind === 'extra');
    if (extra === undefined) return snapshot;
    const id = '00000000-0000-4000-8000-000000000991' as typeof extra.id;
    return { ...snapshot, entries: [...snapshot.entries, { ...extra, id, date: '2026-03-15' as typeof extra.date }] };
  }),
  play: async ({ canvas, canvasElement }) => {
    const totals = await waitFor(() => canvas.getByText(/invested so far/));
    const line = canvas.getByText(
      /^1 extra buy dated before the first buy day, .+, is not in the amount invested above\./,
    );
    await expect(line).toBeVisible();
    await expect(totals.nextElementSibling).toBe(line);
    await fitsTheWidth(canvasElement);
  },
};

export const NoPlan: Story = {};
