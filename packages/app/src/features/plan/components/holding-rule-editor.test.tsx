// @vitest-environment jsdom
import type { HoldingRule } from '@proofofcalm/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { userEvent } from 'storybook/test';
import { afterEach, describe, expect, it } from 'vitest';
import { createFormatters, createNumberInput } from '../../../lib/format';
import { I18nProvider } from '../../../lib/i18n';
import errors from '../../../messages/en/errors.json';
import plan from '../../../messages/en/plan.json';
import shell from '../../../messages/en/shell.json';
import { type HoldingCountry, type HoldingValue, holdingRuleOf } from '../lib/holding';
import { HoldingRuleEditor } from './holding-rule-editor';

// The holding rule editor as a host holds it: the value in state, the issues from holdingRuleOf in en-GB.
// The country's rule is a choice card with its words and its review date; the own rule's fields show only
// while it is chosen, and each message sits under the field it concerns.

afterEach(cleanup);

const english = createNumberInput('en-GB');
const format = createFormatters('en-GB', 'en-GB');
const portugal: HoldingCountry = {
  code: 'PT',
  name: 'Portugal',
  rule: { kind: 'days', days: 365, effect: 'exempt' },
  reviewed: '16 Oct 2026',
  source: 'https://example.org/holding-rule',
};
const COUNTRY: HoldingValue = { source: 'country', kind: 'days', count: '365', effect: 'exempt' };

function Host({
  initial,
  country,
  seen,
}: {
  initial: HoldingValue;
  country: HoldingCountry | null;
  seen: HoldingValue[];
}) {
  const [value, setValue] = useState(initial);
  const rule: HoldingRule | null = country?.rule ?? null;
  const result = holdingRuleOf(value, rule, english);
  const change = (next: HoldingValue) => {
    setValue(next);
    seen.push(next);
  };
  return (
    <HoldingRuleEditor
      value={value}
      issues={result.ok ? [] : result.error}
      country={country}
      onChange={change}
      format={format}
    />
  );
}

function mount(initial: HoldingValue = COUNTRY, country: HoldingCountry | null = portugal) {
  const seen: HoldingValue[] = [];
  render(
    <I18nProvider messages={{ plan, errors, shell }}>
      <Host initial={initial} country={country} seen={seen} />
    </I18nProvider>,
  );
  return seen;
}

const radio = (name: string) => screen.getByRole('radio', { name });

