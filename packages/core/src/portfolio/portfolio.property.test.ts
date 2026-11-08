import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, BTC, date, ETH, instant, money, split, units } from '../../test/builders';
import { uncoveredSale } from '../actions/entries';
import {
  compare,
  isPositive,
  type Money,
  minus,
  type Price,
  plus,
  product,
  quotient,
  sum,
  valueAt,
} from '../money/decimal';
import type { Entry } from '../schema/entry';
import type { Plan } from '../schema/plan';
import type { PriceSnapshot } from '../schema/prices';
import { lotEligibleFrom, sellableNow } from './eligibility';
import { DEFAULT_HOLDING_CONTEXT, type HoldingContext, heldLots, type LotMatch, matchLots } from './lots';
import { portfolio } from './portfolio';

// docs/DOMAIN.md §3.6: units with no recorded cost count in the value and nowhere else; without them the figures
// are the ones the portfolio gave before the `held` kind, whatever the lot scope and rule.

const plan = aPlan({ coins: [BTC, ETH], split: split({ BTC: '70', ETH: '30' }) });
const prices: PriceSnapshot = {
  at: instant('2026-10-16T14:05:00+01:00'),
  prices: { BTC: { EUR: '60000' as Price }, ETH: { EUR: '2000' as Price } } as PriceSnapshot['prices'],
};
const DAYS = ['2025-01-10', '2025-06-10', '2026-03-10', '2026-08-10'];
const QUANTITIES = ['0.001', '0.004', '0.01', '0.025'];
const VENUES = ['Kraken', 'Ledger', null];
const KINDS = ['extra', 'sell', 'held'] as const;

const contexts = fc.record({
  overrides: fc.constant([]),
  lotScope: fc.constantFrom('global' as const, 'per-venue' as const),
  lotRule: fc.constantFrom('fifo' as const, 'lifo' as const, 'average' as const),
}) as fc.Arbitrary<HoldingContext>;

type Row = { kind: (typeof KINDS)[number]; coin: 'BTC' | 'ETH'; day: string; quantity: string; venue: string | null };
const row = (kinds: readonly (typeof KINDS)[number][]): fc.Arbitrary<Row> =>
  fc.record({
    kind: fc.constantFrom(...kinds),
    coin: fc.constantFrom('BTC' as const, 'ETH' as const),
    day: fc.constantFrom(...DAYS),
    quantity: fc.constantFrom(...QUANTITIES),
    venue: fc.constantFrom(...VENUES),
  });
// A `held` row here has its cost recorded; a held entry without one is added by each property.
const toEntry = ({ kind, coin, day, quantity, venue }: Row): Entry =>
  anEntry({
    kind,
    slot: null,
    coin: coin as never,
    date: date(day),
    units: units(quantity),
    amount: money(kind === 'sell' ? '90' : '100'),
    venue,
  });
const costed = fc.array(row(KINDS), { maxLength: 12 }).map((rows) => rows.map(toEntry));
const uncosted = fc.record({ day: fc.constantFrom(...DAYS), quantity: fc.constantFrom(...QUANTITIES) }).map(
  ({ day, quantity }): Entry =>
    anEntry({
      kind: 'held',
      slot: null,
      amount: null,
      fee: null,
      date: date(day),
      units: units(quantity),
      venue: 'Ledger',
    }),
);

