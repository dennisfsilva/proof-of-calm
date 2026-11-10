import { compare, max, min, minus, sum, type Units } from '../money/decimal';
import { liveEntries } from '../plan/statuses';
import { defined } from '../result';
import type { Entry } from '../schema/entry';
import type { CoinId } from '../schema/ids';
import { unitsIn, unitsOut } from './effect';
import { runningHeld } from './lots';

/** A step of a coin and the units it takes (a sale's units, a move's fee), with the units it finds before it. */
export type Step = { readonly entry: Entry; readonly held: Units; readonly out: Units };

/**
 * A step with its shortfalls: the units it takes beyond the units held just before it (`runningHeld`), and beyond what
 * all the coin's purchases, whatever their dates, leave once the steps before it took theirs (`left`).
 */
type Shortfall = Step & { readonly left: Units; readonly byDate: Units; readonly inTotal: Units };

const ZERO = '0' as Units;

/**
 * The coin's steps in the matching order with their shortfalls. Their `byDate` add up to `matchLots`' `unmatchedUnits`
 * (one global queue), their `inTotal` to the units taken beyond all the coin's purchases.
 */
export function shortfalls(entries: readonly Entry[], coin: CoinId): Shortfall[] {
  let held = ZERO;
  let total = sum(
    liveEntries(entries)
      .filter((entry) => entry.coin === coin)
      .map(unitsIn),
  );
  return runningHeld(entries, coin).map((step) => {
    const out = unitsOut(step.entry);
    const left = max(total, ZERO);
    const byDate = max(minus(out, held), ZERO);
    const short = { entry: step.entry, held, out, left, byDate, inTotal: max(minus(out, left), ZERO) };
    held = step.held;
    total = minus(total, out);
    return short;
  });
}

/**
 * The step a write left worse covered: the first of `after` whose shortfall by date is larger than the same entry's in
 * `before` (0 for an entry not in it), with the units held before it; when none is, the first whose shortfall in total
 * is, with the fewer of the units held before it and the units all purchases leave it, so it always takes more than
 * it finds. Throws when neither is: the caller asks only once the write left the coin worse covered (`worseCovered`).
 */
export function firstMadeWorse(before: readonly Shortfall[], after: readonly Shortfall[]): Step {
  const was = new Map(before.map((step) => [step.entry.id, step]));
  const worse = (key: 'byDate' | 'inTotal') =>
    after.find((step) => compare(step[key], was.get(step.entry.id)?.[key] ?? ZERO) > 0);
  const byDate = worse('byDate');
  if (byDate !== undefined) return byDate;
  const inTotal = defined(worse('inTotal'), 'a step the write left worse covered');
  return { ...inTotal, held: min(inTotal.held, inTotal.left) };
}
