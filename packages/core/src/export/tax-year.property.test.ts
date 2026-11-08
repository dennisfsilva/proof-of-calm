import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, BTC, date, instant } from '../../test/builders';
import { PT_RULES } from '../../test/tax-year/pt-fixture';
import { addDays } from '../dates/calendar';
import { compare, decimal, type Money, sum, type Units } from '../money/decimal';
import type { CountryRules } from '../schema/country';
import type { Entry } from '../schema/entry';
import type { CoinId } from '../schema/ids';
import { textCell } from './csv';
import { type LotPiece, type TaxYearLots, taxYearLots, taxYearLotsCsv, taxYearSpan } from './tax-year';

// The per-lot file (docs/DOMAIN.md §3.13) over random logs of one coin from 2025 to 2027: every entry on its own day,
// so a lot is named by its purchase date and a sale by its date. Purchases and sales at two venues or none, sales that
// no lot covers (imported data), lots with no recorded cost, fees or none, amounts with up to three decimals.

const START = date('2025-01-01');
const plan = aPlan();
const amount = fc
  .integer({ min: 0, max: 99_999_999 })
  .map((scaled) => decimal<Money>(`${Math.floor(scaled / 1000)}.${String(scaled % 1000).padStart(3, '0')}`));
const event = fc.record({
  day: fc.integer({ min: 0, max: 3 * 365 - 1 }),
  sale: fc.boolean(),
  venue: fc.constantFrom('A', 'B', null),
  units: fc.integer({ min: 1, max: 50 }).map((n) => decimal<Units>(`0.${String(n).padStart(2, '0')}`)),
  amount,
  fee: fc.option(amount, { nil: null }),
  noCost: fc.boolean(),
});
const log = fc.uniqueArray(event, { selector: (each) => each.day, maxLength: 10 }).map((events) =>
  events.map((each, index): Entry => {
    const held = !each.sale && each.noCost;
    return anEntry({
      kind: each.sale ? 'sell' : held ? 'held' : 'extra',
      slot: null,
      date: addDays(START, each.day),
      venue: each.venue,
      units: each.units,
      amount: held ? null : each.amount,
      fee: held ? null : each.fee,
      createdAt: instant(`2025-01-01T09:00:${String(index).padStart(2, '0')}+00:00`),
    });
  }),
);
const rules = fc
  .tuple(fc.constantFrom('fifo', 'lifo', 'unspecified'), fc.constantFrom('per-venue', 'global'))
  .map(([lotRule, lotScope]): CountryRules => ({ ...PT_RULES, lotRule, lotScope }));

const fileFor = (entries: readonly Entry[], country: CountryRules, endingIn: number) =>
  taxYearLots(plan, entries, country, taxYearSpan(country.taxYear, endingIn), date('2030-01-01'));
/** The sum of one figure over pieces, null when the figure is not recorded (a lot with no cost, a sale with no fee). */
const total = (values: readonly (Money | null)[]) =>
  values.every((value) => value === null) ? null : sum(values.map((value) => value ?? ('0' as Money)));
const same = (a: Money | Units | null, b: Money | Units | null) =>
  a === null || b === null ? expect(a).toBe(b) : expect(compare(a, b)).toBe(0);
const ofLot = (file: TaxYearLots, acquired: string) => file.pieces.filter((piece) => piece.acquired === acquired);
const yearEnd = (piece: LotPiece) => piece.disposedOn === null;

