// @vitest-environment jsdom
import type { CalendarDate, Coin, KeptCurrencyQuestion, Money, Plan } from '@proofofcalm/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFormatters } from '../../../lib/format';
import { I18nProvider } from '../../../lib/i18n';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import countries from '../../../messages/en/countries.json';
import errors from '../../../messages/en/errors.json';
import onboarding from '../../../messages/en/onboarding.json';
import plan from '../../../messages/en/plan.json';
import shell from '../../../messages/en/shell.json';
import countriesPt from '../../../messages/pt-PT/countries.json';
import errosPt from '../../../messages/pt-PT/errors.json';
import onboardingPt from '../../../messages/pt-PT/onboarding.json';
import planoPt from '../../../messages/pt-PT/plan.json';
import shellPt from '../../../messages/pt-PT/shell.json';
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
  unreviewed: { status: 'Not reviewed.', text: 'Proof of Calm applies no holding exemption for your country.' },
};
const words = (text: string) => text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;

function mount(props: Partial<SummaryStepProps> = {}) {
  const handlers = { onBack: vi.fn(), onStart: vi.fn() };
  render(
    <I18nProvider messages={{ countries, errors, onboarding, plan, shell }}>
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
      'The rule for Germany. 1 year, then tax-free.Reviewed on 16\u00a0Oct\u00a02026 · general information, not advice · Sources',
    );
    expect(screen.getByText('The rule for Germany. 1 year, then tax-free.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Sources' }).getAttribute('href')).toBe(GERMANY.source);
    expect(screen.queryByText(/Tax-free from|Long-term rate from/)).toBeNull();
  });

  it("names the general profile's rule with its own text and the generic date line, without Sources", () => {
    mount({ plan: { ...fixturePlan(), holdingRule: { kind: 'none' } }, holding: GENERIC });
    expect(value('Holding rule')?.textContent).toMatch(
      /^The general profile's rule\. Proof of Calm applies no holding exemption for your country\./,
    );
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

describe('SummaryStep on a pt-PT screen: content text keeps its own language (ADR-0057, WCAG 2.2 SC 3.1.2)', () => {
  function mountPt(props: Partial<SummaryStepProps> = {}) {
    render(
      <I18nProvider
        locale="pt-PT"
        messages={{ countries: countriesPt, errors: errosPt, onboarding: onboardingPt, plan: planoPt, shell: shellPt }}
      >
        <SummaryStep
          plan={fixturePlan()}
          holding={{ ...PORTUGAL, language: 'pt-PT' }}
          templateName="Plano de ciclo"
          templateLanguage="pt-PT"
          reminder="calendar"
          format={createFormatters('pt-PT', 'pt-PT')}
          onBack={vi.fn()}
          onStart={vi.fn()}
          {...props}
        />
      </I18nProvider>,
    );
  }
  /** The `lang` the text is read in: the nearest marked element's, or null for the page's. */
  const langOf = (text: string) => screen.getByText(text).closest('[lang]')?.getAttribute('lang') ?? null;

  it("marks the template's name lang=en when its texts came back English", () => {
    mountPt({ templateName: 'Cycle plan', templateLanguage: 'en' });
    expect(langOf('Cycle plan')).toBe('en');
  });

  it("marks no lang on a translated template's name, nor on the own-coins title", () => {
    mountPt();
    expect(langOf('Plano de ciclo')).toBeNull();
    cleanup();
    mountPt({ templateName: null, templateLanguage: undefined });
    expect(langOf(onboardingPt.template.custom.title)).toBeNull();
  });

  it("marks the country's name with its rules' language", () => {
    mountPt({ plan: { ...fixturePlan(), holdingRule: GERMANY.rule }, holding: { ...GERMANY, language: 'en' } });
    expect(langOf('Germany')).toBe('en');
    cleanup();
    mountPt();
    expect(langOf('Portugal')).toBeNull();
  });

  it("marks the general profile's English text, not the sentence around it", () => {
    const unreviewed = {
      status: null,
      text: 'Proof of Calm applies no holding exemption for your country.',
      language: 'en',
    } as const;
    mountPt({ plan: { ...fixturePlan(), holdingRule: { kind: 'none' } }, holding: { ...GENERIC, unreviewed } });
    expect(langOf('Proof of Calm applies no holding exemption for your country.')).toBe('en');
    expect(value(onboardingPt.summary.holdingRule)?.textContent).toMatch(
      /^A regra do perfil geral\. Proof of Calm applies no holding exemption for your country\./,
    );
    cleanup();
    mountPt({
      plan: { ...fixturePlan(), holdingRule: { kind: 'none' } },
      holding: { ...GENERIC, unreviewed: { ...unreviewed, text: 'Não se aplica isenção.', language: 'pt-PT' } },
    });
    expect(langOf('Não se aplica isenção.')).toBeNull();
  });
});

// Entries kept with no plan beside a plan in GBP (ADR-0053 Readings, 2026-11-26): the summary asks what they were paid in.
describe('SummaryStep with saved entries', () => {
  const inGbp = (): Plan => ({ ...fixturePlan(), payCurrency: 'GBP', displayCurrency: 'GBP' });
  const asked = (question: Partial<KeptCurrencyQuestion> = {}): KeptCurrencyQuestion => ({
    kept: 'EUR',
    next: 'GBP',
    count: 14,
    first: '2026-01-05' as CalendarDate,
    last: '2026-10-05' as CalendarDate,
    ...question,
  });
  const legend = () =>
    document.getElementById(screen.getByRole('radiogroup').getAttribute('aria-labelledby') ?? '')?.textContent;
  const cards = () => screen.getAllByRole('radio').map((card) => card.textContent);

  it('asks with the kept currency first and nothing chosen', () => {
    mount({ plan: inGbp(), question: asked(), savedEntries: 14 });
    expect(legend()).toBe(
      '14 saved entries, from 5 Jan 2026 to 5 Oct 2026, hold amounts or fees. Which currency were they paid in?',
    );
    expect(screen.getByText('They were saved with a plan that could not be read. That plan was in EUR.')).toBeTruthy();
    expect(cards()).toEqual([
      'Paid in EURThe plan is set up in EUR instead of GBP, and they show in EUR, as typed.',
      'Paid in GBPThe plan is set up in GBP, and they show in GBP, as typed.',
    ]);
    expect(screen.getAllByRole('radio').map((card) => card.getAttribute('aria-checked'))).toEqual(['false', 'false']);
    expect(
      screen.getByText('A plan holds one currency, and its entries show in it. Nothing is converted.'),
    ).toBeTruthy();
    expect(row('Monthly amount')).toBe('£100.00');
  });

  it('refuses Start with no answer: the alert under the group, the focus on its radio', async () => {
    const { onStart } = mount({ plan: inGbp(), question: asked(), savedEntries: 14 });
    await act(() => fireEvent.click(screen.getByRole('button', { name: START })));
    expect(onStart).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('Choose the currency they were paid in.');
    expect(screen.getByRole('radiogroup').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: /^Paid in EUR/ }));
  });

  it('shows the plan in the answered currency and starts with it', async () => {
    const { onStart } = mount({ plan: inGbp(), question: asked(), savedEntries: 14 });
    await act(() => fireEvent.click(screen.getByRole('radio', { name: /^Paid in EUR/ })));
    expect([row('Monthly amount'), row('Starting amount')]).toEqual(['€100.00', '€1,000.00']);
    await act(() => fireEvent.click(screen.getByRole('button', { name: START })));
    expect(onStart).toHaveBeenCalledWith('EUR');
  });

  it('says "on" for entries saved on one day, and one entry in the singular', () => {
    const day = '2026-10-20' as CalendarDate;
    mount({ plan: inGbp(), question: asked({ count: 2, first: day, last: day }), savedEntries: 2 });
    expect(legend()).toBe('2 saved entries, on 20 Oct 2026, hold amounts or fees. Which currency were they paid in?');
    cleanup();
    mount({ plan: inGbp(), question: asked({ count: 1, first: day, last: day }), savedEntries: 1 });
    expect(legend()).toBe('1 saved entry, on 20 Oct 2026, holds an amount or a fee. Which currency was it paid in?');
    expect(cards()[0]).toBe(
      'Paid in EURThe plan is set up in EUR instead of GBP, and the entry shows in EUR, as typed.',
    );
  });

  it('offers the plan’s currency first, then the rest, when the kept one could not be read', () => {
    mount({ plan: inGbp(), question: asked({ kept: null }), savedEntries: 14 });
    expect(screen.getByText('The currency of the plan they were saved with could not be read.')).toBeTruthy();
    expect(cards().map((card) => card?.slice(0, 11))).toEqual([
      'Paid in GBP',
      'Paid in EUR',
      'Paid in USD',
      'Paid in CHF',
    ]);
  });

  it('says the saved entries stay when nothing is asked', async () => {
    const { onStart } = mount({ question: null, savedEntries: 14 });
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getByText('14 entries saved on this device stay and show in this plan.')).toBeTruthy();
    // DESIGN §5: the line stands alone, so it is body text at 16 px, not a 14 px description.
    expect(screen.getByText('14 entries saved on this device stay and show in this plan.').className).toBe(
      'text-16 text-ink-2',
    );
    await act(() => fireEvent.click(screen.getByRole('button', { name: START })));
    expect(onStart).toHaveBeenCalledWith('EUR');
    cleanup();
    mount({ question: null, savedEntries: 1 });
    expect(screen.getByText('1 entry saved on this device stays and shows in this plan.')).toBeTruthy();
    cleanup();
    mount();
    expect(screen.queryByText(/saved on this device/)).toBeNull();
  });
});
