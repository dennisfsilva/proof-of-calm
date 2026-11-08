import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { anEntry, date, instant, money, units } from '../../test/builders';
import { GB_PLAN, GB_RULES } from '../../test/tax-year/gb-fixture';
import { POOLED_MATCH_DAYS } from '../constants';
import { addDays, type CalendarDate, epochDay, fromEpochDay } from '../dates/calendar';
import { ENTRY_KINDS, type Entry } from '../schema/entry';
import type { CoinId } from '../schema/ids';
import { taxYearPool } from './tax-year-pool';

// The raw listing (docs/DOMAIN.md §3.13) never invents, repeats or alters an entry: each row is one live
// entry of the log, its cells copied, dated no later than span.to + 30, and dated before the span only for a
// coin sold in it.

const span = { from: date('2026-04-06'), to: date('2027-04-05') };
const first = epochDay(addDays(span.from, -400));
const last = epochDay(addDays(span.to, 60));

const entries = fc
  .array(
    fc.record({
      kind: fc.constantFrom(...ENTRY_KINDS),
      day: fc.integer({ min: first, max: last }),
      coin: fc.constantFrom('BTC', 'ETH', 'SOL'),
      deleted: fc.boolean(),
      createdSecond: fc.integer({ min: 0, max: 3 }),
    }),
    { maxLength: 30 },
  )
  .map((rows) =>
    rows.map((row, index): Entry => {
      const on = fromEpochDay(row.day);
      return anEntry({
        kind: row.kind,
        date: on,
        coin: row.coin as CoinId,
        slot: null,
        // Units unique per entry, so a row names the entry it came from.
        units: units(`0.${String(index + 1).padStart(4, '0')}`),
        amount: row.kind === 'held' && index % 2 === 0 ? null : money(String(index + 1)),
        fee: row.kind === 'held' ? null : money('0.10'),
        createdAt: instant(`${on}T09:00:0${row.createdSecond}+00:00`),
        deletedAt: row.deleted ? instant(`${on}T10:00:00+00:00`) : null,
      });
    }),
  );

describe('taxYearPool, property (docs/DOMAIN.md §3.13)', () => {
  it('every row is a live entry of the plan, listed once, and every live entry of the span is listed', () => {
    fc.assert(
      fc.property(entries, fc.constantFrom('pooled', 'specific', 'average'), (log, lotRule) => {
        const pool = taxYearPool(GB_PLAN, log, { ...GB_RULES, lotRule }, span, date('2027-06-01'));
        const byUnits = new Map(log.map((entry) => [entry.units, entry]));
        const seen = new Set<string>();
        const windowEnd: CalendarDate = addDays(span.to, lotRule === 'pooled' ? POOLED_MATCH_DAYS : 0);
        for (const row of pool.rows) {
          const entry = byUnits.get(row.units);
          expect(entry?.deletedAt).toBeNull();
          expect(seen.has(row.units)).toBe(false);
          seen.add(row.units);
          expect(row).toMatchObject({ kind: entry?.kind, date: entry?.date, coin: entry?.coin, venue: entry?.venue });
          expect(row.date <= windowEnd).toBe(true);
          if (row.date > span.to) expect(row.kind).not.toBe('sell');
          const sold = log.some(
            (other) =>
              other.deletedAt === null &&
              other.coin === row.coin &&
              other.kind === 'sell' &&
              span.from <= other.date &&
              other.date <= span.to,
          );
          if (row.date < span.from || row.date > span.to) expect(sold).toBe(true);
        }
        for (const entry of log)
          if (entry.deletedAt === null && span.from <= entry.date && entry.date <= span.to)
            expect(seen.has(entry.units)).toBe(true);
      }),
    );
  });
});
