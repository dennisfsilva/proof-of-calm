import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent } from 'storybook/test';
import { createFormatters, createNumberInput } from '../../../lib/format';
import { type HoldingCountry, type HoldingValue, holdingRuleOf } from '../lib/holding';
import { HoldingRuleEditor } from './holding-rule-editor';

// The holding rule editor held as a host holds it, with the issues of holdingRuleOf in en-GB: Portugal's
// rule chosen, titled by the country, with its date line and source, an own rule of 730 days at the long-term rate, a count that is
// not whole, no country's rules loaded, and a profile with no reviewed rule; the test projects render each at
// 360 and 1280 px, light and dark, with axe.

const english = createNumberInput('en-GB');
const format = createFormatters('en-GB', 'en-GB');
const portugal: HoldingCountry = {
  code: 'PT',
  name: 'Portugal',
  rule: { kind: 'days', days: 365, effect: 'exempt' },
  reviewed: '16 Oct 2026',
  source: 'https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs10.aspx',
};
const COUNTRY: HoldingValue = { source: 'country', kind: 'days', count: '365', effect: 'exempt' };

function Host({ initial, country }: { initial: HoldingValue; country: HoldingCountry | null }) {
  const [value, setValue] = useState(initial);
  const result = holdingRuleOf(value, country?.rule ?? null, english);
  return (
    <HoldingRuleEditor
      value={value}
      issues={result.ok ? [] : result.error}
      country={country}
      onChange={setValue}
      format={format}
    />
  );
}

const meta = {
  title: 'Features/Plan/HoldingRuleEditor',
  component: Host,
  args: { initial: COUNTRY, country: portugal },
} satisfies Meta<typeof Host>;

export default meta;

type Story = StoryObj<typeof meta>;

export const CountryRule: Story = {
  play: async ({ canvas }) => {
    const country = canvas.getByRole('radio', { name: "Portugal's rule" });
    await expect(country).toHaveAttribute('aria-checked', 'true');
    await expect(country).toHaveAccessibleDescription(/365 days, then tax-free/);
    await expect(canvas.getByRole('link', { name: 'Sources' })).toHaveAttribute('target', '_blank');
    await userEvent.click(canvas.getByRole('radio', { name: 'Your own rule' }));
    await expect(canvas.getByLabelText('Days')).toHaveValue('365');
  },
};

export const OwnRule: Story = {
  args: { initial: { source: 'own', kind: 'days', count: '730', effect: 'lower-rate' } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('combobox', { name: 'After the period' })).toHaveTextContent('Long-term rate');
    for (const target of [...canvas.getAllByRole('radio'), ...canvas.getAllByRole('combobox')]) {
      await expect(target.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
  },
};

export const CountNotWhole: Story = {
  args: { initial: { source: 'own', kind: 'days', count: '1.5', effect: 'exempt' } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Enter a whole number of days.')).toBeVisible();
    await expect(canvas.getByLabelText('Days')).toHaveAttribute('aria-invalid', 'true');
  },
};

export const CountryNotLoaded: Story = {
  args: { initial: { ...COUNTRY, source: 'own' }, country: null },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('radio', { name: "Your country's rule" })).toHaveAttribute('data-disabled');
  },
};

// A stand-in for the generic profile's status and holding-rule text (packages/content/jurisdictions/xx.json).
export const NoReviewedRule: Story = {
  args: {
    initial: { source: 'country', kind: 'none', count: '', effect: 'exempt' },
    country: {
      code: 'XX',
      name: 'Other country',
      rule: { kind: 'none' },
      reviewed: '17 Oct 2026',
      source: null,
      unreviewed: {
        status: 'Not reviewed: no reviewed rule set for your country.',
        text: 'No holding exemption is applied.',
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('radio', { name: "The general profile's rule" })).toHaveAccessibleDescription(
      /^XX Not reviewed: .* Reviewed on 17 Oct 2026: the general profile, not a rule for your country · general information, not advice$/,
    );
    await expect(canvas.queryByRole('link', { name: 'Sources' })).toBeNull();
  },
};
