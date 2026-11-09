import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { aPlan, instant } from '../../test/builders';
import { FIXTURE_RULES } from '../../test/country-change/fixture';
import type { CurrencyCode } from '../money/currency';
import { type CurrencyAnswer, changeCountry } from './plan';

// The currency answer of a change of country (ADR-0053, docs/DOMAIN.md §6 "Change country"): `keep` never
// relabels the plan's currencies, whatever the country's, and `country` takes the country's for both. Neither
// touches an amount.

const now = instant('2026-11-09T09:00:00+00:00');
const currencies = fc.constantFrom<CurrencyCode>('EUR', 'USD', 'GBP', 'CHF');

describe('changeCountry’s currency answer (property)', () => {
  it('keeps both currencies on keep, and sets both to the country’s on country', () => {
    fc.assert(
      fc.property(
        currencies,
        currencies,
        currencies,
        fc.constantFrom<CurrencyAnswer>('keep', 'country'),
        (payCurrency, displayCurrency, currency, answer) => {
          const plan = aPlan({ payCurrency, displayCurrency });
          const { plan: after } = changeCountry(plan, { ...FIXTURE_RULES.DE, currency }, now, answer);
          const expected =
            answer === 'keep' ? { payCurrency, displayCurrency } : { payCurrency: currency, displayCurrency: currency };
          expect({ payCurrency: after.payCurrency, displayCurrency: after.displayCurrency }).toEqual(expected);
          expect([after.monthlyAmount, after.startingAmount]).toEqual([plan.monthlyAmount, plan.startingAmount]);
        },
      ),
    );
  });
});
