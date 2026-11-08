import type { CountryCode, Plan } from '@proofofcalm/core';
import { FIXTURE_RULES } from '@proofofcalm/core/testing/country-change';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, waitFor } from 'storybook/test';
import type { Snapshot } from '../../../lib/ports';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import { CountrySection } from './country-section';

// Currency & data's country change over the fixture plan (Portugal): the select at rest, the change to Germany
// listed with each holding rule in its own row and the day the last buy passes each, a window the new rule
// opens early, and the plan's rule not loaded; the test projects of vitest.config.ts render each at 360 and
// 1280 px, light and dark, with axe.

const rules = async (code: CountryCode) => (code in FIXTURE_RULES ? FIXTURE_RULES[code as 'PT' | 'DE' | 'XX'] : null);
const nowMs = fixtureNowMs('buy');
const fixture = fixtureSnapshot();
const early: Snapshot = {
  ...fixture,
  plan: {
    ...(fixture.plan as Plan),
    sellWindow: { opens: '2028-03-05', closes: '2028-08-31', exitBy: '2028-12-31' } as Plan['sellWindow'],
  },
};
const at = (snapshot: Snapshot, load = rules) => ({
  path: '/settings',
  services: () => createTestServices({ snapshot, nowMs, rules: load }),
});

const meta = {
  title: 'Features/Settings/CountrySection',
  component: CountrySection,
  parameters: { path: '/settings' },
} satisfies Meta<typeof CountrySection>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Picks a country and waits for the select to close: until its popup unmounts, Base UI's focus guards
 * are focusable while aria-hidden, and axe, which runs after the play function, fails on them.
 */
async function choose(canvas: { findByRole: typeof screen.findByRole }, name: string) {
  await userEvent.click(await canvas.findByRole('combobox', { name: 'Country' }));
  await userEvent.click(await screen.findByRole('option', { name }));
  await waitFor(() => expect(document.querySelector('[data-base-ui-focus-guard]')).toBeNull());
}

export const AtRest: Story = {
  parameters: at(fixture),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('combobox', { name: 'Country' })).toHaveTextContent('Portugal');
  },
};

export const ToGermany: Story = {
  parameters: at(fixture),
  play: async ({ canvas }) => {
    await choose(canvas, 'Germany');
    await expect(canvas.getByText('Country: Portugal to Germany')).toBeVisible();
    await expect(canvas.getByRole('checkbox', { name: "Replace Portugal's rule with Germany's rule" })).toBeVisible();
    await expect(canvas.getAllByRole('link', { name: 'Sources' })).toHaveLength(2);
    await expect(
      canvas.getByText('Last buy tax-free from 4 Mar 2028 now, from 6 Mar 2028 after the change'),
    ).toBeVisible();
    await expect(canvas.getAllByText('Computed from your dates, not tax advice')).toHaveLength(1);
    // Under the note, Germany's first condition and the other behind one control (docs/LEGAL.md §4).
    await expect(canvas.getByText(FIXTURE_RULES.DE.holdingRuleConditions[0] as string)).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Show 1 more condition' })).toBeVisible();
  },
};

export const ToOtherCountry: Story = {
  parameters: at(fixture),
  play: async ({ canvas }) => {
    await choose(canvas, 'Other country');
    await expect(canvas.getByText(/the general profile, not a rule for your country/)).toBeVisible();
  },
};

export const OpensEarly: Story = {
  parameters: at(early),
  play: async ({ canvas }) => {
    await choose(canvas, 'Germany');
    await expect(canvas.getByRole('checkbox', { name: /^Open the sell window on/ })).toBeVisible();
    await expect(
      canvas.getByText(/You can also cancel this change and choose a later opening date on Hold & sell\.$/),
    ).toBeVisible();
    // A change without the tick: the refusal sends the person to Hold & sell, where the opening date is.
    await userEvent.click(canvas.getByRole('checkbox', { name: "Replace Portugal's rule with Germany's rule" }));
    await userEvent.click(canvas.getByRole('button', { name: 'Change country to Germany' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Tick the box to open the sell window early, or cancel this change and choose a later opening date on Hold & sell.',
    );
  },
};

// The plan's country's rules did not load: no change is offered, as Hold & sell disables that card.
export const PlanCountryNotLoaded: Story = {
  parameters: at(fixture, async (code) => (code === 'PT' ? null : rules(code))),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        "Your country's rule is not loaded on this device. Reload the page when you are online to change the country.",
      ),
    ).toBeVisible();
    await expect(canvas.queryByRole('combobox', { name: 'Country' })).toBeNull();
  },
};
