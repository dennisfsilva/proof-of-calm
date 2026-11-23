import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type World, world } from '../../../test/exchange/plan-arbitraries';
import { coverCut, excepted, withoutExcepted } from '../../../test/exchange/plan-cover';
import { LISBON, NOW } from '../../../test/exchange/plan-fixture';
import { lumpCut, partOf, splitsLumpDay, withLumpCut } from '../../../test/exchange/plan-late';
import { type CalendarDate, daysBetween } from '../../dates/calendar';
import { compare, type Money } from '../../money/decimal';
import { portfolio } from '../../portfolio/portfolio';
import type { Entry } from '../../schema/entry';
import type { ExchangeFile } from './kraken';
import { type ExchangeImportPlan, planExchangeImport } from './plan';

// docs/DOMAIN.md §3.13 step 2's export cut at `splitsLumpDay`'s width, the cuts the other import properties skip: a
// shorter export that cuts inside a purchase date of a coin within 3 days of a live `lump` of it, stored before the
// whole file, leaves the Log one import leaves plus the purchases the shorter export stored of the purchase dates a
// hand entry, or a live one-tap `lump`, claims in one import (with the one-tap estimates they replace), less the
// purchases of the dates a hand entry, or a live one-tap `lump`, that falls back to its nearest date (an extra buy, a
// monthly buy whose month has no date, a `lump` at its coin's monthly part, hand or one-tap) claims in the second
// import instead (with those dates' estimates left live). Each
// such date of a `lump` above the monthly part is the cut date; below it, it lies wholly in the shorter export while
// that export's `lump` claimed the cut date's part or stopped its walk at that part, every date it claimed nearer its
// date than the cut date, or as near and earlier (CI's world of 2026-11-15, seed -1110155515, pinned in
// plan-remedy-start.test.ts: "the lump stops at the cut date"). Measured on 2026-11-15 over seeds 1 to 8, CI's and 16
// others, 600 runs each: 541 such dates below the part, 538 with the cut date claimed, 3 with the walk stopped there.
// The lump's own walk claims what it claims in one import, since stored dates take their place in its order and sum;
// no generated world reaches the fallback case, which plan-remedy-start.test.ts pins three times: an extra buy
// ("400 less"), a lump at the part ("a second lump beside the lump of 1,000") and a one-tap lump at the part
// ("a one-tap lump beside the lump of 1,000"); the oracle's `gone` holds for each. A hand sale claims sales only,
// never a date's purchases: until 2026-11-15 the oracle keyed a sale's claim as a purchase date's,
// and seed -605869711 drew the one world of 30,000 that tells them apart (seeds 1 to 8, CI's two and 40 random seeds,
// 600 runs each, measured that day); keyed by role, the oracle meets the Log in all 30,000.

/** What the write does with a plan: tombstones the estimates it replaces and adds its entries. */
function store(entries: readonly Entry[], plan: ExchangeImportPlan): Entry[] {
  const replaced = new Set(plan.replaced.flatMap((replacement) => replacement.estimates.map((entry) => entry.id)));
  return [...entries.map((entry) => (replaced.has(entry.id) ? { ...entry, deletedAt: NOW } : entry)), ...plan.entries];
}

const run = (drawn: World, entries: readonly Entry[], file: ExchangeFile) =>
  planExchangeImport(file, { plan: drawn.plan, entries }, { addHeld: drawn.addHeld, venue: drawn.venue }, LISBON);

/** Invested and each coin's units held, as Portfolio shows them. */
const held = (drawn: World, entries: readonly Entry[]) => {
  const shown = portfolio(drawn.plan, entries);
  return { invested: shown.invested, units: shown.positions.map((position) => [position.coin, position.units]) };
};

/**
 * Each coin and purchase date a hand entry, or a live one-tap `lump`, claims in `plan`, with that entry; a hand sale's
 * dates are its sales' (CI's world of 2026-11-15, pinned in plan-remedy-start.test.ts: "a hand sale's date").
 */
