import { COUNTRY_CODES, type CountryProfile, countryLocales, countryRules, loadProfile } from '@proofofcalm/content';
import type { Decimal } from '@proofofcalm/core';
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { localesFor, UI_LANGUAGES } from '../i18n/locale';
import { createNumberInput } from './number-input';

// #261 A: a plan's number locale (ADR-0023) comes from its country whether or not the rules chunk arrived: the
// generated locales file (ADR-0049) gives what the rules give, and a typed amount reads back as it was written.
// Runs: with coverage, seeds 1 to 8 took at most 36 ms at 200 runs and 214 ms at 1,000 (2026-11-15); at 500, six
// times the worst stays under a third of Vitest's 5 s (docs/BUILD-PROMPT.md, property tests on CI).

const RUNS = 500;
const rules = new Map<string, ReturnType<typeof countryRules>>();

beforeAll(async () => {
  for (const code of COUNTRY_CODES) rules.set(code, countryRules((await loadProfile(code)) as CountryProfile));
});

const code = fc.constantFrom(...COUNTRY_CODES);
const language = fc.constantFrom(...UI_LANGUAGES);
/** Two capitals with no profile: the browser's loader answers the generic profile's rules for it. */
const unknown = fc
  .tuple(fc.integer({ min: 65, max: 90 }), fc.integer({ min: 65, max: 90 }))
  .map(([a, b]) => String.fromCharCode(a, b))
  .filter((each) => !(COUNTRY_CODES as readonly string[]).includes(each));

/** A plain decimal string: up to 13 integer digits and up to 8 decimals, no trailing zero after the point. */
const amount = fc
  .tuple(fc.bigInt({ min: 0n, max: 9_999_999_999_999n }), fc.integer({ min: 0, max: 8 }), fc.bigInt({ min: 0n }))
  .map(([integer, places, fraction]) => {
    const digits = (fraction % 10n ** BigInt(places)).toString().padStart(places, '0').replace(/0+$/, '');
    return (digits === '' ? `${integer}` : `${integer}.${digits}`) as Decimal;
  });

describe('a plan’s number locale', () => {
  it('a plan’s typed-amount locale is the same whether its rules loaded or not, for every profile code × UI language', () => {
    fc.assert(
      fc.property(code, language, (each, ui) => {
        expect(localesFor(ui, countryLocales(each))).toEqual(localesFor(ui, rules.get(each) ?? null));
      }),
      { numRuns: RUNS },
    );
    fc.assert(
      fc.property(unknown, language, (each, ui) => {
        expect(localesFor(ui, countryLocales(each))).toEqual(localesFor(ui, rules.get('XX') ?? null));
      }),
      { numRuns: RUNS },
    );
  });

  it('an amount formatted in a country’s number locale parses back to the same decimal string', () => {
    fc.assert(
      fc.property(code, language, amount, fc.boolean(), (each, ui, value, grouped) => {
        const locale = localesFor(ui, countryLocales(each)).numbers;
        const input = createNumberInput(locale);
        const places = value.split('.')[1]?.length ?? 0;
        const written = grouped
          ? input.format(value)
          : new Intl.NumberFormat(locale, {
              numberingSystem: 'latn',
              useGrouping: false,
              minimumFractionDigits: places,
              maximumFractionDigits: places,
            }).format(value as unknown as `${number}`);
        const read = input.parse(written);
        expect(read.ok ? read.value : read.error.code).toBe(value);
      }),
      { numRuns: RUNS },
    );
  });
});
