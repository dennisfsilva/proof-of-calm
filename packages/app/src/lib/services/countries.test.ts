import { type CountryProfile, GENERIC_COUNTRY, loadProfiles, ruleSource } from '@proofofcalm/content';
import type { CalendarDate } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { systemClock } from '../adapters/clock';
import { countryCardModel, countryEntries, createCountries, type ProfileLoaders } from './countries';

// The countries port: the models the Learn screens render, derived from the profiles at the clock's today. The
// derivation is tested on three fake profiles, so the shipped set can grow without touching this file; the shipped
// profiles only prove that the port accepts them and that Portugal's card keeps the fields of its file.

const PROFILES = await loadProfiles();
const profile = (code: string): CountryProfile => {
  const found = PROFILES.find((candidate) => candidate.code === code);
  if (found === undefined) throw new Error(`no profile ${code}`);
  return found;
};
const PORTUGAL = profile('PT');
const GENERIC = profile(GENERIC_COUNTRY);
const TODAY = '2026-10-20' as CalendarDate;
const RULES = ['holdingRule', 'lotRule', 'rates', 'losses', 'reporting'] as const;
const byName = (a: CountryProfile, b: CountryProfile) => a.name.localeCompare(b.name, 'en');

/** A fake profile in Portugal's shape; the codes order the other way than the names, so the sort by name shows. */
const fake = (code: string, name: string, nextReviewDue: string): CountryProfile => ({
  ...PORTUGAL,
  code,
  name,
  status: {
    ...PORTUGAL.status,
    lastReviewed: '2026-07-01' as CalendarDate,
    nextReviewDue: nextReviewDue as CalendarDate,
  },
});
const CEDAR = fake('AA', 'Cedar', '2026-06-01');
const BIRCH = fake('BB', 'Birch', '2027-11-02');
const ALDER = fake('CC', 'Alder', '2027-03-01');
const FAKES = [CEDAR, BIRCH, GENERIC, ALDER];

/** The day after twelve months past the profile's `nextReviewDue`: under review from then (docs/JURISDICTIONS.md §1). */
const reviewDay = (of: CountryProfile, offset: number): CalendarDate => {
  const [year, month, day] = of.status.nextReviewDue.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year + 1, month - 1, day + offset)).toISOString().slice(0, 10) as CalendarDate;
};

describe('countryEntries', () => {
  it('lists every profile but the generic one by name, with its review dates', () => {
    const entries = countryEntries(FAKES, TODAY);
    expect(entries.map((entry) => entry.code)).toEqual(['CC', 'BB', 'AA']);
    expect(entries.find((entry) => entry.code === 'AA')).toEqual({
      code: 'AA',
      name: 'Cedar',
      lastReviewed: '2026-07-01',
      nextReviewDue: '2026-06-01',
      underReview: false,
    });
  });

  it('accepts the shipped profiles: every one but the generic by name, Portugal with the dates of its file', () => {
    const entries = countryEntries(PROFILES, TODAY);
    const shipped = PROFILES.filter((candidate) => candidate.code !== GENERIC_COUNTRY).sort(byName);
    expect(shipped.length).toBeGreaterThan(1);
    expect(entries.map((entry) => entry.code)).toEqual(shipped.map((candidate) => candidate.code));
    expect(entries.find((entry) => entry.code === 'PT')).toMatchObject({
      name: PORTUGAL.name,
      lastReviewed: PORTUGAL.status.lastReviewed,
      nextReviewDue: PORTUGAL.status.nextReviewDue,
    });
  });

  it('marks a country under review from the day after twelve months past its due date', () => {
    const at = (today: CalendarDate) => countryEntries(FAKES, today).find((entry) => entry.code === 'AA')?.underReview;
    expect(at(reviewDay(CEDAR, 0))).toBe(false);
    expect(at(reviewDay(CEDAR, 1))).toBe(true);
  });
});

