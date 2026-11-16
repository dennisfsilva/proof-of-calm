import { COINS, type CountryProfile, loadProfile, templateById } from '@proofofcalm/content';
import {
  type CalendarDate,
  type Coin,
  type CoinId,
  EntityIdSchema,
  type Instant,
  writtenPlan,
} from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { RISK_WORDING_LANGUAGES, RISK_WORDING_VERSION } from '../../../lib/brand';
import { createNumberInput } from '../../../lib/format';
import type { SetupDraft } from './draft';
import {
  checkPlan,
  coinsIssues,
  draftPatchOf,
  emptyDraft,
  needsLastBuy,
  scheduleValueOf,
  startCustomPlan,
  startPlan,
} from './setup';

const today = '2026-10-20' as CalendarDate;
const now = '2026-10-20T10:00:00.000Z' as Instant;
const id = EntityIdSchema.parse('00000000-0000-4000-8000-000000000001');
const numberInput = createNumberInput('en-GB');
const language = 'en' as const;

async function profile(code: 'DE' | 'PT' | 'XX'): Promise<CountryProfile> {
  const loaded = await loadProfile(code);
  if (loaded === null) throw new Error(`No profile ${code}`);
  return loaded;
}

function template(templateId: string) {
  const found = templateById(templateId);
  if (found === null) throw new Error(`No template ${templateId}`);
  return found;
}

const draft = (overrides: Partial<SetupDraft>): SetupDraft => ({
  ...emptyDraft(today, id),
  monthly: '100',
  firstBuy: '2026-11-01',
  lastBuy: '2036-10-01',
  ...overrides,
});

async function start(code: 'DE' | 'PT' | 'XX', templateId: string, overrides: Partial<SetupDraft> = {}) {
  const context = { profile: await profile(code), template: template(templateId), numberInput, today, now, language };
  return startPlan(draft({ country: code, templateId, ...overrides }), context);
}

