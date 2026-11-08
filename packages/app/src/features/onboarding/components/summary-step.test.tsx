// @vitest-environment jsdom
import type { Coin, Money, Plan } from '@proofofcalm/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFormatters } from '../../../lib/format';
import { I18nProvider } from '../../../lib/i18n';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import errors from '../../../messages/en/errors.json';
import onboarding from '../../../messages/en/onboarding.json';
import plan from '../../../messages/en/plan.json';
import shell from '../../../messages/en/shell.json';
import type { HoldingCountry } from '../../plan';
import { SummaryStep, type SummaryStepProps } from './summary-step';

afterEach(cleanup);

const START = 'Accept and start the plan';

function fixturePlan(): Plan {
  const { plan } = fixtureSnapshot();
  if (plan === null) throw new Error('No fixture plan');
  return plan;
}
const PORTUGAL: HoldingCountry = {
  code: 'PT',
  name: 'Portugal',
  rule: { kind: 'days', days: 365, effect: 'exempt' },
  reviewed: '16\u00a0Oct\u00a02026',
  source: 'https://example.org/portugal',
};
const GERMANY: HoldingCountry = {
  code: 'DE',
  name: 'Germany',
  rule: { kind: 'years', years: 1, effect: 'exempt' },
  reviewed: '16\u00a0Oct\u00a02026',
  source: 'https://example.org/germany',
};
const GENERIC: HoldingCountry = {
  code: 'XX',
  name: 'Other country',
  rule: { kind: 'none' },
  reviewed: '17\u00a0Oct\u00a02026',
  source: null,
  unreviewed: { status: 'Not reviewed.', text: 'No holding exemption is applied.' },
};
const words = (text: string) => text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;

function mount(props: Partial<SummaryStepProps> = {}) {
  const handlers = { onBack: vi.fn(), onStart: vi.fn() };
  render(
    <I18nProvider messages={{ errors, onboarding, plan, shell }}>
      <SummaryStep
        plan={fixturePlan()}
        holding={PORTUGAL}
        templateName="Cycle plan"
        reminder="calendar"
        format={createFormatters('en-GB', 'en-GB')}
        {...handlers}
        {...props}
      />
    </I18nProvider>,
  );
  return handlers;
}

/** The value beside a row's term. */
const value = (term: string) => screen.getByText(term, { selector: 'dt' }).nextElementSibling;
const row = (term: string) => value(term)?.textContent;