function claimsOf(plan: ExchangeImportPlan) {
  const claims = new Map<string, Entry>();
  for (const item of plan.recorded.filter((each) => each.entry.kind !== 'sell')) {
    for (const day of item.dates) claims.set(`${item.coin}|${day}`, item.entry);
  }
  return claims;
}

/** The coin and date of each purchase date the shorter export holds some but not all of. */
function cutDays(file: ExchangeFile, shorter: ExchangeFile) {
  const kept = new Set(shorter.movements.map((movement) => movement.key));
  const groups = new Map<string, boolean[]>();
  for (const movement of file.movements.filter((each) => each.role === 'purchase')) {
    const key = `${movement.coin}|${LISBON.dateOf(movement.at)}`;
    groups.set(key, [...(groups.get(key) ?? []), kept.has(movement.key)]);
  }
  return new Set([...groups].filter(([, inside]) => inside.includes(true) && inside.includes(false)).map(([k]) => k));
}

/**
 * The property runs 600 times with a 90 s timeout (the core's default is Vitest's 5 s). Measured on 2026-11-14 under
 * the full core suite with coverage, seeds 1 to 8 (fast-check's global seed): the worst was 3.71 s (seed 8; the best
 * 2.94 s, seed 1), so six times the worst, the margin budgeted for CI's slower runner, is 22.3 s, under a third of the
 * timeout (30 s). Measured again on 2026-11-15 after a `lump` walks by the ratio (rule G), seeds 1 to 8: the worst was
 * 4.11 s (seed 5; the best 3.46 s, seed 1), six times it 24.7 s, under 30 s.
 *
 * The rarest outcomes it counts, `twice` or `instead` on one side of the cut, come about 9 to 12 times in 600 runs, so
 * a random seed can draw none: CI's seed of 2026-11-16 did (issue #297), and of seeds 1 to 30,000, 600 runs each,
 * seed 11793 drew none above the part in a slice and seed 26596 none below it at `begins`. So the property keeps
 * fast-check's global seed in the first `it`, and the second runs it again at `REACH_SEED`, the seed of the 30,000
 * whose rarest counted outcome comes most often (14 times), and checks there that each is reached. A change to the
 * generators or to the import that leaves one unreached fails there on every run, never by chance; scan the seeds
 * again then. Measured on 2026-11-16 under the full core suite with coverage, seeds 1 to 8: the first `it`'s worst
 * was 4.26 s (seed 8; the best 3.33 s, seed 5), six times it 25.6 s, and the second's worst 3.82 s, six times it
 * 22.9 s, each under 30 s.
 */
const RUNS = { numRuns: 600 };
const TIMEOUT = 90_000;
const REACH_SEED = 7594;