describe('taxYearLots (property)', () => {
  it("in year Y's file a lot's year-end row equals, in units, cost and fee, the sum of its rows in year Y+1's file", () => {
    fc.assert(
      fc.property(log, rules, (entries, country) => {
        for (const year of [2025, 2026]) {
          const [file, next] = [fileFor(entries, country, year), fileFor(entries, country, year + 1)];
          for (const purchase of entries.filter((entry) => entry.kind !== 'sell' && entry.date <= `${year}-12-31`)) {
            const held = ofLot(file, purchase.date).find(yearEnd);
            const rows = ofLot(next, purchase.date);
            if (held === undefined) {
              expect(rows).toEqual([]);
              continue;
            }
            same(held.units, sum(rows.map((row) => row.units)));
            same(held.costBasis, total(rows.map((row) => row.costBasis)));
            same(held.fee, total(rows.map((row) => row.fee)));
          }
        }
      }),
    );
  });

  it("a lot's disposal pieces across the years plus its latest year-end piece add up to its units, cost and fee", () => {
    fc.assert(
      fc.property(log, rules, (entries, country) => {
        const files = [2025, 2026, 2027].map((year) => fileFor(entries, country, year));
        for (const purchase of entries.filter((entry) => entry.kind !== 'sell')) {
          const pieces = files.flatMap((file, index) =>
            ofLot(file, purchase.date).filter((piece) => !yearEnd(piece) || index === files.length - 1),
          );
          same(purchase.units, sum(pieces.map((piece) => piece.units)));
          same(purchase.amount, total(pieces.map((piece) => piece.costBasis)));
          same(purchase.fee, total(pieces.map((piece) => piece.fee)));
        }
      }),
    );
  });

  it("a sale's shares add up to its amount and fee", () => {
    fc.assert(
      fc.property(log, rules, (entries, country) => {
        const files = [2025, 2026, 2027].map((year) => fileFor(entries, country, year));
        for (const sale of entries.filter((entry) => entry.kind === 'sell')) {
          const pieces = files.flatMap((file) => file.pieces.filter((piece) => piece.disposedOn === sale.date));
          same(sale.units, sum(pieces.map((piece) => piece.units)));
          same(sale.amount, total(pieces.map((piece) => piece.proceeds)));
          same(sale.fee, total(pieces.map((piece) => piece.disposalFee)));
        }
      }),
    );
  });
});

// Every free-text cell of the file goes through textCell (docs/DOMAIN.md §3.13, #207): the header lines, the coin
// (a ticker may start with -), the lot's venue and the sale's venue.
/** The edge positions, tried on every run: each trigger at index 0, one after each separator, runs, a CR first. */
const EDGES = ['=1', '+1', '-1', '@1', '\t1', '\r1', 'a;=1', 'a\r=1', 'a\n=1', ';;=1', '\r\r=1', '\r\n=1', 'a,"b"'];
const text = fc.oneof(fc.constantFrom(...EDGES), fc.string({ minLength: 1, maxLength: 12 }));
const ticker = fc.oneof(fc.constantFrom('-1', '-BTC', '$X', '.5'), fc.stringMatching(/^[A-Z0-9.$-]{1,12}$/u));

describe('taxYearLotsCsv (property)', () => {
  it('every text cell is a textCell', () => {
    fc.assert(
      fc.property(fc.array(text, { maxLength: 3 }), ticker, text, text, (header, coin, bought, sold) => {
        const id = coin as CoinId;
        const coinPlan = aPlan({ coins: [{ ...BTC, id }] });
        const entries = [
          anEntry({
            kind: 'extra',
            slot: null,
            coin: id,
            date: date('2026-01-05'),
            units: '1' as Units,
            amount: '100' as Money,
            venue: bought,
          }),
          anEntry({
            kind: 'sell',
            slot: null,
            coin: id,
            date: date('2026-02-05'),
            units: '0.5' as Units,
            amount: '80' as Money,
            venue: sold,
          }),
        ];
        const lots = taxYearLots(coinPlan, entries, PT_RULES, taxYearSpan(PT_RULES.taxYear, 2026), date('2027-01-10'));
        const [c, v, s] = [textCell(coin), textCell(bought), textCell(sold)];
        expect(taxYearLotsCsv(lots, header)).toBe(
          [
            ...header.map(textCell),
            '',
            'kind,acquired,coin,venue,units,cost_basis,fee,eligible_from,past_holding_rule,disposed_on,sale_venue,proceeds,disposal_fee,units_estimated',
            `extra,2026-01-05,${c},${v},0.5,50.00,,2027-01-05,no,2026-02-05,${s},80.00,,no`,
            `extra,2026-01-05,${c},${v},0.5,50.00,,2027-01-05,no,,,,,no`,
          ].join('\n'),
        );
      }),
      { examples: EDGES.map((edge) => [[edge], '-1', edge, edge]) },
    );
  });
});
