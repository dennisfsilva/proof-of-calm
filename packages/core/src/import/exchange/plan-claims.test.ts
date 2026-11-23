import { describe, expect, it } from 'vitest';
import { aPlan, date, money, split } from '../../../test/builders';
import { fileOf } from '../../../test/exchange/plan-arbitraries';
import { LISBON, NOW, testId, trade } from '../../../test/exchange/plan-fixture';
import type { Units } from '../../money/decimal';
import { defaultFee, lastVenue, oneTapEntries } from '../../plan/parts';
import { actionsNow, liveEntries, primaryAction } from '../../plan/statuses';
import { portfolio } from '../../portfolio/portfolio';
import type { Entry } from '../../schema/entry';
import type { Plan } from '../../schema/plan';
import type { PriceSnapshot } from '../../schema/prices';
import { applyExchangeImport } from './apply';
import type { Movement } from './kraken';
import { planExchangeImport } from './plan';
import { importRemedies } from './plan-remedy';

// Two costs of a one-tap `lump`'s claim in step 2 (docs/DOMAIN.md §3.13) that stand: pins of today's figures, so
// they fail only when the behaviour moves. The plan: BTC 100 %, 100 EUR a month from 2 Jul 2026; the file buys 100 EUR
// of BTC on the 2nd of July to November.

let line = 2;
const buy = (day: string, amount: string, held: string) => {
  line += 2;
  return trade(`C${line}`, 'purchase', 'BTC', day, { units: held, amount, fee: '0' }, line);
};
const P6 = aPlan({
  firstBuy: date('2026-07-02'),
  startingAmount: money('1000'),
  split: split({ BTC: '100', ETH: '0' }),
});
const M = ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11'].map((slot) => buy(`${slot}-02`, '100', '0.00125'));
const PRICES = { at: NOW, prices: { BTC: { EUR: '82000' }, ETH: { EUR: '2500' } } } as unknown as PriceSnapshot;

/** Today's tap of the starting amount on `day` over an empty Log, as today/actions.ts records it. */
const tap = (plan: Plan, day: string): Entry[] => {
  const action = primaryAction(actionsNow(plan, [], date(day)));
  if (action?.kind !== 'lump') throw new Error(`Today leads with ${action?.kind} on ${day}, not lump`);
  const ids = plan.coins.map((coin) => testId(`tap|${day}|${coin.id}`));
  const drafts = oneTapEntries({
    plan,
    action,
    prices: PRICES,
    today: date(day),
    fee: defaultFee([]),
    ids,
    now: NOW,
    venue: lastVenue([]),
  });
  return drafts.map((draft): Entry => ({ ...draft, units: draft.units as Units }));
};
/** The Log once the file's plan is imported over `entries`. */
const imported = (plan: Plan, file: readonly Movement[], entries: readonly Entry[]) =>
  applyExchangeImport(
    entries,
    planExchangeImport(fileOf(file), { plan, entries }, { venue: null, addHeld: false }, LISBON),
    NOW,
  ).entries;

describe("a one-tap lump's claim, the costs that stand", () => {
  const AT_PART = { ...P6, startingAmount: money('100') };

  for (const day of ['2026-09-02', '2026-09-05']) {
    it(`a lump at the monthly part tapped ${day} takes September's purchase: 400 against 500`, () => {
      const after = imported(AT_PART, M, tap(AT_PART, day));
      expect(liveEntries(after).filter((entry) => entry.slot === '2026-09')).toEqual([]);
      expect(portfolio(AT_PART, after).invested).toBe('400');
    });

    it(`the starting line asks to change that lump tapped ${day}, naming July's buy`, () => {
      const { starting } = importRemedies(fileOf(M), { plan: AT_PART, entries: tap(AT_PART, day) }, false, LISBON);
      expect(starting).toEqual({
        kind: 'change',
        date: '2026-07-02',
        totals: [{ coin: 'BTC', amount: '100', units: '0.00125', count: 1 }],
      });
    });
  }

  it('the same lump tapped 20 Sep, more than 3 days from a purchase, leaves September imported: 500', () => {
    expect(portfolio(AT_PART, imported(AT_PART, M, tap(AT_PART, '2026-09-20'))).invested).toBe('500');
  });

  it("a tapped lump that claims its own purchase keeps its estimated units, no line asking for a change: 0.01219512 against the file's 0.0125", () => {
    const file = [...M, buy('2026-09-03', '1000', '0.0125')];
    const after = liveEntries(imported(P6, file, tap(P6, '2026-09-03')));
    expect(after.filter((entry) => entry.date === '2026-09-03').map((entry) => [entry.source, entry.units])).toEqual([
      ['one-tap', '0.01219512'],
    ]);
    expect(portfolio(P6, after).invested).toBe('1400');
    expect(importRemedies(fileOf(file), { plan: P6, entries: tap(P6, '2026-09-03') }, false, LISBON).starting).toBe(
      null,
    );
  });
});