/** The property, counting into `reach` each outcome drawn by the lump's size against the part and the cut's side. */
const property = (reach: Map<string, number>) =>
  fc.property(world, lumpCut, (base, drawnCut) => {
    const cut = withLumpCut(base, drawnCut);
    fc.pre(cut !== null);
    const { drawn, shorter, lump, part } = cut;
    const once = run(drawn, drawn.entries, drawn.file);
    const first = run(drawn, drawn.entries, shorter);
    const after = store(drawn.entries, first);
    const then = run(drawn, after, drawn.file);
    const twice = store(after, then);
    // Each date a hand entry claims in one import of the whole file, and each it claims in the second import.
    const claims = claimsOf(once);
    const claims2 = claimsOf(then);
    const on = (keys: Map<string, Entry>, entry: Entry) =>
      (entry.kind === 'dca' || entry.kind === 'extra') && keys.has(`${entry.coin}|${entry.date}`);
    const doubled = first.entries.filter((entry) => on(claims, entry));
    const gone = once.entries.filter((entry) => on(claims2, entry) && !on(claims, entry));
    // The one-tap estimates the doubled purchases replaced are tombstoned too; those only the gone ones replaced stay
    // live.
    const ids = new Set(doubled.map((entry) => entry.id));
    const goneIds = new Set(gone.map((entry) => entry.id));
    const kept = {
      ...once,
      entries: once.entries.filter((entry) => !goneIds.has(entry.id)),
      replaced: once.replaced.filter((group) => group.by.some((id) => !goneIds.has(id))),
    };
    const swapped = first.replaced.filter((group) => group.by.some((id) => ids.has(id)));
    const plus = store(store(drawn.entries, kept), { ...first, entries: doubled, replaced: swapped });
    // DOMAIN §3.13 step 5's one exception: a sale the shorter export stores on another import's entry (plan-cover.ts).
    const out = coverCut(drawn.entries, drawn.file, first, once);
    expect(held(drawn, withoutExcepted(twice, out))).toEqual(held(drawn, plus));
    if (gone.length > 0) expect(doubled.length).toBeGreaterThan(0);
    const cuts = cutDays(drawn.file, shorter);
    for (const entry of doubled) {
      const key = `${entry.coin}|${entry.date}`;
      const claimer = claims.get(key) as Entry;
      expect(splitsLumpDay(drawn, shorter.movements)).toBe(true);
      if (claimer.kind !== 'lump') continue;
      const above = compare(claimer.amount as Money, partOf(drawn.plan, drawn.plan.monthlyAmount, claimer.coin)) > 0;
      if (above) expect(cuts.has(key)).toBe(true);
      else {
        const short = first.recorded.find((item) => item.entry.id === claimer.id)?.dates ?? [];
        expect(cuts.has(key)).toBe(false);
        // The shorter export's lump claimed the cut date, or every date it claimed comes before it in its walk.
        const far = (each: CalendarDate) => Math.abs(daysBetween(claimer.date, each));
        const reached = (day: CalendarDate) =>
          short.includes(day) ||
          (short.length > 0 && short.every((each) => far(each) < far(day) || (far(each) === far(day) && each < day)));
        const days = [...cuts].filter((each) => each.startsWith(`${claimer.coin}|`));
        expect(days.some((each) => reached(each.slice(each.indexOf('|') + 1) as CalendarDate))).toBe(true);
      }
    }
    const size = compare(lump.amount as Money, part);
    const outcome = doubled.length === 0 ? 'equal' : gone.length === 0 ? 'twice' : 'instead';
    const label = `${size > 0 ? 'above' : size < 0 ? 'below' : 'part'}|${drawnCut.side}|${outcome}`;
    reach.set(label, (reach.get(label) ?? 0) + 1);
  });

describe("planExchangeImport, an export cut at a lump's date", () => {
  it(
    "a shorter export, then the whole file: one import's Log, plus the stored purchases of its claimed dates, less those claimed instead",
    () => {
      excepted.worlds = 0;
      fc.assert(property(new Map()), RUNS);
      expect(excepted.worlds).toBeLessThan(RUNS.numRuns / 10);
    },
    TIMEOUT,
  );

  it(
    `at seed ${REACH_SEED}, each side of the cut, above and below the part, reaches both outcomes`,
    () => {
      const reach = new Map<string, number>();
      excepted.worlds = 0;
      fc.assert(property(reach), { ...RUNS, seed: REACH_SEED });
      // A slice below the part diverges rarely; `instead`, a fallback claim moved, a hand entry's or a live one-tap
      // `lump`'s, is checked when reached and pinned by hand.
      const count = (pattern: RegExp) =>
        [...reach].filter(([label]) => pattern.test(label)).reduce((total, [, n]) => total + n, 0);
      for (const size of ['above', 'below']) {
        for (const side of ['ends', 'begins', 'slice']) {
          expect(count(new RegExp(`^${size}\\|${side}\\|equal$`))).toBeGreaterThan(0);
          if (size === 'above' || side !== 'slice') {
            expect(count(new RegExp(`^${size}\\|${side}\\|(twice|instead)$`))).toBeGreaterThan(0);
          }
        }
      }
      expect(count(/^below\|.*\|twice$/)).toBeGreaterThan(0);
      expect(excepted.worlds).toBeLessThan(RUNS.numRuns / 10);
    },
    TIMEOUT,
  );
});