describe('portfolio with coins held without a cost (docs/DOMAIN.md §3.6)', () => {
  it('with no entry of unknown cost, gives every field as before, for any context', () => {
    fc.assert(
      fc.property(costed, contexts, (entries, context) => {
        const result = portfolio(plan, entries, prices, context);
        expect(result).toEqual(portfolio(plan, entries, prices, DEFAULT_HOLDING_CONTEXT));
        for (const position of result.positions) {
          expect(position.unrecordedUnits).toBe('0');
          expect(position.pnl).toBe(minus(plus(position.value as never, position.proceeds), position.invested));
          expect(position.average).toBe(
            isPositive(position.boughtUnits)
              ? quotient(position.invested, position.boughtUnits, 10, 'half-even')
              : null,
          );
        }
        expect(result.pnl).toBe(minus(plus(result.value as never, result.proceeds), result.invested));
      }),
    );
  });

  it('never changes invested when a held entry without a cost is added', () => {
    fc.assert(
      fc.property(costed, uncosted, contexts, (entries, held, context) => {
        const before = portfolio(plan, entries, prices, context);
        const after = portfolio(plan, [...entries, held], prices, context);
        expect(after.invested).toBe(before.invested);
        expect(after.positions.map((position) => position.invested)).toEqual(
          before.positions.map((position) => position.invested),
        );
      }),
    );
  });

  it('never leaves more units unrecorded than are held', () => {
    fc.assert(
      fc.property(costed, fc.array(uncosted, { maxLength: 3 }), contexts, (entries, held, context) => {
        for (const position of portfolio(plan, [...entries, ...held], prices, context).positions) {
          expect(compare(position.unrecordedUnits, position.units)).toBeLessThanOrEqual(0);
          expect(compare(position.unrecordedUnits, '0' as never)).toBeGreaterThanOrEqual(0);
        }
      }),
    );
  });

  it('on imported data, keeps every no-cost unit held unrecorded or sold uncosted, never costed', () => {
    // Imported data the save refuses: sales dated before any lot, or more units sold than bought.
    const early = row(['sell']).map((each) => toEntry({ ...each, day: '2024-06-01' }));
    const imported = fc
      .tuple(costed, fc.array(uncosted, { maxLength: 3 }), fc.array(early, { maxLength: 3 }))
      .map(([entries, held, sales]) => [...sales, ...entries, ...held]);
    fc.assert(
      fc.property(imported, contexts, (entries, context) => {
        for (const position of portfolio(plan, entries, prices, context).positions) {
          const coin = position.coin;
          const own = entries.filter((entry) => entry.coin === coin);
          const held = heldLots(matchLots(entries, coin, context.lotScope, context.lotRule));
          const noCost = sum(own.filter((entry) => entry.kind !== 'sell' && entry.amount === null).map((e) => e.units));
          // Matching and heldLots' cover together: the no-cost units held plus those sold uncosted are all there were.
          expect(compare(plus(position.unrecordedUnits, sum(held.sales.map((sale) => sale.uncosted))), noCost)).toBe(0);
          expect(compare(position.unrecordedUnits, position.units)).toBeLessThanOrEqual(0);
          // The unmatched units still say what no lot held at each sale's date covered.
          expect(held.sales.map((sale) => sale.unmatched)).toEqual(
            matchLots(entries, coin, context.lotScope, context.lotRule).sales.map((sale) => sale.unmatched),
          );
          const { now, later } = sellableNow(plan, entries, coin, date('2027-01-01'), context);
          expect(compare(plus(now, sum(later.map((part) => part.units))), position.units)).toBe(0);
          if (position.pnl === null) continue;
          const costedProceeds = sum(
            held.sales.map((sale) => {
              const amount = own.find((entry) => entry.id === sale.id)?.amount ?? ('0' as Money);
              return minus(amount, quotient<Money>(product(amount, sale.uncosted), sale.units, 10, 'half-even'));
            }),
          );
          const value = valueAt(minus(position.units, position.unrecordedUnits), position.price as Price);
          expect(position.pnl).toBe(minus(plus(value, costedProceeds), position.invested));
        }
      }),
    );
  });

  describe('per venue, for any entries the save accepts', () => {
    // Held entries without a cost fall only on these days, so a later date of `sellableNow` names their lots alone.
    const HELD_DAYS = ['2025-03-03', '2026-05-05'];
    const noCost = fc
      .record({
        coin: fc.constantFrom('BTC' as const, 'ETH' as const),
        day: fc.constantFrom(...HELD_DAYS),
        quantity: fc.constantFrom(...QUANTITIES),
        venue: fc.constantFrom(...VENUES),
      })
      .map(
        ({ coin, day, quantity, venue }): Entry =>
          anEntry({
            kind: 'held',
            slot: null,
            coin: coin as never,
            amount: null,
            fee: null,
            date: date(day),
            units: units(quantity),
            venue,
          }),
      );
    // Each entry in turn, kept only when the save would write it (`uncoveredSale`, docs/DOMAIN.md §3.7); half the time
    // ETH has no purchase with a cost, so its P/L is null while its sales still reach the total.
    const costedEth = (entry: Entry) => entry.coin === ETH.id && entry.kind !== 'sell' && entry.amount !== null;
    const accepted = fc
      .tuple(fc.array(fc.oneof(row(KINDS).map(toEntry), noCost), { maxLength: 14 }), fc.boolean())
      .map(([list, noCostEth]) => {
        const kept: Entry[] = [];
        for (const entry of list) {
          if (noCostEth && costedEth(entry)) continue;
          if (uncoveredSale(kept, [entry]) === null) kept.push(entry);
        }
        return kept;
      });
    const perVenue = contexts.map((context): HoldingContext => ({ ...context, lotScope: 'per-venue' }));
    const daily: Plan = { ...plan, holdingRule: { kind: 'days', days: 365, effect: 'exempt' } };

    it('gives a total P/L equal to the sum of the positions', () => {
      fc.assert(
        fc.property(accepted, perVenue, (entries, context) => {
          const result = portfolio(plan, entries, prices, context);
          expect(result.pnl).toBe(sum(result.positions.map((position) => position.pnl ?? ('0' as Money))));
        }),
      );
    });

    it('leaves the lots that sellableNow leaves: the same units, and those of no cost unrecorded', () => {
      fc.assert(
        fc.property(accepted, perVenue, (entries, context) => {
          for (const position of portfolio(daily, entries, prices, context).positions) {
            // Before every purchase, each lot left is listed under the date it passes the rule.
            const { now, later } = sellableNow(daily, entries, position.coin, date('2024-01-01'), context);
            const noCostFrom = HELD_DAYS.map((day) => lotEligibleFrom(daily, { date: date(day) }, context));
            expect(now).toBe('0');
            expect(sum(later.map((part) => part.units))).toBe(position.units);
            expect(sum(later.filter((part) => noCostFrom.includes(part.from)).map((part) => part.units))).toBe(
              position.unrecordedUnits,
            );
          }
        }),
      );
    });

    it('per venue with every entry at one venue gives the global result (lots, sales, takes)', () => {
      fc.assert(
        fc.property(accepted, fc.constantFrom(...VENUES), perVenue, (entries, venue, context) => {
          const one = entries.map((entry) => ({ ...entry, venue }));
          for (const coin of [BTC.id, ETH.id]) {
            expect(matchLots(one, coin, 'per-venue', context.lotRule)).toEqual(
              matchLots(one, coin, 'global', context.lotRule),
            );
          }
        }),
      );
    });

    it('per venue, every sale’s unmatched and the remaining units in total equal the global result', () => {
      // Any entries, imported data that leaves sales short included.
      const any = fc.array(fc.oneof(row(KINDS).map(toEntry), noCost), { maxLength: 14 });
      fc.assert(
        fc.property(any, perVenue, (entries, context) => {
          for (const coin of [BTC.id, ETH.id]) {
            const split = matchLots(entries, coin, 'per-venue', context.lotRule);
            const whole = matchLots(entries, coin, 'global', context.lotRule);
            const unmatched = (match: LotMatch) => match.sales.map((sale) => [sale.id, sale.unmatched]);
            const left = (match: LotMatch) => sum(match.lots.map((lot) => lot.remainingUnits));
            expect(unmatched(split)).toEqual(unmatched(whole));
            expect(split.unmatchedUnits).toBe(whole.unmatchedUnits);
            expect(left(split)).toBe(left(whole));
          }
        }),
      );
    });

    it('gives what the lot matching alone gives when every sale is covered by its own venue', () => {
      fc.assert(
        fc.property(accepted, perVenue, (entries, context) => {
          const coins = [BTC.id, ETH.id];
          const matches = coins.map((coin) => matchLots(entries, coin, 'per-venue', context.lotRule));
          const venueOf = new Map(entries.map((entry) => [entry.id, entry.venue]));
          // Every unit of every sale came from a lot at the sale's own venue.
          fc.pre(
            matches.every((match) =>
              match.sales.every(
                (sale) =>
                  sale.unmatched === '0' && sale.takes.every((take) => venueOf.get(take.lot) === venueOf.get(sale.id)),
              ),
            ),
          );
          const result = portfolio(plan, entries, prices, context);
          matches.forEach((match, index) => {
            const position = result.positions.find((each) => each.coin === coins[index]);
            if (position === undefined) return;
            const unrecorded = sum(match.lots.filter((lot) => lot.cost === null).map((lot) => lot.remainingUnits));
            const costed = sum(
              match.sales.map((sale) => {
                const amount = entries.find((entry) => entry.id === sale.id)?.amount ?? ('0' as Money);
                return minus(amount, quotient<Money>(product(amount, sale.uncosted), sale.units, 10, 'half-even'));
              }),
            );
            const value = valueAt(minus(position.units, unrecorded), position.price as Price);
            expect(position.unrecordedUnits).toBe(unrecorded);
            if (position.pnl !== null) expect(position.pnl).toBe(minus(plus(value, costed), position.invested));
          });
        }),
      );
    });
  });

  it('counts a held entry at cost 0 in invested (0) and in P/L, like any purchase', () => {
    fc.assert(
      fc.property(costed, uncosted, contexts, (entries, held, context) => {
        const free = { ...held, amount: money('0') };
        const result = portfolio(plan, [...entries, free], prices, context);
        expect(result.invested).toBe(portfolio(plan, entries, prices, context).invested);
        const btc = result.positions[0];
        expect(btc?.unrecordedUnits).toBe('0');
        expect(btc?.pnl).toBe(minus(plus(btc?.value as never, btc?.proceeds as never), btc?.invested as never));
      }),
    );
  });
});
