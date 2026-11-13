import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { instant } from '../../../test/builders';
import { type World, worldOf } from '../../../test/exchange/plan-arbitraries';
import { LISBON, NOW } from '../../../test/exchange/plan-fixture';
import { type CalendarDate, compareInstants, stampAfter } from '../../dates/calendar';
import { sum } from '../../money/decimal';
import type { Entry } from '../../schema/entry';
import { applyExchangeImport, sameImport } from './apply';
import { importId } from './import-id';
import type { ExchangeFile } from './kraken';
import { type ExchangeImportPlan, type ImportContext, planExchangeImport } from './plan';

// The write (docs/DOMAIN.md §3.13): the plan's two-import properties rerun with `importId`, each Log stored through
// `applyExchangeImport`, so a real tombstone, stamped by the write, feeds the second plan; then the write's own rules.

const WRITE: ImportContext = { ...LISBON, idOf: importId };
const world = worldOf(importId);

const run = (drawn: World, entries: readonly Entry[], movements: ExchangeFile, addHeld = drawn.addHeld) =>
  planExchangeImport(movements, { plan: drawn.plan, entries }, { addHeld, venue: drawn.venue }, WRITE);

/** The write of a plan the Log it was planned on gave; it never refuses one. */
function write(entries: readonly Entry[], plan: ExchangeImportPlan): readonly Entry[] {
  const result = applyExchangeImport(entries, plan, NOW);
  expect(result.refused).toBeNull();
  return result.entries;
}

const ids = (entries: readonly Entry[]) => entries.map((entry) => entry.id).sort();
const live = (entries: readonly Entry[]) => entries.filter((entry) => entry.deletedAt === null);
const unitsPerCoin = (entries: readonly Entry[]) =>
  Object.fromEntries(
    ['BTC', 'ETH', 'SOL'].map((coin) => [coin, sum(entries.filter((e) => e.coin === coin).map((e) => e.units))]),
  );

/** One import of the whole file, and a prefix of its rows written before the whole file. */
function twoWays(drawn: World, cut: number) {
  const prefix = { ...drawn.file, movements: drawn.file.movements.slice(0, cut % (drawn.file.movements.length + 1)) };
  const once = run(drawn, drawn.entries, drawn.file);
  const first = run(drawn, drawn.entries, prefix);
  const after = write(drawn.entries, first);
  const then = run(drawn, after, drawn.file);
  return { once, first, then, oneLog: write(drawn.entries, once), twoLog: write(after, then) };
}

/**
 * The two-import properties run 1,500 times, as plan.property.test.ts's do, with a 90 s timeout each (the core's
 * default is Vitest's 5 s). Measured on 2026-11-13 under the full core suite with coverage, seeds 1 to 4: 3.0 to
 * 4.0 s locally per property, the worst 4.0 s (the unticked-then-ticked one, seed 1). CI's runner was at least 5.6
 * times slower on the plan's properties (#181), so six times the worst, 24 s, stays under a third of 90 s (30 s).
 */
const TWICE = { numRuns: 1500 };
const TIMEOUT = 90_000;
/**
 * The write's own properties run 300 times with a 15 s timeout: their worst, same runs, was 0.46 s (the refused
 * apply, seed 3), and six times it, 2.8 s, stays under a third of 15 s (5 s).
 */
const ONCE = { numRuns: 300 };
const SHORT = 15_000;

describe('applyExchangeImport over planExchangeImport, with importId', () => {
  it(
    'a second plan after the first is written adds nothing and replaces nothing',
    () => {
      fc.assert(
        fc.property(world, (drawn) => {
          const second = run(drawn, write(drawn.entries, run(drawn, drawn.entries, drawn.file)), drawn.file);
          expect([second.entries, second.replaced]).toEqual([[], []]);
          expect(applyExchangeImport(drawn.entries, second, NOW)).toEqual({
            entries: drawn.entries,
            added: 0,
            replaced: 0,
            refused: null,
          });
        }),
        TWICE,
      );
    },
    TIMEOUT,
  );

  it(
    "a prefix of a file's rows, written, then the whole file leaves the Log with the live ids and units per coin one import leaves",
    () => {
      fc.assert(
        fc.property(world, fc.nat(), (drawn, cut) => {
          const { oneLog, twoLog } = twoWays(drawn, cut);
          expect(ids(live(twoLog))).toEqual(ids(live(oneLog)));
          expect(unitsPerCoin(live(twoLog))).toEqual(unitsPerCoin(live(oneLog)));
        }),
        TWICE,
      );
    },
    TIMEOUT,
  );

  it(
    'the whole file unticked, written, then ticked leaves the Log one ticked import leaves',
    () => {
      fc.assert(
        fc.property(world, (drawn) => {
          const after = write(drawn.entries, run(drawn, drawn.entries, drawn.file, false));
          const yes = run(drawn, after, drawn.file, true);
          const ticked = run(drawn, drawn.entries, drawn.file, true);
          expect(ids(live(write(after, yes)))).toEqual(ids(live(write(drawn.entries, ticked))));
        }),
        TWICE,
      );
    },
    TIMEOUT,
  );

  it(
    'a purchase a hand entry records, or one dated on or before a hand `held` entry of its coin unticked, is never written, in one import or two',
    () => {
      fc.assert(
        fc.property(world, fc.nat(), fc.boolean(), (drawn, cut, addHeld) => {
          const { once, first, then } = twoWays({ ...drawn, addHeld }, cut);
          const known = new Set(drawn.entries.map((entry) => entry.id));
          const recorded = once.recorded.flatMap(({ coin, date: recordedOn, entry }) =>
            drawn.file.movements
              .filter(
                (movement) =>
                  movement.coin === coin &&
                  WRITE.dateOf(movement.at) === recordedOn &&
                  movement.role === (entry.kind === 'sell' ? 'sale' : 'purchase') &&
                  !known.has(importId(movement.key)),
              )
              .map((movement) => importId(movement.key)),
          );
          const added = [...once.entries, ...first.entries, ...then.entries];
          const stored = new Set(ids(added));
          expect(recorded.filter((id) => stored.has(id))).toEqual([]);
          const through = new Map<string, CalendarDate>();
          for (const entry of live(drawn.entries)) {
            const latest = through.get(entry.coin);
            if (entry.kind === 'held' && entry.source !== 'import-csv' && (latest === undefined || latest < entry.date))
              through.set(entry.coin, entry.date);
          }
          const leaked = added.filter(
            (entry) => entry.kind !== 'sell' && entry.date <= (through.get(entry.coin) ?? ''),
          );
          expect(addHeld ? [] : leaked).toEqual([]);
        }),
        TWICE,
      );
    },
    TIMEOUT,
  );
});

