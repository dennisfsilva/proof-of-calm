import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fileOf, type World, world } from '../../../test/exchange/plan-arbitraries';
import { BERLIN, LISBON, NOW, testId } from '../../../test/exchange/plan-fixture';
import { addDays, type CalendarDate } from '../../dates/calendar';
import { sum } from '../../money/decimal';
import { slotStatuses } from '../../plan/statuses';
import { type Entry, EntrySchema, writtenEntryVersion } from '../../schema/entry';
import type { ExchangeFile } from './kraken';
import { type ExchangeImportPlan, type ImportChoices, type ImportContext, planExchangeImport } from './plan';

// The exchange import's plan (docs/DOMAIN.md §3.13) over generated files and Logs: storing a plan's entries and
// planning again adds nothing, an import in two parts leaves the Log one import leaves, the person's answer to the
// `held` question can come later, and nothing but an estimate is touched.

const choicesOf = ({ addHeld, venue }: { addHeld: boolean; venue: string | null }): ImportChoices => ({
  addHeld,
  venue,
});

/** What the write does with a plan: tombstones the estimates it replaces and adds its entries. */
function store(entries: readonly Entry[], plan: ExchangeImportPlan): Entry[] {
  const replaced = new Set(plan.replaced.flatMap((replacement) => replacement.estimates.map((entry) => entry.id)));
  return [...entries.map((entry) => (replaced.has(entry.id) ? { ...entry, deletedAt: NOW } : entry)), ...plan.entries];
}

const ids = (entries: readonly Entry[]) => entries.map((entry) => entry.id).sort();
const live = (entries: readonly Entry[]) => entries.filter((entry) => entry.deletedAt === null);
const unitsPerCoin = (entries: readonly Entry[]) =>
  Object.fromEntries(
    ['BTC', 'ETH', 'SOL'].map((coin) => [
      coin,
      sum(entries.filter((entry) => entry.coin === coin).map((e) => e.units)),
    ]),
  );

const run = (
  drawn: World,
  entries: readonly Entry[],
  movements: ExchangeFile,
  addHeld = drawn.addHeld,
  context: ImportContext = LISBON,
) => planExchangeImport(movements, { plan: drawn.plan, entries }, choicesOf({ ...drawn, addHeld }), context);

/** One import of the whole file, and a prefix of its rows stored before the whole file. */
function twoWays(drawn: World, cut: number) {
  const prefix = fileOf(drawn.file.movements.slice(0, cut % (drawn.file.movements.length + 1)));
  const once = run(drawn, drawn.entries, drawn.file);
  const first = run(drawn, drawn.entries, prefix);
  const after = store(drawn.entries, first);
  const then = run(drawn, after, drawn.file);
  return { once, first, then, oneLog: store(drawn.entries, once), twoLog: store(after, then) };
}

/**
 * The two-import properties run 1,500 times with a 60 s timeout each (the core's default is Vitest's 5 s). Measured
 * on 2026-11-13 under the full core suite with coverage, seeds 1 to 8: 1.7 to 2.8 s locally per property (the first
 * one is the slowest every time; the generators' sizes are bounded and no seed stands out). At 2,000 runs the worst
 * was 3.6 s, and main's CI run 43454846094 timed out at the old 20 s on that property, so CI's runner was at least
 * 5.6 times slower there; how much slower it can be is not measured. At 1,500 runs, 60 s holds while CI is under 21
 * times slower than 2.8 s, and stays over three times CI's time while CI is under 7 times slower, the margin budgeted
 * for (×6). On the old order (a9664cfd), seeds 1 to 8 at 1,500 runs catch it 7 times in the prefix-adds property
 * (seed 2 first fails at run 2,026), 8 in the live-Log one and 8 in the `held` one (each by run 54).
 */
const TWICE = { numRuns: 1500 };
const TIMEOUT = 60_000;

