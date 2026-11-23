import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, date, money, month } from '../../../test/builders';
import { fileOf, heldGuards, type World, world } from '../../../test/exchange/plan-arbitraries';
import { added, BERLIN, LISBON, NOW, testId, trade } from '../../../test/exchange/plan-fixture';
import { preCut, skipped } from '../../../test/exchange/plan-late';
import { addDays, type CalendarDate } from '../../dates/calendar';
import { compare, isPositive, sum } from '../../money/decimal';
import { plannedParts } from '../../plan/parts';
import { slotStatuses } from '../../plan/statuses';
import { type Entry, EntrySchema, isEstimate, writtenEntryVersion } from '../../schema/entry';
import type { ExchangeFile } from './kraken';
import {
  type ExchangeImportPlan,
  type ImportChoices,
  type ImportContext,
  leftOutBefore,
  planExchangeImport,
} from './plan';

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
  preCut(drawn, prefix.movements);
  const once = run(drawn, drawn.entries, drawn.file);
  const first = run(drawn, drawn.entries, prefix);
  const after = store(drawn.entries, first);
  const then = run(drawn, after, drawn.file);
  return { once, first, then, oneLog: store(drawn.entries, once), twoLog: store(after, then) };
}

/** The file in two date ranges, the rows before a Lisbon date and the rest, as a yearly export gives them. */
function ranges(drawn: World, at: number) {
  const dates = [...new Set(drawn.file.movements.map((movement) => LISBON.dateOf(movement.at)))].sort();
  const cut = dates[at % (dates.length + 1)] ?? '9999-12-31';
  const part = (early: boolean) => {
    const movements = drawn.file.movements.filter((movement) => LISBON.dateOf(movement.at) < cut === early);
    preCut(drawn, movements);
    return fileOf(movements);
  };
  return [part(true), part(false)] as const;
}

/**
 * The two-import properties run 1,500 times with a 60 s timeout each (the core's default is Vitest's 5 s). Measured
 * on 2026-11-13 under the full core suite with coverage, seeds 1 to 8: 1.7 to 2.8 s locally per property (the first
 * one is the slowest every time; the generators' sizes are bounded and no seed stands out). At 2,000 runs the worst
 * was 3.6 s, and main's CI run 43454846094 timed out at the old 20 s on that property, so CI's runner was at least
 * 5.6 times slower there; how much slower it can be is not measured. At 1,500 runs, 60 s holds while CI is under 21
 * times slower than 2.8 s, and stays over three times CI's time while CI is under 7 times slower, the margin budgeted
 * for (×6). On the old order (a9664cfd), seeds 1 to 8 at 1,500 runs catch it 7 times in the prefix-adds property
 * (seed 2 first fails at run 2,026), 8 in the live-Log one and 8 in the `held` one (each by run 54). Measured again
 * on 2026-11-14, after the `held` guard reads units, seeds 1 to 8: the worst was 3.27 s (the prefix-adds one, seed
 * 2); six times it, 19.6 s, stays under a third of the timeout (20 s). Measured again the same day, after a monthly
 * buy takes its 3 days only when its month has no date, seeds 1 to 8: the worst was 2.89 s (the prefix-adds one, seed
 * 3); six times it, 17.3 s. Three runs of the whole core suite at random seeds passed. Measured again after a one-tap
 * `lump` claims in step 2 and the generator dates it near the file's dates (90 to 102 of 2,000 worlds reach its claim,
 * 12 to 21 before), seeds 1 to 8: the worst was 2.73 s (the prefix-adds one, seed 4); six times it, 16.4 s. Measured
 * again after a `lump` claims only a date as near its amount as the monthly part, with the generator's lumps of every
 * amount and late starting purchases, seeds 1 to 8: the worst was 3.47 s (the prefix-adds one, seed 7); six times it,
 * 20.8 s, passed a third of 60 s, so the timeout is 90 s (a third of it 30 s).
 */
const TWICE = { numRuns: 1500 };
const TIMEOUT = 90_000;

