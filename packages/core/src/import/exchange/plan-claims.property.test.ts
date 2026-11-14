import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, date, money, month } from '../../../test/builders';
import { fileOf, heldGuards, startingGuards, type World, world } from '../../../test/exchange/plan-arbitraries';
import { LISBON, NOW, testId, trade } from '../../../test/exchange/plan-fixture';
import { addDays, clampDay } from '../../dates/calendar';
import type { Entry } from '../../schema/entry';
import type { ExchangeFile, Movement } from './kraken';
import { type ExchangeImportPlan, planExchangeImport } from './plan';

// Steps 2 to 6 of the exchange import's plan (docs/DOMAIN.md §3.13) over generated files and Logs: any window
// of a file's rows, stored before the whole file, leaves the Log one import leaves, field by field; no purchase step 3
// or step 4 leaves out is stored, in one import or two; two exchanges' files leave one Log in either order; and no
// purchase a hand monthly buy claims in one import is stored in two.

/** What the write does with a plan: tombstones the estimates it replaces and adds its entries. */
function store(entries: readonly Entry[], plan: ExchangeImportPlan): Entry[] {
  const replaced = new Set(plan.replaced.flatMap((replacement) => replacement.estimates.map((entry) => entry.id)));
  return [...entries.map((entry) => (replaced.has(entry.id) ? { ...entry, deletedAt: NOW } : entry)), ...plan.entries];
}

const run = (drawn: World, entries: readonly Entry[], file: ExchangeFile) =>
  planExchangeImport(file, { plan: drawn.plan, entries }, { addHeld: drawn.addHeld, venue: drawn.venue }, LISBON);

/** A Log as the person sees it: the live entries in every field but `updatedAt`, and the tombstoned ids. */
const seen = (entries: readonly Entry[]) => ({
  live: entries
    .filter((entry) => entry.deletedAt === null)
    .map(({ updatedAt: _, ...rest }) => rest)
    .sort((a, b) => (a.id < b.id ? -1 : 1)),
  tombstoned: entries
    .filter((entry) => entry.deletedAt !== null)
    .map((entry) => entry.id)
    .sort(),
});

/** A window of the file's rows: a prefix, a suffix or a middle, cut at an instant or on whole Lisbon days. */
const windowOf = fc.record({
  shape: fc.constantFrom('prefix', 'suffix', 'middle'),
  byDay: fc.boolean(),
  from: fc.nat(),
  to: fc.nat(),
});
type Drawn<T> = T extends fc.Arbitrary<infer U> ? U : never;
function cut(file: ExchangeFile, { shape, byDay, from, to }: Drawn<typeof windowOf>) {
  const keyOf = (movement: Movement) => (byDay ? LISBON.dateOf(movement.at) : movement.at);
  const keys = [...new Set(file.movements.map(keyOf))].sort();
  const [lo, hi] = [keys[from % (keys.length + 1)] ?? '~', keys[to % (keys.length + 1)] ?? '~'].sort();
  const inside = (key: string) =>
    (shape === 'prefix' || key >= (lo as string)) && (shape === 'suffix' || key <= (hi as string));
  return fileOf(file.movements.filter((movement) => inside(keyOf(movement))));
}

/**
 * The properties run 300 times with a 60 s timeout each (the core's default is Vitest's 5 s). Measured on 2026-11-14
 * under the full core suite with coverage, seeds 1 to 8 (fast-check's global seed), twice: the worst was 1.01 s (the
 * window property, seed 5; the two exchanges 0.72 s, the hand claims 0.31 s), so six times the worst, the margin
 * budgeted for CI's slower runner, is 6.1 s, under a third of the timeout (20 s).
 */
const RUNS = { numRuns: 300 };
const TIMEOUT = 60_000;