const LATE = instant('2030-01-01T00:00:00Z');
const CLOCKS = [instant('2020-01-01T00:00:00Z'), NOW, LATE];

describe('applyExchangeImport', () => {
  it(
    'tombstones every replaced estimate at stampAfter(now, its updatedAt), after the stored row with a clock behind, and keeps every other field',
    () => {
      fc.assert(
        fc.property(world, fc.constantFrom(...CLOCKS), (drawn, now) => {
          const plan = run(drawn, drawn.entries, drawn.file);
          const result = applyExchangeImport(drawn.entries, plan, now);
          const replaced = new Set(plan.replaced.flatMap((item) => item.estimates.map((estimate) => estimate.id)));
          const byId = new Map(result.entries.map((entry) => [entry.id, entry]));
          for (const stored of drawn.entries) {
            const after = byId.get(stored.id);
            if (!replaced.has(stored.id)) expect(after).toBe(stored);
            else {
              const stamp = stampAfter(now, stored.updatedAt);
              expect(after).toEqual({ ...stored, deletedAt: stamp, updatedAt: stamp });
              expect(compareInstants(stamp, stored.updatedAt)).toBe(1);
            }
          }
          expect(result.entries.slice(drawn.entries.length)).toEqual(plan.entries);
          expect([result.added, result.replaced]).toEqual([plan.entries.length, replaced.size]);
        }),
        ONCE,
      );
    },
    SHORT,
  );

  it(
    'a refused apply leaves the stored entries as they were and counts nothing',
    () => {
      fc.assert(
        fc.property(world, (drawn) => {
          const before = structuredClone(drawn.entries);
          const plan = run(drawn, drawn.entries, drawn.file);
          const bad = { ...drawn.entries[0], id: importId('bad'), kind: 'gift' } as unknown as Entry;
          const result = applyExchangeImport(drawn.entries, { ...plan, entries: [...plan.entries, bad] }, NOW);
          expect(result).toEqual({
            entries: drawn.entries,
            added: 0,
            replaced: 0,
            refused: { code: 'invalid-entries', ids: [bad.id] },
          });
          expect(result.entries).toBe(drawn.entries);
          expect(drawn.entries).toEqual(before);
        }),
        ONCE,
      );
    },
    SHORT,
  );
});

describe('sameImport', () => {
  it(
    'ignores the entries’ updatedAt and nothing else: any other field, an entry or an estimate to tombstone differs',
    () => {
      fc.assert(
        fc.property(world, fc.nat(), fc.nat(), (drawn, pick, field) => {
          const plan = run(drawn, drawn.entries, drawn.file);
          const restamped = { ...plan, entries: plan.entries.map((entry) => ({ ...entry, updatedAt: NOW })) };
          const later = { ...plan, entries: plan.entries.map((entry) => ({ ...entry, updatedAt: LATE })) };
          expect(sameImport(plan, plan)).toBe(true);
          expect(sameImport(restamped, later)).toBe(true);
          const entry = plan.entries[pick % Math.max(plan.entries.length, 1)];
          if (entry === undefined) return;
          const keys = Object.keys(entry).filter((key) => key !== 'updatedAt');
          const key = keys[field % keys.length] as string;
          const changed = plan.entries.map((each) => (each === entry ? { ...each, [key]: 'changed' } : each));
          expect(sameImport(plan, { ...plan, entries: changed })).toBe(false);
          expect(sameImport(plan, { ...plan, entries: plan.entries.filter((each) => each !== entry) })).toBe(false);
          const [first, ...rest] = plan.replaced;
          if (first === undefined) return;
          const fewer = [{ ...first, estimates: first.estimates.slice(1) }, ...rest];
          expect(sameImport(plan, { ...plan, replaced: fewer })).toBe(false);
        }),
        ONCE,
      );
    },
    SHORT,
  );
});