/** A guard reaches the sale (DOMAIN §3.13, after step 4): the starting amount's 15 days, or a hand `held` entry on or after it. */
function reached({ plan, entries }: World, sale: Entry) {
  const own = live(entries).filter((entry) => entry.coin === sale.coin);
  const starting = isPositive(plan.startingAmount) || own.some((entry) => entry.kind === 'lump');
  return (
    (starting && sale.date <= addDays(plan.firstBuy, 15)) ||
    own.some((entry) => entry.kind === 'held' && entry.source !== 'import-csv' && entry.date >= sale.date)
  );
}
const counts = (entry: Entry, coin: string, on: CalendarDate) =>
  entry.coin === coin &&
  entry.date <= on &&
  ['dca', 'extra', 'lump', 'held'].includes(entry.kind) &&
  !(isEstimate(entry) && entry.kind === 'dca');

/**
 * Each sale of one import judged by DOMAIN §3.13 step 4's cover, worked out from the file, the Log before it and the
 * plan: a reached sale stored whose cover is short, a sale left out whose cover holds it, and a line that is false.
 */
function judged(drawn: World, before: readonly Entry[], file: ExchangeFile, plan: ExchangeImportPlan) {
  const ids = new Set(file.movements.map((movement) => testId(movement.key)));
  const known = new Set([...before, ...plan.entries].map((entry) => entry.id));
  const claims = plan.recorded.flatMap(({ coin, dates, entry }) =>
    dates.map((day) => `${coin}|${entry.kind === 'sell' ? 'sale' : 'purchase'}|${day}`),
  );
  /** F: C's earliest purchase or receipt this file considers and neither stores nor claims in step 2. */
  const from = (coin: string) =>
    file.movements
      .filter(
        (movement) =>
          movement.coin === coin &&
          leftOutBefore(drawn.plan, movement) === null &&
          movement.role !== 'sale' &&
          !known.has(testId(movement.key)) &&
          !claims.includes(`${coin}|${movement.role}|${LISBON.dateOf(movement.at)}`),
      )
      .map((movement) => LISBON.dateOf(movement.at))
      .sort()[0];
  const after = live(store(before, plan));
  const cover = (coin: string, on: CalendarDate) => {
    const f = from(coin);
    const counted = after.filter(
      (entry) =>
        counts(entry, coin, on) &&
        (entry.source !== 'import-csv' || ids.has(entry.id) || f === undefined || entry.date < f),
    );
    return sum(counted.map((entry) => entry.units));
  };
  const line = (coin: string, on: CalendarDate) =>
    sum(
      [...live(before).filter((entry) => entry.source !== 'import-csv'), ...plan.entries]
        .filter((entry) => counts(entry, coin, on))
        .map((entry) => entry.units),
    );
  const sales = plan.entries.filter((sale) => sale.kind === 'sell' && reached(drawn, sale));
  return {
    stored: sales.length,
    out: plan.uncovered.length,
    short: sales.filter((sale) => compare(cover(sale.coin, sale.date), sale.units) < 0),
    covered: plan.uncovered.filter(({ coin, date, units }) => compare(cover(coin, date), units) >= 0),
    false: plan.uncovered.filter(({ coin, date, units }) => compare(line(coin, date), units) >= 0),
  };
}

/**
 * Seed -343831661's world, shrunk (path 1109:414:1:7:2:3:3:3:4:2:2:2:3:2:2:6:5:5:5:5:6:11:11:12:7:12:12): July's buy
 * typed on 27 Apr for €70, 20 Jun stored already; the whole file's walk takes only 20 Jun, and the rows to 18 Jun claim
 * 18 Jun. Main's step 2 (693d6a9e) fell back to 26 Apr only in the whole file, so two imports stored it.
 */