describe('countryCardModel', () => {
  it("keeps the card, the conditions and the sources, and resolves each rule's source by its key", () => {
    const model = countryCardModel(PORTUGAL, TODAY);
    expect(model.name).toBe(PORTUGAL.name);
    expect(model.generic).toBe(false);
    expect(model.underReview).toBe(false);
    expect(model.lastReviewed).toBe(PORTUGAL.status.lastReviewed);
    expect(model.card).toBe(PORTUGAL.card);
    expect(model.holdingRuleConditions).toBe(PORTUGAL.holdingRuleConditions);
    expect(model.sources).toBe(PORTUGAL.sources);
    for (const rule of RULES) {
      expect(model.ruleSources[rule]).toBe(ruleSource(PORTUGAL, rule));
      expect(model.ruleSources[rule]).toMatch(/^https:/);
    }
  });

  it('is under review from the day after twelve months past the due date', () => {
    expect(countryCardModel(PORTUGAL, reviewDay(PORTUGAL, 0)).underReview).toBe(false);
    expect(countryCardModel(PORTUGAL, reviewDay(PORTUGAL, 1)).underReview).toBe(true);
  });

  it('the generic profile links no source and is never under review', () => {
    const model = countryCardModel(GENERIC, '2040-01-01' as CalendarDate);
    expect(model.generic).toBe(true);
    expect(model.underReview).toBe(false);
    expect(Object.values(model.ruleSources)).toEqual(RULES.map(() => null));
  });
});

describe('createCountries', () => {
  const loaders = (): ProfileLoaders & { readonly calls: string[] } => {
    const calls: string[] = [];
    return {
      calls,
      all: async () => {
        calls.push('all');
        return FAKES;
      },
      one: async (code) => {
        calls.push(code);
        return FAKES.find((candidate) => candidate.code === code) ?? null;
      },
    };
  };
  const clockAt = (nowMs: { value: number }) => systemClock('Europe/Lisbon', () => nowMs.value);

  it("lists the countries and answers a country's card, each derived at the clock's today", async () => {
    const load = loaders();
    const nowMs = { value: Date.UTC(2026, 9, 20, 10) };
    const countries = createCountries(load, clockAt(nowMs));
    expect((await countries.list()).map((entry) => entry.code)).toEqual(['CC', 'BB', 'AA']);
    expect(await countries.card('BB')).toEqual(countryCardModel(BIRCH, TODAY));
    expect(load.calls).toEqual(['all', 'BB']);
    // The day after twelve months past Birch's due date: the same code, now under review.
    const [year, month, day] = reviewDay(BIRCH, 1).split('-').map(Number) as [number, number, number];
    nowMs.value = Date.UTC(year, month - 1, day, 10);
    expect((await countries.card('BB'))?.underReview).toBe(true);
    expect((await countries.list()).find((entry) => entry.code === 'BB')?.underReview).toBe(true);
  });

  it('answers null for the generic code without loading it, and for a code the loader has no file for', async () => {
    const load = loaders();
    const countries = createCountries(load, clockAt({ value: Date.UTC(2026, 9, 20, 10) }));
    // The loaders answer by upper-case code, as packages/content's `loadProfile` does: `aa` names no file.
    for (const code of [GENERIC_COUNTRY, 'ZZ', 'aa']) expect(await countries.card(code)).toBeNull();
    expect(load.calls).toEqual(['ZZ', 'aa']);
  });
});

// The card that leads Taxes where you live: the rules the plan runs on, so the generic profile's for a plan on XX
// and for a country with no profile file, which runs on XX (`browser.ts`); the library's `card` keeps refusing XX.
describe('planCard', () => {
  const shipped: ProfileLoaders = {
    all: async () => PROFILES,
    one: async (code) => PROFILES.find((candidate) => candidate.code === code) ?? null,
  };
  const countriesOver = (load: ProfileLoaders) =>
    createCountries(load, systemClock('Europe/Lisbon', () => Date.UTC(2026, 9, 20, 10)));

  it("answers the plan's country's card", async () => {
    expect(await countriesOver(shipped).planCard('PT')).toEqual(countryCardModel(PORTUGAL, TODAY));
  });

  it.each([GENERIC_COUNTRY, 'BR'])('%s: the generic profile, with no source linked', async (code) => {
    const model = await countriesOver(shipped).planCard(code);
    expect(model).toEqual(countryCardModel(GENERIC, TODAY));
    expect(model.generic).toBe(true);
    expect(Object.values(model.ruleSources)).toEqual(RULES.map(() => null));
  });

  it('rejects when a load fails, and the library still answers null for XX', async () => {
    const failing: ProfileLoaders = { ...shipped, one: () => Promise.reject(new Error('offline')) };
    await expect(countriesOver(failing).planCard('PT')).rejects.toThrow('offline');
    expect(await countriesOver(shipped).card(GENERIC_COUNTRY)).toBeNull();
  });
});
