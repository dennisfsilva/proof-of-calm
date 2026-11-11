import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { aMove, anEntry, aPlan, BTC, date, instant } from '../../test/builders';
import { PT_RULES } from '../../test/tax-year/pt-fixture';
import { addDays } from '../dates/calendar';
import { compare, decimal, type Money, minus, sum, type Units } from '../money/decimal';
import { heldLots, matchLots } from '../portfolio/lots';
import { moveShortfalls } from '../portfolio/move-shortfalls';
import type { CountryRules } from '../schema/country';
import type { Entry } from '../schema/entry';
import type { CoinId } from '../schema/ids';
import { textCell } from './csv';
import { type LotPiece, type TaxYearLots, taxYearLots, taxYearLotsCsv, taxYearSpan } from './tax-year';

// The per-lot file (docs/DOMAIN.md §3.13) over random logs of one coin from 2025 to 2027: every entry on its own day,
// so a lot is named by its purchase date and a sale by its date. Purchases and sales at two venues or none, sales that
// no lot covers (imported data), lots with no recorded cost, fees or none, amounts with up to three decimals, and moves
// from one venue to the other, from none, with a fee of 0.01 or none (ADR-0054).

const START = date('2025-01-01');
const plan = aPlan();
const amount = fc
  .integer({ min: 0, max: 99_999_999 })
  .map((scaled) => decimal<Money>(`${Math.floor(scaled / 1000)}.${String(scaled % 1000).padStart(3, '0')}`));