describe('startPlan (docs/DOMAIN.md §5)', () => {
  it('Portugal and two coins: the country rule, the profile currency, buy day 1', async () => {
    const result = await start('PT', 'two-coins');
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const plan = result.value;
    // The rule, its version and the currency are the profile's, which a content review may change
    // (docs/CONTENT-OPS.md §8): compared with the loaded profile, not written here.
    const portugal = await profile('PT');
    expect(plan.holdingRule).toEqual(portugal.holdingRule);
    expect([plan.country, plan.countryRuleVersion, plan.payCurrency, plan.displayCurrency]).toEqual([
      'PT',
      portugal.status.version,
      portugal.currency,
      portugal.currency,
    ]);
    expect([plan.buyDay, plan.monthlyAmount, plan.startingAmount, plan.why]).toEqual([1, '100', '0', '']);
    expect(plan.coins.map((coin) => coin.id)).toEqual(['BTC', 'ETH']);
    expect(plan.templateId).toBe('two-coins');
  });

  it("stores the draft's id and its sentence, trimmed; a new draft has no sentence and no reminder", async () => {
    const empty = emptyDraft(today, id, 'PT');
    expect([empty.id, empty.country, empty.why, empty.reminder]).toEqual([id, 'PT', '', null]);
    const result = await start('PT', 'two-coins', { why: '  I buy on the 1st.  ' });
    expect(result.ok && [result.value.id, result.value.why]).toEqual([id, 'I buy on the 1st.']);
    const own = (await custom({ why: ' Calm. ' })).result;
    expect(own.ok && [own.value.id, own.value.why]).toEqual([id, 'Calm.']);
  });

  it('checkPlan is the dry run of the path: the template or the custom plan, with the same refusals', async () => {
    const context = { profile: await profile('DE'), numberInput, today, now, language };
    const cycle = draft({ country: 'DE', templateId: 'cycle-plan' });
    expect(checkPlan(cycle, { ...context, template: template('cycle-plan') })).toEqual(
      startPlan(cycle, { ...context, template: template('cycle-plan') }),
    );
    const accepted = checkPlan({ ...cycle, acceptEarlyOpen: true }, { ...context, template: template('cycle-plan') });
    expect(accepted.ok && accepted.value.templateId).toBe('cycle-plan');
    const own = draft({ country: 'DE', path: 'custom', coins: coins('60', '40') });
    expect(checkPlan(own, { ...context, template: null })).toEqual(startCustomPlan(own, context));
  });

  it('records the acknowledgement of the disclosure: the start instant and its wording version', async () => {
    const result = await start('PT', 'two-coins');
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect([result.value.riskAcknowledgedAt, result.value.riskWordingVersion]).toEqual([now, RISK_WORDING_VERSION]);
    expect(result.value.riskLanguage).toBe('en');
    // An English acknowledgement stays the v3 plan the previous build reads (docs/DOMAIN.md §2.1).
    expect(writtenPlan(result.value).schemaVersion).toBe(3);
  });

  it('records en when the onboarding text shows English under another UI language', async () => {
    const context = { profile: await profile('PT'), template: template('two-coins'), numberInput, today, now };
    const typed = draft({ country: 'PT', templateId: 'two-coins' });
    // German has no approved disclosure text (RISK_WORDING_LANGUAGES), so onboarding shows the English one.
    expect(RISK_WORDING_LANGUAGES).not.toContain('de');
    const result = startPlan(typed, { ...context, language: 'de' });
    expect(result.ok && result.value.riskLanguage).toBe('en');
    expect(result.ok && writtenPlan(result.value).schemaVersion).toBe(3);
    const own = startCustomPlan(draft({ country: 'PT', path: 'custom', coins: coins('60', '40') }), {
      ...context,
      language: 'de',
    });
    expect(own.ok && own.value.riskLanguage).toBe('en');
    // A list without pt-PT, as before counsel's approval, records en under pt-PT too.
    const unapproved = startPlan(typed, { ...context, language: 'pt-PT', riskLanguages: ['en'] });
    expect(unapproved.ok && unapproved.value.riskLanguage).toBe('en');
  });

  it('records pt-PT under pt-PT with the approved list', async () => {
    const context = { profile: await profile('PT'), template: template('two-coins'), numberInput, today, now };
    expect(RISK_WORDING_LANGUAGES).toContain('pt-PT');
    const result = startPlan(draft({ country: 'PT', templateId: 'two-coins' }), { ...context, language: 'pt-PT' });
    expect(result.ok && result.value.riskLanguage).toBe('pt-PT');
    expect(result.ok && writtenPlan(result.value).schemaVersion).toBe(4);
  });

  it('records the UI language when it is approved and loaded', async () => {
    const context = { profile: await profile('PT'), template: template('two-coins'), numberInput, today, now };
    const approved = { ...context, language: 'pt-PT' as const, riskLanguages: ['en', 'pt-PT'] as const };
    const result = startPlan(draft({ country: 'PT', templateId: 'two-coins' }), approved);
    expect(result.ok && result.value.riskLanguage).toBe('pt-PT');
    const own = startCustomPlan(draft({ country: 'PT', path: 'custom', coins: coins('60', '40') }), approved);
    expect(own.ok && own.value.riskLanguage).toBe('pt-PT');
    expect(checkPlan(draft({ country: 'PT', templateId: 'two-coins' }), approved)).toEqual(result);
    // A pt-PT acknowledgement is the v4 plan, which records its language (docs/DOMAIN.md §2.1).
    expect(result.ok && writtenPlan(result.value).schemaVersion).toBe(4);
    expect(own.ok && writtenPlan(own.value).schemaVersion).toBe(4);
  });

  it('a first buy on the 29th to the 31st makes buy day 28; the 28th stays; XX pays in EUR', async () => {
    const buyDays: (number | false)[] = [];
    for (const firstBuy of ['2026-10-28', '2026-10-29', '2026-10-31']) {
      const result = await start('XX', 'btc-only-hold', { firstBuy });
      buyDays.push(result.ok && result.value.buyDay);
    }
    expect(buyDays).toEqual([28, 28, 28]);
    const fifteenth = await start('XX', 'btc-only-hold', { firstBuy: '2026-11-15' });
    expect(fifteenth.ok && [fifteenth.value.buyDay, fifteenth.value.payCurrency]).toEqual([15, 'EUR']);
  });

  it('the Cycle plan before 2028-06-01 asks for no last buy', async () => {
    expect(needsLastBuy(template('cycle-plan'), today, '2026-11-01')).toBe(false);
    expect(needsLastBuy(template('cycle-plan'), '2028-06-01' as CalendarDate, '2028-06-01')).toBe(true);
    expect(needsLastBuy(template('two-coins'), today, '2026-11-01')).toBe(true);
    const result = await start('PT', 'cycle-plan', { lastBuy: '' });
    expect(result.ok && result.value.lastBuy).toBe('2028-06-01');
  });

  it('the Cycle plan with a first buy after its last buy asks for the last buy and drops its window', async () => {
    const cycle = template('cycle-plan');
    expect([
      needsLastBuy(cycle, today, '2028-06-01'),
      needsLastBuy(cycle, today, '2028-07-01'),
      needsLastBuy(cycle, today, ''),
    ]).toEqual([false, true, false]);
    const missing = await start('PT', 'cycle-plan', { firstBuy: '2028-07-01', lastBuy: '' });
    expect(missing.ok ? null : missing.error).toEqual({
      code: 'fields',
      issues: [{ field: 'lastBuy', error: { code: 'date-empty' } }],
    });
    const result = await start('PT', 'cycle-plan', { firstBuy: '2028-07-01', lastBuy: '2030-07-01' });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect([result.value.lastBuy, result.value.sellWindow, result.value.templateId]).toEqual([
      '2030-07-01',
      null,
      'cycle-plan',
    ]);
  });

  it('the Cycle plan in Germany is refused until the early window is accepted', async () => {
    const refused = await start('DE', 'cycle-plan');
    expect(refused.ok ? null : refused.error).toEqual({
      code: 'invalid-plan',
      issues: ['sell-window-before-eligibility'],
    });
    const accepted = await start('DE', 'cycle-plan', { acceptEarlyOpen: true });
    expect(accepted.ok && accepted.value.sellWindow?.acceptedEarlyOpen).toBe(true);
  });

  it('an unreadable amount or a missing date is a field issue, before the core sees the plan', async () => {
    const result = await start('PT', 'two-coins', { monthly: '1,234,56', starting: '-5', firstBuy: '' });
    expect(result.ok ? null : result.error).toEqual({
      code: 'fields',
      issues: [
        { field: 'monthly', error: { code: 'number-invalid', example: '1,234.56' } },
        { field: 'starting', error: { code: 'number-negative' } },
        { field: 'firstBuy', error: { code: 'date-empty' } },
      ],
    });
  });

  it('a plan issue that names a field is a field issue of that field', async () => {
    const issuesOf = async (code: 'DE' | 'PT', templateId: string, overrides: Partial<SetupDraft>) => {
      const result = await start(code, templateId, overrides);
      return result.ok ? null : result.error;
    };
    expect(await issuesOf('PT', 'two-coins', { monthly: '0' })).toEqual({
      code: 'fields',
      issues: [{ field: 'monthly', error: { code: 'no-amount' } }],
    });
    expect(await issuesOf('PT', 'two-coins', { monthly: '100', starting: '50.125' })).toEqual({
      code: 'fields',
      issues: [{ field: 'starting', error: { code: 'amount-precision' } }],
    });
    expect(await issuesOf('PT', 'two-coins', { lastBuy: '2026-10-01' })).toEqual({
      code: 'fields',
      issues: [{ field: 'lastBuy', error: { code: 'last-buy-before-first-buy' } }],
    });
    // The template's last buy, 2028-06-01, is more than 20 years after this first buy: no Last buy field.
    expect(await issuesOf('PT', 'cycle-plan', { firstBuy: '2008-01-01' })).toEqual({
      code: 'fields',
      issues: [{ field: 'firstBuy', error: { code: 'plan-too-long' } }],
    });
    expect(await issuesOf('DE', 'cycle-plan', {})).toEqual({
      code: 'invalid-plan',
      issues: ['sell-window-before-eligibility'],
    });
  });

  it('a template without dates needs the last buy', async () => {
    const result = await start('PT', 'accumulate', { lastBuy: '' });
    expect(result.ok ? null : result.error).toEqual({
      code: 'fields',
      issues: [{ field: 'lastBuy', error: { code: 'date-empty' } }],
    });
  });
});