describe('planExchangeImport', () => {
  it('a second plan after its entries are stored adds nothing and replaces nothing', () => {
    fc.assert(
      fc.property(world, (drawn) => {
        const first = run(drawn, drawn.entries, drawn.file);
        const second = run(drawn, store(drawn.entries, first), drawn.file);
        expect([second.entries, second.replaced]).toEqual([[], []]);
      }),
    );
  });

  it(
    "a prefix of a file's rows, stored, then the whole file adds the ids and units per coin the whole file adds at once",
    () => {
      fc.assert(
        fc.property(world, fc.nat(), (drawn, cut) => {
          const { once, first, then } = twoWays(drawn, cut);
          const twice = [...first.entries, ...then.entries];
          expect(ids(twice)).toEqual(ids(once.entries));
          expect(unitsPerCoin(twice)).toEqual(unitsPerCoin(once.entries));
        }),
        TWICE,
      );
    },
    TIMEOUT,
  );

  it(
    "a prefix of a file's rows, stored, then the whole file leaves the Log with the live ids and units per coin one import leaves",
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
    'the whole file unticked, stored, then ticked leaves the Log one ticked import leaves',
    () => {
      fc.assert(
        fc.property(world, (drawn) => {
          const after = store(drawn.entries, run(drawn, drawn.entries, drawn.file, false));
          const yes = run(drawn, after, drawn.file, true);
          const ticked = run(drawn, drawn.entries, drawn.file, true);
          expect(ids(live(store(after, yes)))).toEqual(ids(live(store(drawn.entries, ticked))));
        }),
        TWICE,
      );
    },
    TIMEOUT,
  );

  it(
    'a purchase a hand entry records is never stored, in one import or two',
    () => {
      fc.assert(
        fc.property(world, fc.nat(), (drawn, cut) => {
          const { once, first, then } = twoWays(drawn, cut);
          const known = new Set(drawn.entries.map((entry) => entry.id));
          const recorded = once.recorded.flatMap(({ coin, date: recordedOn, entry }) =>
            drawn.file.movements
              .filter(
                (movement) =>
                  movement.coin === coin &&
                  LISBON.dateOf(movement.at) === recordedOn &&
                  movement.role === (entry.kind === 'sell' ? 'sale' : 'purchase') &&
                  !known.has(testId(movement.key)),
              )
              .map((movement) => testId(movement.key)),
          );
          const stored = new Set(ids([...once.entries, ...first.entries, ...then.entries]));
          expect(recorded.filter((id) => stored.has(id))).toEqual([]);
        }),
        TWICE,
      );
    },
    TIMEOUT,
  );

  it(
    'a purchase dated on or before a hand-recorded `held` entry of its coin is never stored unticked, in one import or two',
    () => {
      fc.assert(
        fc.property(world, fc.nat(), (drawn, cut) => {
          const through = new Map<string, CalendarDate>();
          for (const entry of live(drawn.entries)) {
            const latest = through.get(entry.coin);
            if (entry.kind === 'held' && entry.source !== 'import-csv' && (latest === undefined || latest < entry.date))
              through.set(entry.coin, entry.date);
          }
          const { once, first, then } = twoWays({ ...drawn, addHeld: false }, cut);
          const leaked = [...once.entries, ...first.entries, ...then.entries].filter(
            (entry) => entry.kind !== 'sell' && entry.date <= (through.get(entry.coin) ?? ''),
          );
          expect(leaked).toEqual([]);
        }),
        TWICE,
      );
    },
    TIMEOUT,
  );

  it('no entry but a one-tap monthly estimate is tombstoned, and no hand, `held`, move or imported entry changes', () => {
    fc.assert(
      fc.property(world, (drawn) => {
        const plan = run(drawn, drawn.entries, drawn.file);
        const stored = new Set(drawn.entries.map((entry) => entry.id));
        for (const { estimates } of plan.replaced) {
          for (const entry of estimates) {
            expect([entry.source, entry.kind, entry.deletedAt, drawn.entries.includes(entry)]).toEqual([
              'one-tap',
              'dca',
              null,
              true,
            ]);
          }
        }
        expect(plan.entries.filter((entry) => stored.has(entry.id))).toEqual([]);
      }),
    );
  });

  it("no month that was done, skipped or paused before the plan gets a monthly buy from it, and no month gets two coins' estimates replaced by one coin", () => {
    fc.assert(
      fc.property(world, (drawn) => {
        const plan = run(drawn, drawn.entries, drawn.file);
        const before = new Map(
          slotStatuses(drawn.plan, drawn.entries, LISBON.today).map((each) => [each.key, each.status]),
        );
        const replacing = new Set(plan.replaced.flatMap((replacement) => replacement.by));
        for (const entry of plan.entries.filter((each) => each.kind === 'dca' && !replacing.has(each.id))) {
          expect(['late', 'due', 'upcoming']).toContain(before.get(entry.slot as never));
        }
        for (const { estimates, by } of plan.replaced) {
          for (const estimate of estimates) {
            for (const entry of plan.entries.filter((each) => by.includes(each.id))) {
              expect([entry.coin, entry.slot]).toEqual([estimate.coin, estimate.slot]);
            }
          }
        }
      }),
    );
  });

  it('every movement and left-out row is counted once', () => {
    fc.assert(
      fc.property(world, (drawn) => {
        const plan = run(drawn, drawn.entries, drawn.file);
        const counted =
          plan.entries.length +
          plan.recorded.reduce((total, each) => total + each.count, 0) +
          (plan.held === null || plan.held.added
            ? 0
            : plan.held.coins.reduce((total, each) => total + each.purchases, 0)) +
          (plan.startingAmount?.purchases ?? 0) +
          plan.imported +
          plan.deleted +
          plan.leftOut.reduce((total, each) => total + each.count, 0) +
          [...plan.withdrawals.logged, ...plan.withdrawals.notLogged].reduce((total, each) => total + each.count, 0);
        expect(counted).toBe(drawn.file.movements.length + drawn.file.leftOut.length);
      }),
    );
  });

  it('every entry passes `EntrySchema` at `writtenEntryVersion` at most 3', () => {
    fc.assert(
      fc.property(world, (drawn) => {
        for (const entry of run(drawn, drawn.entries, drawn.file).entries) {
          expect(EntrySchema.safeParse(entry).success).toBe(true);
          expect(writtenEntryVersion(entry)).toBeLessThanOrEqual(3);
        }
      }),
    );
  });

  it('the ids do not depend on `dateOf`', () => {
    const shifted: ImportContext = { ...LISBON, dateOf: (at) => addDays(BERLIN.dateOf(at), 1) as CalendarDate };
    fc.assert(
      fc.property(world, (drawn) => {
        const keys = new Map(drawn.file.movements.map((movement) => [testId(movement.key), movement.at]));
        for (const context of [LISBON, BERLIN, shifted]) {
          for (const entry of run(drawn, drawn.entries, drawn.file, drawn.addHeld, context).entries) {
            expect(keys.get(entry.id)).toBe(entry.createdAt);
          }
        }
      }),
    );
  });
});
