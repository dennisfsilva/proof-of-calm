import { COINS, templateById } from '@proofofcalm/content';
import { type CalendarDate, type CoinId, EntityIdSchema } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { OnboardingDraftSchema, resumeStep, type SetupDraft, type Step } from './draft';
import { emptyDraft } from './setup';

const today = '2026-10-20' as CalendarDate;
const id = EntityIdSchema.parse('00000000-0000-4000-8000-000000000001');
const profiles = [{ code: 'DE' }, { code: 'PT' }, { code: 'XX' }] as const;
const coin = (ticker: string) => {
  const found = COINS.find((candidate) => candidate.id === ticker);
  if (found === undefined) throw new Error(`No coin ${ticker}`);
  return found;
};

const custom: SetupDraft = {
  ...emptyDraft(today, id, 'PT'),
  path: 'custom',
  coins: { coins: [coin('BTC'), coin('ETH')], shares: { ['BTC' as CoinId]: '60', ['ETH' as CoinId]: '40' } },
  monthly: '1 234,50',
  starting: '',
  firstBuy: '2026-11-03',
  lastBuy: '2036-10-01',
  buyDay: 12,
  why: 'Calm, every month.',
  reminder: 'later',
};
const template = (overrides: Partial<SetupDraft>): SetupDraft => ({
  ...emptyDraft(today, id, 'DE'),
  templateId: 'cycle-plan',
  monthly: '100',
  ...overrides,
});
const resume = (step: Step, draft: SetupDraft) => resumeStep({ step, draft }, profiles, templateById);

describe('OnboardingDraftSchema', () => {
  it('round-trips a custom draft through JSON with its id, sentence and reminder', () => {
    const saved = { step: 'summary', draft: custom };
    expect(OnboardingDraftSchema.parse(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it('refuses a step, a reminder or a sentence the screen never writes', () => {
    const parse = (value: unknown) => OnboardingDraftSchema.safeParse(value).success;
    expect(parse({ step: 'summary', draft: custom })).toBe(true);
    expect(parse({ step: 'payment', draft: custom })).toBe(false);
    expect(parse({ step: 'summary', draft: { ...custom, reminder: 'email' } })).toBe(false);
    expect(parse({ step: 'summary', draft: { ...custom, why: 'x'.repeat(281) } })).toBe(false);
    expect(parse({ step: 'summary', draft: { ...custom, id: 'not an id' } })).toBe(false);
  });
});

describe('resumeStep', () => {
  it('resumes on the saved step while every choice still resolves', () => {
    expect(resume('dates', custom)).toBe('dates');
    expect(resume('summary', custom)).toBe('summary');
    expect(resume('numbers', template({}))).toBe('numbers');
    expect(resume('reminder', template({ templateId: 'two-coins' }))).toBe('reminder');
  });

  it('falls back to the template step for an unknown template, and to the country for an unknown country', () => {
    expect(resume('summary', template({ templateId: 'retired-template' }))).toBe('template');
    expect(resume('numbers', template({ templateId: null }))).toBe('template');
    expect(resumeStep({ step: 'dates', draft: custom }, [{ code: 'DE' }], templateById)).toBe('country');
    expect(resume('template', { ...custom, country: null })).toBe('country');
  });

  it('never resumes a step of the other path', () => {
    expect(resume('numbers', custom)).toBe('template');
    expect(resume('coins', template({}))).toBe('template');
  });

  it('sends a draft whose early window was accepted back to the numbers, where the dropped tick is asked again', () => {
    expect(resume('why', template({ acceptEarlyOpen: true }))).toBe('numbers');
    expect(resume('summary', template({ acceptEarlyOpen: true }))).toBe('numbers');
    expect(resume('numbers', template({ acceptEarlyOpen: true }))).toBe('numbers');
    expect(resume('summary', template({ acceptEarlyOpen: false }))).toBe('summary');
  });
});