describe('planExchangeImport, by windows and by exchanges', () => {
  it(
    'a window of the file, stored, then the whole file leaves the Log one import leaves, and a third import adds nothing',
    () => {
      fc.assert(
        fc.property(world, windowOf, (drawn, window) => {
          const once = store(drawn.entries, run(drawn, drawn.entries, drawn.file));
          const first = store(drawn.entries, run(drawn, drawn.entries, cut(drawn.file, window)));
          const twice = store(first, run(drawn, first, drawn.file));
          expect(seen(twice)).toEqual(seen(once));
          const third = run(drawn, twice, drawn.file);
          expect([third.entries, third.replaced]).toEqual([[], []]);
        }),
        RUNS,
      );
    },
    TIMEOUT,
  );

  /** What one import, and a window of the file stored before the whole file, add with `held` left unticked. */
  const added = (drawn: World, window: Drawn<typeof windowOf>) => {
    const unticked = { ...drawn, addHeld: false };
    const once = run(unticked, drawn.entries, drawn.file);
    const first = run(unticked, drawn.entries, cut(drawn.file, window));
    const then = run(unticked, store(drawn.entries, first), drawn.file);
    return [...once.entries, ...first.entries, ...then.entries];
  };

  it(
    'no purchase on or before a live hand `held` entry of its coin with at least its units, that cost not 0, is stored unticked, in one import or two',
    () => {
      fc.assert(
        fc.property(world, windowOf, (drawn, window) => {
          expect(added(drawn, window).filter((entry) => heldGuards(drawn.entries, entry))).toEqual([]);
        }),
        RUNS,
      );
    },
    TIMEOUT,
  );

  it(
    'no purchase on or before `firstBuy` + 15 days is stored in a plan with a starting amount, in one import or two',
    () => {
      fc.assert(
        fc.property(world, windowOf, (drawn, window) => {
          const leaked = added(drawn, window).filter((entry) => startingGuards(drawn.plan, drawn.entries, entry));
          expect(leaked).toEqual([]);
        }),
        RUNS,
      );
    },
    TIMEOUT,
  );

  it(
    'a Kraken file and a Trade Republic file leave one Log in either order',
    () => {
      fc.assert(
        fc.property(world, fc.array(fc.boolean(), { maxLength: 30 }), (drawn, sides) => {
          const split = (side: boolean) => drawn.file.movements.filter((_, index) => (sides[index] ?? false) === side);
          const kraken = fileOf(split(false));
          const rekeyed = split(true).map((movement) => ({
            ...movement,
            key: movement.key.replace('|kraken|', '|trade-republic|'),
          }));
          const tr: ExchangeFile = { ...fileOf(rekeyed), exchange: 'trade-republic' };
          const then = (a: ExchangeFile, b: ExchangeFile) => {
            const after = store(drawn.entries, run(drawn, drawn.entries, a));
            return store(after, run(drawn, after, b));
          };
          expect(seen(then(tr, kraken))).toEqual(seen(then(kraken, tr)));
        }),
        RUNS,
      );
    },
    TIMEOUT,
  );

  const AMOUNTS = ['5.47', '49.92', '49.94', '50', '60', '90', '30', '100'];
  const claimed = fc.record({
    buyDay: fc.constantFrom(1, 15),
    slot: fc.integer({ min: 3, max: 11 }),
    typed: fc.integer({ min: -5, max: 20 }),
    amount: fc.constantFrom(...AMOUNTS),
    fills: fc.array(fc.record({ offset: fc.integer({ min: -14, max: 14 }), amount: fc.constantFrom(...AMOUNTS) }), {
      minLength: 1,
      maxLength: 4,
    }),
    cut: fc.nat(),
  });
  type Claimed = Drawn<typeof claimed>;
  // P2: €100 typed for March at buy day 15, executions on 2 and 16 Mar; P1: €50 typed on 2 Apr, 31 Mar's Saveback
  // and 2 Apr's execution; the audit: €100 typed on 11 Oct, €60, €90 and €30 on the 11th, 12th and 13th.
  const P2: Claimed = {
    buyDay: 15,
    slot: 3,
    typed: 0,
    amount: '100',
    fills: [
      { offset: -13, amount: '49.93' },
      { offset: 1, amount: '49.93' },
    ],
    cut: 1,
  };
  const P1: Claimed = {
    buyDay: 1,
    slot: 4,
    typed: 1,
    amount: '50',
    fills: [
      { offset: -1, amount: '5.47' },
      { offset: 1, amount: '49.93' },
    ],
    cut: 1,
  };
  const AUDIT: Claimed = {
    buyDay: 1,
    slot: 10,
    typed: 10,
    amount: '100',
    fills: [
      { offset: 10, amount: '60' },
      { offset: 11, amount: '90' },
      { offset: 12, amount: '30' },
    ],
    cut: 2,
  };

  it(
    'no purchase a hand monthly buy claims in one import is stored in two',
    () => {
      fc.assert(
        fc.property(claimed, ({ buyDay, slot, typed, amount, fills, cut: at }) => {
          const plan = aPlan({ buyDay, firstBuy: date('2026-02-01'), lastBuy: date('2026-12-01') });
          const due = clampDay(2026, slot, buyDay);
          const key = month(`2026-${String(slot).padStart(2, '0')}`);
          const hand = anEntry({ slot: key, date: addDays(due, typed), amount: money(amount), note: 'H' });
          const movements = fills
            .map((each, n) =>
              trade(
                `W${n}`,
                'purchase',
                'BTC',
                addDays(due, each.offset),
                {
                  units: '0.0008',
                  amount: each.amount,
                  fee: '0.50',
                },
                2 + 2 * n,
              ),
            )
            .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
          const drawn: World = { plan, file: fileOf(movements), addHeld: false, venue: null, entries: [hand] };
          const once = run(drawn, [hand], drawn.file);
          const first = run(drawn, [hand], fileOf(movements.slice(0, at % (movements.length + 1))));
          const then = run(drawn, store([hand], first), drawn.file);
          const dates = new Set(once.recorded.flatMap((each) => each.dates));
          const taken = movements.filter((each) => dates.has(LISBON.dateOf(each.at))).map((each) => testId(each.key));
          const stored = new Set([...once.entries, ...first.entries, ...then.entries].map((entry) => entry.id));
          expect(taken.filter((id) => stored.has(id))).toEqual([]);
          expect(seen(store(store([hand], first), then))).toEqual(seen(store([hand], once)));
        }),
        { ...RUNS, examples: [[P2], [P1], [AUDIT]] },
      );
    },
    TIMEOUT,
  );
});
