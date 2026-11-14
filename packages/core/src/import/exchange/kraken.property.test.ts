import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CHOICES, LISBON, PLAN, testId } from '../../../test/exchange/plan-fixture';
import { abs, compare, type Decimal, decimal, decimalPlaces, minus, round, sum } from '../../money/decimal';
import type { Entry } from '../../schema/entry';
import { type ExchangeFile, type LeftOutRow, type Movement, readKrakenLedger } from './kraken';
import { planExchangeImport } from './plan';

// The Kraken ledger reader (docs/DOMAIN.md §3.13, the exchange import) over generated ledgers: "Fills: one entry
// per refid, coin and direction" (ADR-0056), receipts folded by refid and coin (ADR-0056, Corrections,
// 2026-11-13). Every row is readable and every txid its own, so no row is dropped as a repeat and no refid is left
// out whole: a permutation then moves only the lines, which each check maps back to the row's first place.

const HEADER = ['txid', 'refid', 'time', 'type', 'subtype', 'asset', 'amount', 'fee'];
const MAX_UNIT_DECIMALS = 10;
// The worst of five seeds under the whole core suite with coverage on took 112 ms at 100 runs (2026-11-13); six
// times that, 672 ms, stays under a third of Vitest's 5 s timeout, the core's default.
const RUNS = { numRuns: 100 };

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
type Cells = { readonly [column in keyof Row]: string };
const dataOf = (rows: readonly Cells[]) =>
  rows.map((each, index) => [`L${index}`, each.refid, each.time, each.type, '', each.asset, each.amount, each.fee]);
const read = (rows: readonly Cells[]) => readKrakenLedger(HEADER, dataOf(rows));

/** One to three invite bonus rows per refid and coin, up to 2 days apart, each above 0 with no fee. */
const bonus = fc
  .record({
    refid: fc.constantFrom('B1', 'B2', 'B3'),
    asset: fc.constantFrom('BTC', 'ETH'),
    hours: fc.array(fc.integer({ min: 0, max: 48 }), { minLength: 1, maxLength: 3 }),
    amount: fc.integer({ min: 1, max: 99_999 }),
  })
  .map(({ refid, asset, hours, amount }) =>
    hours.map((hour, index) => ({
      refid,
      time: `2025-12-0${1 + Math.floor(hour / 24)} ${String(hour % 24).padStart(2, '0')}:00:00`,
      type: 'invite bonus',
      asset,
      amount: `0.${String(amount + index).padStart(5, '0')}`,
      fee: '0',
    })),
  );
const bonuses = fc
  .uniqueArray(bonus, { maxLength: 4, selector: (rows) => `${rows[0]?.refid}|${rows[0]?.asset}` })
  .map((groups) => groups.flat());
const planned = (file: ExchangeFile, entries: readonly Entry[]) =>
  planExchangeImport(file, { plan: PLAN, entries }, CHOICES, LISBON);
// The short-receipt property plans two imports over the reader, so it runs 300 times with a 60 s timeout. Measured on
// 2026-11-14 under the whole core suite with coverage, seeds 1 to 8: the worst was 0.30 s (seed 7); six times it,
// 1.8 s, stays under a third of the timeout (20 s).
const TWICE = { numRuns: 300 };
const TIMEOUT = 60_000;

/** The file's items with each line mapped back through `original` and sorted, in an order that ignores the file's. */
function normalised(file: ExchangeFile, original: (line: number) => number) {
  const each = <T extends Movement | LeftOutRow>(items: readonly T[]) =>
    items
      .map((item) => ({ ...item, lines: item.lines.map(original).toSorted((a, b) => a - b) }))
      .toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return { ...file, movements: each(file.movements), leftOut: each(file.leftOut) };
}

describe('readKrakenLedger (property)', () => {
  it('gives each movement its own key and units above 0, and each row one place, for any ledger', () => {
    fc.assert(
      fc.property(ledger, (rows) => {
        const file = read(rows);
        const keys = file.movements.map((movement) => movement.key);
        expect(new Set(keys).size).toBe(keys.length);
        expect(file.movements.filter((movement) => !/[1-9]/u.test(movement.units))).toEqual([]);
        const lines = [...file.movements, ...file.leftOut].flatMap((item) => item.lines).toSorted((a, b) => a - b);
        expect(lines).toEqual(rows.map((_, index) => index + 2));
      }),
      RUNS,
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
      RUNS,
    );
  });

  it(
    'a whole file names exactly the receipts an import of a window of its rows stored whose units grew; the named edit leaves one import’s Log',
    () => {
      fc.assert(
        fc.property(bonuses, fc.nat(), fc.nat(), (rows, start, cut) => {
          // A prefix, a suffix or a middle window of the file's times: [from, to).
          const times = [...new Set(rows.map((each) => each.time))].sort();
          const from = times[start % (times.length + 1)] ?? '~';
          const to = times[cut % (times.length + 1)] ?? '~';
          const inside = (each: Cells) => from <= each.time && each.time < to;
          const log = planned(read(rows.filter(inside)), []).entries;
          const then = planned(read(rows), log);
          const keyOf = (each: Cells) => `poc-csv-1|kraken|${each.refid}|${each.asset}|in`;
          const split = (each: Cells) =>
            rows.some((other) => keyOf(other) === keyOf(each) && inside(other) !== inside(each));
          const grew = new Set(rows.filter(split).map((each) => testId(keyOf(each))));
          const named = then.short.map(({ entry }) => entry.id).sort();
          expect(named).toEqual(
            log
              .filter((entry) => grew.has(entry.id))
              .map((entry) => entry.id)
              .sort(),
          );
          for (const { entry, units } of then.short) expect(compare(entry.units, units)).toBe(-1);
          // The person changes the units, and the date when the line names one; the live Log is then one import's.
          const edited = log.map((entry) => {
            const line = then.short.find((each) => each.entry.id === entry.id);
            return line === undefined ? entry : { ...entry, units: line.units, date: line.date };
          });
          const liveOf = (entries: readonly Entry[]) =>
            entries.map((entry) => `${entry.id}:${entry.kind}:${entry.coin}:${entry.units}:${entry.date}`).sort();
          expect(liveOf([...edited, ...then.entries])).toEqual(liveOf(planned(read(rows), []).entries));
        }),
        TWICE,
      );
    },
    TIMEOUT,
  );

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
      RUNS,
    );
  });
});
