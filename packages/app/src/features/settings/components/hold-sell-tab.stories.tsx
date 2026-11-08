import { countryRules, loadProfile } from '@proofofcalm/content';
import type { Plan } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import type { Snapshot } from '../../../lib/ports';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import { HoldSellTab } from './hold-sell-tab';

// Settings' Hold & sell tab over the fixture plan with Portugal's rules loaded: Portugal's rule chosen,
// an own rule and the country's that each open the sell window early, awaiting the acceptance (the refusal line
// only after a refused save), and the empty state; the
// test projects of vitest.config.ts render each at 360 and 1280 px, light and dark, with axe.

const portugal = async () => {
  const profile = await loadProfile('PT');
  return profile === null ? null : countryRules(profile);
};
const nowMs = fixtureNowMs('buy');
const fixture = fixtureSnapshot();
const own: Snapshot = {
  ...fixture,
  plan: { ...(fixture.plan as Plan), holdingRule: { kind: 'days', days: 730, effect: 'lower-rate' } },
};
const early: Snapshot = {
  ...fixture,
  plan: {
    ...(fixture.plan as Plan),
    holdingRule: { kind: 'days', days: 30, effect: 'exempt' },
    sellWindow: { opens: '2027-06-01', closes: '2028-05-31', exitBy: '2028-12-31' } as Plan['sellWindow'],
  },
};
const at = (snapshot: Snapshot) => ({
  path: '/settings',
  services: () => createTestServices({ snapshot, nowMs, rules: portugal }),
});

const meta = {
  title: 'Features/Settings/HoldSellTab',
  component: HoldSellTab,
  parameters: { path: '/settings' },
} satisfies Meta<typeof HoldSellTab>;

export default meta;

type Story = StoryObj<typeof meta>;

export const CountryRule: Story = {
  parameters: at(fixture),
  play: async ({ canvas }) => {
    const country = await canvas.findByRole('radio', { name: "Portugal's rule" });
    await expect(country).toHaveAttribute('aria-checked', 'true');
    // The rule in words shows with its source, once the profile is loaded.
    await canvas.findByRole('link', { name: 'Sources' });
    await expect(country).toHaveAccessibleDescription(/365 days, then tax-free/);
    await expect(canvas.getByRole('button', { name: 'Save changes' })).toBeVisible();
  },
};

export const EarlyWindowAwaitsAcceptance: Story = {
  parameters: at(own),
  play: async ({ canvas }) => {
    const days = await canvas.findByLabelText('Days');
    await expect(days).toHaveValue('730');
    await userEvent.clear(days);
    await userEvent.type(days, '1100');
    const box = canvas.getByRole('checkbox', {
      name: 'Open the sell window on 1\u00a0Sept\u00a02029, before your last buy passes the holding rule',
    });
    const notice =
      'The sell window opens on 1\u00a0Sept\u00a02029. Your last buy is at the long-term rate from 9\u00a0Mar\u00a02030 under your own rule. ' +
      'You can also choose a later opening date.';
    const refusal = 'Tick the box to open the sell window early, or choose a later opening date.';
    // Before any save the box awaits the acceptance: described by the notice alone, not marked, no refusal line.
    await expect(box).toHaveAccessibleDescription(notice);
    await expect(box).not.toHaveAttribute('aria-invalid');
    await expect(canvas.queryByText(refusal)).toBeNull();
    // A save without the tick refuses: the focus on the box, marked, and described by the refusal line too.
    await userEvent.click(canvas.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(box).toHaveFocus());
    await expect(box).toHaveAttribute('aria-invalid', 'true');
    await expect(canvas.getByRole('alert')).toHaveTextContent(refusal);
    await expect(box).toHaveAccessibleDescription(`${notice} ${refusal}`);
  },
};

export const CountryRuleOpensEarly: Story = {
  parameters: at(early),
  play: async ({ canvas }) => {
    const country = await canvas.findByRole('radio', { name: "Portugal's rule" });
    await userEvent.click(country);
    await userEvent.click(canvas.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(canvas.getByRole('checkbox')).toHaveFocus());
    await expect(canvas.getByRole('radiogroup', { name: 'Holding rule' })).not.toHaveAttribute('aria-invalid');
  },
};

export const NoPlan: Story = {
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByText('No plan yet')).toBeVisible());
  },
};
