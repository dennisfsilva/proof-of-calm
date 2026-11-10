import { countryRules, loadProfile } from '@proofofcalm/content';
import type { CountryCode, Plan } from '@proofofcalm/core';
import { FIXTURE_RULES } from '@proofofcalm/core/testing/country-change';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, waitFor } from 'storybook/test';
import type { Snapshot } from '../../../lib/ports';
import type { Services } from '../../../lib/services';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import { CountrySection } from './country-section';

// Currency & data's country change over the fixture plan (Portugal): the select at rest, the change to Germany
// listed with each holding rule in its own row and the day the last buy passes each, the currency question of a
// move to the United Kingdom with amounts logged, the line that offers the country's currency, a window the new
// rule opens early, and the plan's rule not loaded; the test projects of vitest.config.ts render each at 360 and
// 1280 px, light and dark, with axe.

const rules = async (code: CountryCode) => (code in FIXTURE_RULES ? FIXTURE_RULES[code as 'PT' | 'DE' | 'XX'] : null);
// The United Kingdom's rules from its profile, for the currency question (GBP against the plan's EUR).
const withUk = async (code: CountryCode) => {
  if (code !== 'GB') return rules(code);
  const profile = await loadProfile(code);
  return profile === null ? null : countryRules(profile);
};
const nowMs = fixtureNowMs('buy');
const fixture = fixtureSnapshot();
const early: Snapshot = {
  ...fixture,
  plan: {
    ...(fixture.plan as Plan),
    sellWindow: { opens: '2028-03-05', closes: '2028-08-31', exitBy: '2028-12-31' } as Plan['sellWindow'],
  },
};
const at = (snapshot: Snapshot, load: Services['rules'] = rules) => ({
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

// ADR-0053: the fixture's entries hold amounts in EUR, so the move asks which currency they were paid in.
export const ToUnitedKingdom: Story = {
  parameters: at(fixture, withUk),
  play: async ({ canvas }) => {
    await choose(canvas, 'United Kingdom');
    await expect(canvas.getByRole('radiogroup')).toBeVisible();
    for (const box of canvas.getAllByRole('checkbox')) await userEvent.click(box);
    await userEvent.click(canvas.getByRole('button', { name: 'Change country to United Kingdom' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Choose Keep EUR or Change to GBP.');
    await userEvent.click(canvas.getByRole('radio', { name: /^Change to GBP/ }));
    // The row lands under the cards, the amount after in the new country's format (ADR-0023's Context).
    const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(100);
    const row = canvas.getByText(/^Monthly amount: .+ becomes .+\. Check it in Plan\.$/);
    await expect(row).toBeVisible();
    await expect(row).toHaveTextContent(`becomes ${gbp}.`);
    const line = canvas.getByText(/^A plan holds one currency\./);
    await expect(line.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await expect(canvas.getByText(/^Tax-year files follow your current country's rules/)).toBeVisible();
  },
};

// A plan kept in EUR after a move to the United Kingdom: the line offers GBP, so a wrong "Keep" is fixed here.
export const PlanInAnotherCurrency: Story = {
  parameters: at({ ...fixture, plan: { ...(fixture.plan as Plan), country: 'GB' as Plan['country'] } }, withUk),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('button', { name: 'Change to GBP' })).toBeVisible();
    await expect(canvas.getByText(/^Your plan is in EUR, and your country's currency is GBP\./)).toBeVisible();
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
