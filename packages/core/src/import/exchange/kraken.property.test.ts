import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { abs, type Decimal, decimal, decimalPlaces, minus, round, sum } from '../../money/decimal';
import { type ExchangeFile, type LeftOutRow, type Movement, readKrakenLedger } from './kraken';

// The Kraken ledger reader (docs/DOMAIN.md §3.13, the exchange import) over generated ledgers: "Fills: one entry
// per refid, coin and direction" (ADR-0056), receipts folded by refid and coin (ADR-0056, Corrections,
// 2026-11-13). Every row is readable and every txid its own, so no row is dropped as a repeat and no refid is left
// out whole: a permutation then moves only the lines, which each check maps back to the row's first place.

const HEADER = ['txid', 'refid', 'time', 'type', 'subtype', 'asset', 'amount', 'fee'];
const MAX_UNIT_DECIMALS = 10;

/** A decimal cell of up to 12 places, so some sums need cutting to 10. */
const cellOf = ([n, places]: [number, number]) => {
  const digits = String(Math.abs(n)).padStart(places + 1, '0');
  const body = places === 0 ? digits : `${digits.slice(0, -places)}.${digits.slice(-places)}`;
  return n < 0 ? `-${body}` : body;
};
const number = (range: number) => fc.tuple(fc.integer({ min: -range, max: range }), fc.nat({ max: 12 })).map(cellOf);
/** Few refids, times and codes, so rows share a refid and a coin often; XXBT and BTC, ZEUR and EUR are one code. */
const row = fc.record({
  refid: fc.constantFrom('R1', 'R2', 'R3', 'R4'),
  time: fc.constantFrom('2025-12-01 09:00:00', '2025-12-01 08:59:59.5', '2025-12-02 00:00:00'),
  type: fc.constantFrom('trade', 'spend', 'receive', 'invite bonus', 'invite bonus', 'staking', 'deposit', 'other'),
  asset: fc.constantFrom('BTC', 'XXBT', 'ETH', 'EUR', 'ZEUR', 'USD', 'DOT.S'),
  amount: number(500_000),
  fee: number(500),
});
type Row = typeof row extends fc.Arbitrary<infer T> ? T : never;
const ledger = fc.array(row, { maxLength: 16 });
const dataOf = (rows: readonly Row[]) =>
  rows.map((each, index) => [`L${index}`, each.refid, each.time, each.type, '', each.asset, each.amount, each.fee]);
const read = (rows: readonly Row[]) => readKrakenLedger(HEADER, dataOf(rows));

/** The file's items with each line mapped back through `original` and sorted, in an order that ignores the file's. */
function normalised(file: ExchangeFile, original: (line: number) => number) {
  const each = <T extends Movement | LeftOutRow>(items: readonly T[]) =>
    items
      .map((item) => ({ ...item, lines: item.lines.map(original).toSorted((a, b) => a - b) }))
      .toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return { ...file, movements: each(file.movements), leftOut: each(file.leftOut) };
}

describe('readKrakenLedger (property)', () => {
  it('gives each movement its own key and each row one place, for any ledger', () => {
    fc.assert(
      fc.property(ledger, (rows) => {
        const file = read(rows);
        const keys = file.movements.map((movement) => movement.key);
        expect(new Set(keys).size).toBe(keys.length);
        const lines = [...file.movements, ...file.leftOut].flatMap((item) => item.lines).toSorted((a, b) => a - b);
        expect(lines).toEqual(rows.map((_, index) => index + 2));
      }),
    );
  });

  it('reads any order of the same rows as the same movements and left-out rows', () => {
    const shuffled = ledger.chain((rows) =>
      fc.tuple(
        fc.constant(rows),
        fc.shuffledSubarray(
          rows.map((_, index) => index),
          { minLength: rows.length, maxLength: rows.length },
        ),
      ),
    );
    fc.assert(
      fc.property(shuffled, ([rows, order]) => {
        const moved = read(order.map((index) => rows[index] as Row));
        const back = (line: number) => (order[line - 2] as number) + 2;
        expect(normalised(moved, back)).toEqual(normalised(read(rows), (line) => line));
      }),
    );
  });

  it('gives a folded receipt the units of its rows summed, then cut to 10 decimals', () => {
    fc.assert(
      fc.property(ledger, (rows) => {
        for (const receipt of read(rows).movements.filter((movement) => movement.role === 'receipt')) {
          const values = receipt.lines.map((line) => {
            const { amount, fee } = rows[line - 2] as Row;
            return abs(minus(decimal<Decimal>(amount), abs(decimal<Decimal>(fee))));
          });
          const total = sum(values);
          const cut = decimalPlaces(total) > MAX_UNIT_DECIMALS;
          expect([receipt.units, receipt.unitsCut]).toEqual([
            cut ? round(total, MAX_UNIT_DECIMALS, 'down') : total,
            cut,
          ]);
        }
      }),
    );
  });
});