const event = fc.record({
  day: fc.integer({ min: 0, max: 3 * 365 - 1 }),
  kind: fc.constantFrom('buy', 'buy', 'sale', 'move'),
  venue: fc.constantFrom('A', 'B', null),
  units: fc.integer({ min: 1, max: 50 }).map((n) => decimal<Units>(`0.${String(n).padStart(2, '0')}`)),
  amount,
  fee: fc.option(amount, { nil: null }),
  noCost: fc.boolean(),
});
const log = fc.uniqueArray(event, { selector: (each) => each.day, maxLength: 10 }).map((events) =>
  events.map((each, index): Entry => {
    const createdAt = instant(`2025-01-01T09:00:${String(index).padStart(2, '0')}+00:00`);
    if (each.kind === 'move') {
      const received = each.fee === null || each.units === '0.01' ? each.units : minus(each.units, '0.01' as Units);
      const to = each.venue === 'A' ? 'B' : 'A';
      return aMove({ date: addDays(START, each.day), venue: each.venue, to, units: each.units, received, createdAt });
    }
    const held = each.kind === 'buy' && each.noCost;
    return anEntry({
      kind: each.kind === 'sale' ? 'sell' : held ? 'held' : 'extra',
      slot: null,
      date: addDays(START, each.day),
      venue: each.venue,
      units: each.units,
      amount: held ? null : each.amount,
      fee: held ? null : each.fee,
      createdAt,
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
const isPurchase = (entry: Entry) => entry.kind !== 'sell' && entry.kind !== 'move';

// The edge cases every run tries (§3.7): a move whose fee crosses a year end's lot, one from a venue with nothing there,
// one that sends a whole lot, and one moved twice, each followed by a sale at the destination.
const on = (day: string, entry: Partial<Entry>, second: number) =>
  anEntry({ slot: null, date: date(day), createdAt: instant(`2025-01-01T09:00:0${second}+00:00`), ...entry });
const buyAt = (day: string, venue: string | null, quantity: string, second: number) =>
  on(day, { kind: 'extra', venue, units: quantity as Units, amount: '100' as Money }, second);
const moveAt = (day: string, venue: string | null, to: string, quantity: string, received: string, second: number) =>
  aMove({
    date: date(day),
    venue,
    to,
    units: quantity as Units,
    received: received as Units,
    createdAt: instant(`2025-01-01T09:00:0${second}+00:00`),
  });
const sellAt = (day: string, venue: string, quantity: string, second: number) =>
  on(day, { kind: 'sell', venue, units: quantity as Units, amount: '90' as Money }, second);
const MOVES: Entry[][] = [
  [
    buyAt('2025-03-01', 'A', '0.10', 0),
    moveAt('2025-12-31', 'A', 'B', '0.05', '0.04', 1),
    sellAt('2026-02-01', 'B', '0.04', 2),
  ],
  [
    buyAt('2025-03-01', 'A', '0.10', 0),
    moveAt('2025-05-01', null, 'B', '0.05', '0.04', 1),
    sellAt('2026-02-01', 'B', '0.04', 2),
  ],
  [
    buyAt('2025-03-01', null, '0.10', 0),
    moveAt('2025-05-01', null, 'A', '0.10', '0.09', 1),
    sellAt('2027-02-01', 'A', '0.09', 2),
  ],
  [
    buyAt('2025-03-01', 'A', '0.10', 0),
    moveAt('2025-05-01', 'A', 'B', '0.06', '0.05', 1),
    moveAt('2026-05-01', 'B', 'A', '0.05', '0.05', 2),
    sellAt('2027-02-01', 'B', '0.01', 3),
  ],
  // A move into a venue already holding units, from one holding none: its fee comes from the destination (ADR-0055).
  [
    buyAt('2025-03-01', 'A', '0.10', 0),
    moveAt('2025-05-01', 'B', 'A', '0.05', '0.04', 1),
    sellAt('2026-02-01', 'A', '0.09', 2),
  ],
  // Global FIFO sells A's lot for the sale at B, so the move's fee leaves B's lot while the Log still holds 0.10 at A.
  [
    buyAt('2025-03-01', 'A', '0.10', 0),
    buyAt('2025-04-01', 'B', '0.10', 1),
    sellAt('2025-05-01', 'B', '0.10', 2),
    moveAt('2025-06-01', 'A', 'B', '0.05', '0.04', 3),
  ],
];
const examples = MOVES.flatMap((entries) => [
  [entries, PT_RULES] as [Entry[], CountryRules],
  [entries, { ...PT_RULES, lotScope: 'global' as const }] as [Entry[], CountryRules],
]);

describe('taxYearLots (property)', () => {
  it("in year Y's file a lot's year-end row equals, in units, cost and fee, the sum of its rows in year Y+1's file", () => {
    fc.assert(
      fc.property(log, rules, (entries, country) => {
        for (const year of [2025, 2026]) {
          const [file, next] = [fileFor(entries, country, year), fileFor(entries, country, year + 1)];
          for (const purchase of entries.filter((entry) => isPurchase(entry) && entry.date <= `${year}-12-31`)) {
            // A lot held at more than one place at the year end has a year-end row per place.
            const held = ofLot(file, purchase.date).filter(yearEnd);
            const rows = ofLot(next, purchase.date);
            if (held.length === 0) {
              expect(rows).toEqual([]);
              continue;
            }
            same(sum(held.map((row) => row.units)), sum(rows.map((row) => row.units)));
            same(total(held.map((row) => row.costBasis)), total(rows.map((row) => row.costBasis)));
            same(total(held.map((row) => row.fee)), total(rows.map((row) => row.fee)));
          }
        }
      }),
      { examples },
    );
  });

  it("tax-year pieces sum to each lot's units, cost and fee: its sold and fee pieces over the years, its last year end", () => {
    fc.assert(
      fc.property(log, rules, (entries, country) => {
        const files = [2025, 2026, 2027].map((year) => fileFor(entries, country, year));
        for (const purchase of entries.filter(isPurchase)) {
          const pieces = files.flatMap((file, index) =>
            ofLot(file, purchase.date).filter((piece) => !yearEnd(piece) || index === files.length - 1),
          );
          same(purchase.units, sum(pieces.map((piece) => piece.units)));
          same(purchase.amount, total(pieces.map((piece) => piece.costBasis)));
          same(purchase.fee, total(pieces.map((piece) => piece.fee)));
        }
      }),
      { examples },
    );
  });

  it('the last year end less every row no lot covered is the units bought less the units sold and paid as fees', () => {
    fc.assert(
      fc.property(log, rules, (entries, country) => {
        const files = [2025, 2026, 2027].map((year) => fileFor(entries, country, year));
        const units = (pieces: readonly LotPiece[]) => sum(pieces.map((piece) => piece.units));
        const yearEnds = units(files.at(-1)?.pieces.filter(yearEnd) ?? []);
        const uncovered = units(files.flatMap((file) => file.pieces.filter((piece) => piece.acquired === null)));
        const leaving = (entry: Entry) =>
          entry.kind === 'move' ? minus(entry.units, entry.received ?? entry.units) : entry.units;
        const bought = sum(entries.filter(isPurchase).map((entry) => entry.units));
        const gone = sum(entries.filter((entry) => !isPurchase(entry)).map(leaving));
        same(minus(yearEnds, uncovered), minus(bought, gone));
      }),
      { examples },
    );
  });

  it("with no row lacking an acquired date, the last year end equals heldLots' units", () => {
    fc.assert(
      fc.property(log, rules, (entries, country) => {
        const files = [2025, 2026, 2027].map((year) => fileFor(entries, country, year));
        if (files.some((file) => file.pieces.some((piece) => piece.acquired === null))) return;
        const yearEnds = sum(
          files
            .at(-1)
            ?.pieces.filter(yearEnd)
            .map((piece) => piece.units) ?? [],
        );
        const held = heldLots(matchLots(entries, BTC.id, country.lotScope)).lots;
        same(yearEnds, sum(held.map((lot) => lot.remainingUnits)));
      }),
      { examples },
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
      { examples },
    );
  });

  it('feeAtDestination counts exactly the fee rows taken at the destination whose move moveShortfalls lists', () => {
    fc.assert(
      fc.property(log, rules, (entries, country) => {
        // Every entry is on its own day, so a fee row names its move by its date.
        const moves = new Map(entries.filter((entry) => entry.kind === 'move').map((move) => [move.date, move]));
        for (const year of [2025, 2026, 2027]) {
          const file = fileFor(entries, country, year);
          const context = { overrides: [], lotScope: country.lotScope, lotRule: country.lotRule };
          const upTo = entries.filter((entry) => entry.date <= file.span.to);
          const listed = new Set(moveShortfalls(upTo, BTC.id, context).map((each) => each.id));
          const counted = file.pieces.filter((piece) => {
            const move = piece.disposedOn === null ? undefined : moves.get(piece.disposedOn);
            return piece.acquired !== null && move !== undefined && piece.heldAt === move.to && listed.has(move.id);
          });
          expect(file.feeAtDestination).toBe(counted.length);
        }
      }),
      { examples },
    );
  });
});

// Every free-text cell of the file goes through textCell (docs/DOMAIN.md §3.13, #207): the header lines, the coin
// (a ticker may start with -), the lot's venue, the sale's venue and the place the units were held at.
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
            'kind,acquired,coin,venue,units,cost_basis,fee,eligible_from,past_holding_rule,disposed_on,sale_venue,proceeds,disposal_fee,units_estimated,held_at,moved_on',
            `extra,2026-01-05,${c},${v},0.5,50.00,,2027-01-05,no,2026-02-05,${s},80.00,,no,${v},`,
            `extra,2026-01-05,${c},${v},0.5,50.00,,2027-01-05,no,,,,,no,${v},`,
          ].join('\n'),
        );
      }),
      { examples: EDGES.map((edge) => [[edge], '-1', edge, edge]) },
    );
  });
});