describe('SummaryStep', () => {
  it('keeps each coin on the line of its share', () => {
    const base = fixturePlan();
    const link = { id: 'LINK', name: 'Chainlink', geckoId: 'chainlink', decimals: 4 } as Coin;
    const split = { BTC: '70', ETH: '15', LINK: '15' } as Plan['split'];
    mount({ plan: { ...base, coins: [...base.coins, link], split } });
    expect(row('Coins & split')).toBe('BTC\u00a070%, ETH\u00a015%, LINK\u00a015%');
  });

  it('lists every choice of the plan, then the disclosure once and Start', async () => {
    const plan = { ...fixturePlan(), why: 'I buy on the 1st.' };
    const { onStart } = mount({ plan });
    expect(screen.getByRole('heading', { level: 2, name: 'Check your plan' }).getAttribute('tabindex')).toBe('-1');
    expect(row('Country')).toBe('Portugal');
    expect(row('Starting point')).toBe('Cycle plan');
    expect(row('Coins & split')).toMatch(/^BTC\u00a070\s?%, ETH\u00a030\s?%$/);
    expect([row('Monthly amount'), row('Starting amount')]).toEqual(['€100.00', '€1,000.00']);
    expect([row('First buy'), row('Buy day'), row('Last buy')]).toEqual([
      '5\u00a0Apr\u00a02026',
      'Day 5 of each month',
      '5\u00a0Mar\u00a02027',
    ]);
    expect(row('Sell window')).toBe('1\u00a0Sept\u00a02029 to 31\u00a0Aug\u00a02030');
    expect(row('Your sentence')).toBe('I buy on the 1st.');
    expect(row('Reminder')).toBe('Calendar file saved');
    // No holding-status date: the summary repeats the person's choices, nothing computed from the rule.
    expect(screen.queryByText(/Tax-free from|Long-term rate from/)).toBeNull();

    const links = screen.getAllByRole('link', { name: 'Risk disclosure' });
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('href')).toBe('/risk');
    const text = (links[0]?.parentElement?.textContent ?? '').replace('Risk disclosure', '');
    expect(words(text)).toBeGreaterThanOrEqual(40);
    expect(words(text)).toBeLessThanOrEqual(50);
    await act(() => fireEvent.click(screen.getByRole('button', { name: START })));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('leaves out what the plan does not have: no window, no sentence, no starting amount; no reminder and your own coins', () => {
    mount({
      plan: { ...fixturePlan(), sellWindow: null, why: '', startingAmount: '0' as Money },
      templateName: null,
      reminder: 'later',
    });
    expect(screen.queryByText('Sell window')).toBeNull();
    expect(screen.queryByText('Your sentence')).toBeNull();
    expect(screen.queryByText('Starting amount')).toBeNull();
    expect(row('Starting point')).toBe('Your own coins');
    expect(row('Reminder')).toBe('No reminder set');
  });

  it('gives tabular figures to the numbers and dates only; the words keep proportional figures', () => {
    mount({ plan: { ...fixturePlan(), why: 'I buy on the 1st.' } });
    const tabular = (term: string) => value(term)?.classList.contains('nums');
    expect(
      ['Coins & split', 'Monthly amount', 'Starting amount', 'First buy', 'Buy day', 'Last buy', 'Sell window'].map(
        tabular,
      ),
    ).toEqual([true, true, true, true, true, true, true]);
    expect(['Country', 'Holding rule', 'Starting point', 'Your sentence', 'Reminder'].map(tabular)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("names the country's rule in words after Country, with its date line and Sources", () => {
    mount({ plan: { ...fixturePlan(), holdingRule: GERMANY.rule }, holding: GERMANY });
    expect(row('Country')).toBe('Germany');
    const terms = [...document.querySelectorAll('dt')].map((term) => term.textContent);
    expect(terms.indexOf('Holding rule')).toBe(terms.indexOf('Country') + 1);
    const rule = value('Holding rule');
    expect(rule?.textContent).toBe(
      "Germany's rule. 1 year, then tax-free.Reviewed on 16\u00a0Oct\u00a02026 · general information, not advice · Sources",
    );
    expect(screen.getByText("Germany's rule. 1 year, then tax-free.")).toBeDefined();
    expect(screen.getByRole('link', { name: 'Sources' }).getAttribute('href')).toBe(GERMANY.source);
    expect(screen.queryByText(/Tax-free from|Long-term rate from/)).toBeNull();
  });

  it("names the general profile's rule with its own text and the generic date line, without Sources", () => {
    mount({ plan: { ...fixturePlan(), holdingRule: { kind: 'none' } }, holding: GENERIC });
    expect(screen.getByText("The general profile's rule. No holding exemption is applied.")).toBeDefined();
    expect(
      screen.getByText(
        'Reviewed on 17 Oct 2026: the general profile, not a rule for your country · general information, not advice',
      ),
    ).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Sources' })).toBeNull();
    expect(screen.queryByText(/Tax-free from|Long-term rate from/)).toBeNull();
  });

  it('says an early sell window was accepted', () => {
    const window = fixturePlan().sellWindow;
    if (window === null) throw new Error('No fixture window');
    mount({ plan: { ...fixturePlan(), sellWindow: { ...window, acceptedEarlyOpen: true } } });
    expect(row('Sell window')).toBe(
      '1\u00a0Sept\u00a02029 to 31\u00a0Aug\u00a02030, opening before the last buy passes the holding rule, as you accepted',
    );
  });

  it('disables Start while the plan is being written', () => {
    mount({ pending: true });
    expect(screen.getByRole('button', { name: START }).getAttribute('aria-disabled')).toBe('true');
  });
});