describe('HoldingRuleEditor', () => {
  it("shows the country's rule in words with its review date, chosen", () => {
    mount();
    expect(screen.getByRole('group', { name: 'Holding rule' })).toBeDefined();
    const country = radio("Portugal's rule");
    expect(country.getAttribute('aria-checked')).toBe('true');
    expect(country.textContent).toContain('365 days, then tax-free.');
    const sources = screen.getByRole('link', { name: 'Sources' });
    expect(sources.parentElement?.textContent).toBe(
      'Reviewed on 16 Oct 2026 · general information, not advice · Sources',
    );
    expect(sources.getAttribute('href')).toBe('https://example.org/holding-rule');
    expect(sources.getAttribute('target')).toBe('_blank');
    expect(sources.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.queryByLabelText('Days')).toBeNull();
  });

  it('keeps the arrow keys on the Sources link from changing the choice', async () => {
    const seen = mount();
    const user = userEvent.setup({ document });
    const country = radio("Portugal's rule");
    const sources = screen.getByRole('link', { name: 'Sources' });
    country.focus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(sources);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(sources);
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(sources);
    expect(seen).toEqual([]);
    expect(country.getAttribute('aria-checked')).toBe('true');
    expect(radio('Your own rule').getAttribute('aria-checked')).toBe('false');
  });

  it("describes the country's card with its rule and its date line", () => {
    mount();
    const described = (radio("Portugal's rule").getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent);
    expect(described).toEqual([
      'PT',
      '365 days, then tax-free.',
      'Reviewed on 16 Oct 2026 · general information, not advice · Sources',
    ]);
  });

  it('holds back the rule in words and ends the date line after "not advice" until the source is known', () => {
    mount(COUNTRY, { ...portugal, source: null });
    expect(screen.queryByRole('link', { name: 'Sources' })).toBeNull();
    expect(screen.getByText('Reviewed on 16 Oct 2026 · general information, not advice')).toBeDefined();
    expect(radio("Portugal's rule").textContent).toBe("PTPortugal's rule");
  });

  it('shows the status and the holding text of a profile with no reviewed rule, with no source', () => {
    mount(
      { source: 'country', kind: 'none', count: '', effect: 'exempt' },
      {
        code: 'XX',
        name: 'Other country',
        rule: { kind: 'none' },
        reviewed: '17 Oct 2026',
        source: null,
        unreviewed: { status: 'Not reviewed: no reviewed rule set.', text: 'No holding exemption is applied.' },
      },
    );
    const country = radio("The general profile's rule");
    expect(country.textContent).toContain('Not reviewed: no reviewed rule set. No holding exemption is applied.');
    expect(country.textContent).not.toContain('No holding rule.');
    expect(screen.queryByRole('link', { name: 'Sources' })).toBeNull();
    expect(
      screen.getByText(
        'Reviewed on 17 Oct 2026: the general profile, not a rule for your country · general information, not advice',
      ),
    ).toBeDefined();
  });

  it('shows no rule in words while that text of a profile with no reviewed rule loads', () => {
    mount(
      { source: 'country', kind: 'none', count: '', effect: 'exempt' },
      {
        code: 'XX',
        name: 'Other country',
        rule: { kind: 'none' },
        reviewed: '17 Oct 2026',
        source: null,
        unreviewed: { status: null, text: null },
      },
    );
    expect(radio("The general profile's rule").textContent).toBe("XXThe general profile's rule");
  });

  it('shows the own rule from the plan and changes its count', () => {
    const seen = mount({ source: 'own', kind: 'days', count: '730', effect: 'lower-rate' });
    expect(radio('Your own rule').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('combobox', { name: 'Rule' }).textContent).toContain('A number of days');
    expect(screen.getByRole('combobox', { name: 'After the period' }).textContent).toContain('Long-term rate');
    fireEvent.change(screen.getByLabelText('Days'), { target: { value: '1.5' } });
    expect(seen.at(-1)).toEqual({ source: 'own', kind: 'days', count: '1.5', effect: 'lower-rate' });
    expect(screen.getByText('Enter a whole number of days.')).toBeDefined();
    expect(screen.getByLabelText('Days').getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(screen.getByLabelText('Days'), { target: { value: '40000' } });
    expect(screen.getByText('Enter from 1 to 36,500 days.')).toBeDefined();
  });

  it("starts the own rule from the country's and hides the count for no rule", async () => {
    const seen = mount();
    const user = userEvent.setup({ document });
    await user.click(radio('Your own rule'));
    expect(seen.at(-1)).toEqual({ ...COUNTRY, source: 'own' });
    expect(screen.getByLabelText<HTMLInputElement>('Days').value).toBe('365');
    await user.click(screen.getByRole('combobox', { name: 'Rule' }));
    await user.click(await screen.findByRole('option', { name: 'No holding rule' }));
    expect(seen.at(-1)).toEqual({ ...COUNTRY, source: 'own', kind: 'none' });
    expect(screen.queryByLabelText('Days')).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'After the period' })).toBeNull();
  });

  it("offers no country's rule while the country's rules are not loaded", () => {
    mount({ ...COUNTRY, source: 'own' }, null);
    expect(radio("Your country's rule").hasAttribute('data-disabled')).toBe(true);
  });

  it("marks the group and its chosen card refused while the chosen country's rule is not known", () => {
    mount(COUNTRY, null);
    expect(screen.getByRole('radiogroup').getAttribute('aria-invalid')).toBe('true');
    expect(radio("Your country's rule").hasAttribute('data-invalid')).toBe(true);
  });
});