const STORED_WALK: [World, number] = (() => {
  const paid = (ref: string, day: string, amount: string, line: number) =>
    trade(ref, 'purchase', 'BTC', day, { units: '0.0008', amount, fee: '0.50' }, line);
  const J20 = paid('W0620', '2026-06-20', '1121', 6);
  const movements = [paid('W0426', '2026-04-26', '70', 2), paid('W0618', '2026-06-18', '117.50', 4), J20];
  const typed = anEntry({ slot: month('2026-07'), date: date('2026-04-27'), amount: money('70') });
  const plan = aPlan({ firstBuy: date('2026-03-01'), lastBuy: date('2026-12-01') });
  return [
    { plan, file: fileOf(movements), addHeld: false, venue: null, entries: [typed, added(J20, 'extra', null)] },
    2,
  ];
})();

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
      skipped.cuts = 0;
      fc.assert(
        fc.property(world, fc.nat(), (drawn, cut) => {
          const { once, first, then } = twoWays(drawn, cut);
          const twice = [...first.entries, ...then.entries];
          expect(ids(twice)).toEqual(ids(once.entries));
          expect(unitsPerCoin(twice)).toEqual(unitsPerCoin(once.entries));
        }),
        TWICE,
      );
      // A cut at splitsLumpDay's width can count the whole file's claimed date twice (DOMAIN §3.13 step 2), so it is
      // skipped, a few a run; plan-lump-cut.property.test.ts covers it.
      expect(skipped.cuts).toBeLessThan(TWICE.numRuns / 10);
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
        { ...TWICE, examples: [STORED_WALK] },
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
          const recorded = once.recorded.flatMap(({ coin, dates, entry }) =>
            drawn.file.movements
              .filter(
                (movement) =>
                  movement.coin === coin &&
                  dates.includes(LISBON.dateOf(movement.at)) &&
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
    'no purchase on or before a hand-recorded `held` entry of its coin with at least its units, that cost not 0, is stored unticked, in one import or two',
    () => {
      fc.assert(
        fc.property(world, fc.nat(), (drawn, cut) => {
          const { once, first, then } = twoWays({ ...drawn, addHeld: false }, cut);
          const leaked = [...once.entries, ...first.entries, ...then.entries].filter((entry) =>
            heldGuards(drawn.entries, entry),
          );
          expect(leaked).toEqual([]);
        }),
        TWICE,
      );
    },
    TIMEOUT,
  );

  it(
    'a reached sale is stored exactly when its cover holds its units, in one import, a prefix then the whole file, or two date ranges',
    () => {
      const seen = { stored: 0, out: 0 };
      fc.assert(
        fc.property(world, fc.nat(), fc.nat(), (drawn, cut, at) => {
          const { once, first, then } = twoWays(drawn, cut);
          const prefix = fileOf(drawn.file.movements.slice(0, cut % (drawn.file.movements.length + 1)));
          const [early, late] = ranges(drawn, at);
          const one = run(drawn, drawn.entries, early);
          const afterEarly = store(drawn.entries, one);
          const imports = [
            judged(drawn, drawn.entries, drawn.file, once),
            judged(drawn, drawn.entries, prefix, first),
            judged(drawn, store(drawn.entries, first), drawn.file, then),
            judged(drawn, drawn.entries, early, one),
            judged(drawn, afterEarly, late, run(drawn, afterEarly, late)),
          ];
          for (const each of imports) [seen.stored, seen.out] = [seen.stored + each.stored, seen.out + each.out];
          expect(imports.flatMap((each) => [...each.short, ...each.covered, ...each.false])).toEqual([]);
        }),
        TWICE,
      );
      // The generator reaches both sides of the rule.
      expect(seen.stored).toBeGreaterThan(0);
      expect(seen.out).toBeGreaterThan(0);
    },
    TIMEOUT,
  );

  it(
    'ticking the box takes no sale away',
    () => {
      fc.assert(
        fc.property(world, (drawn) => {
          const sales = (addHeld: boolean) =>
            run(drawn, drawn.entries, drawn.file, addHeld)
              .entries.filter((entry) => entry.kind === 'sell')
              .map((entry) => entry.id);
          const ticked = new Set(sales(true));
          expect(sales(false).filter((id) => !ticked.has(id))).toEqual([]);
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

  it("a monthly buy goes to a month of a coin with a share that the plan neither skips nor pauses, or one the Log holds an estimate of the coin for, and no month gets two coins' estimates replaced by one coin", () => {
    fc.assert(
      fc.property(world, (drawn) => {
        const plan = run(drawn, drawn.entries, drawn.file);
        const statuses = new Map(slotStatuses(drawn.plan, [], LISBON.today).map((each) => [each.key, each.status]));
        const shares = new Set(plannedParts(drawn.plan, drawn.plan.monthlyAmount).map((part) => part.coin));
        const tapped = new Set(
          drawn.entries.filter((each) => isEstimate(each) && each.kind === 'dca').map((e) => `${e.coin}|${e.slot}`),
        );
        for (const entry of plan.entries.filter((each) => each.kind === 'dca')) {
          const open = !['skipped', 'paused'].includes(statuses.get(entry.slot as never) as string);
          expect((shares.has(entry.coin) && open) || tapped.has(`${entry.coin}|${entry.slot}`)).toBe(true);
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
          plan.uncovered.length +
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