const coin = (id: string): Coin => {
  const found = COINS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`No coin ${id}`);
  return found;
};

/** Bitcoin and Ethereum with the shares typed: the custom path's coins step. */
const coins = (btc: string, eth: string) => ({
  coins: [coin('BTC'), coin('ETH')],
  shares: { ['BTC' as CoinId]: btc, ['ETH' as CoinId]: eth },
});

async function custom(overrides: Partial<SetupDraft> = {}) {
  const context = { profile: await profile('PT'), numberInput, today, now, language };
  const typed = draft({ country: 'PT', path: 'custom', coins: coins('60', '40'), ...overrides });
  return { context, typed, result: startCustomPlan(typed, context) };
}

describe('the custom path (docs/DOMAIN.md §5)', () => {
  it('starts with no coins on the template path, and the buy day follows the first buy', () => {
    const empty = emptyDraft(today, id);
    expect([empty.path, empty.coins.coins, empty.buyDay]).toEqual(['template', [], null]);
    expect(scheduleValueOf(draft({ firstBuy: '2026-11-30' })).buyDay).toBe(28);
    expect(scheduleValueOf(draft({ firstBuy: '2026-11-30', buyDay: 5 })).buyDay).toBe(5);
    const value = scheduleValueOf(draft({ starting: '50' }));
    expect(draftPatchOf({ ...value, buyDay: 12 })).toEqual({
      monthly: '100',
      starting: '50',
      firstBuy: '2026-11-01',
      lastBuy: '2036-10-01',
      buyDay: 12,
    });
  });

  it('a custom plan has the typed coins and split, no template, no window, the buy day and the acknowledgement', async () => {
    const { result } = await custom({ buyDay: 15 });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const plan = result.value;
    expect(plan.coins.map((each) => each.id)).toEqual(['BTC', 'ETH']);
    expect(plan.split).toEqual({ BTC: '60', ETH: '40' });
    expect([plan.templateId, plan.sellWindow, plan.references, plan.expectations]).toEqual([null, null, {}, {}]);
    expect([plan.country, plan.payCurrency, plan.monthlyAmount, plan.buyDay, plan.lastBuy]).toEqual([
      'PT',
      'EUR',
      '100',
      15,
      '2036-10-01',
    ]);
    expect([plan.riskAcknowledgedAt, plan.riskWordingVersion]).toEqual([now, RISK_WORDING_VERSION]);
    const derived = (await custom({ firstBuy: '2026-11-30' })).result;
    expect(derived.ok && derived.value.buyDay).toBe(28);
  });

  it('shares of 60 and 30 are split-sum, before any date is checked', async () => {
    const { context, typed, result } = await custom({ coins: coins('60', '30'), lastBuy: '' });
    expect(coinsIssues(typed, context)).toEqual([{ code: 'split-sum', path: ['split'] }]);
    expect(result.ok ? null : result.error).toEqual({
      code: 'coins',
      issues: [{ code: 'split-sum', path: ['split'] }],
    });
    expect(coinsIssues({ ...typed, coins: coins('60', '40') }, context)).toEqual([]);
  });

  it('a last buy before the first is a schedule issue on the last buy', async () => {
    const { result } = await custom({ lastBuy: '2026-10-01' });
    expect(result.ok ? null : result.error).toEqual({
      code: 'schedule',
      issues: [{ code: 'last-buy-before-first-buy', path: ['lastBuy'] }],
    });
  });
});
