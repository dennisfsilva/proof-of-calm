// Step 5 of the exchange import's plan (docs/DOMAIN.md §3.13): the purchase dates that become monthly buys, and the
// one-tap estimates of their months they replace or keep. Pure.
import { compareDates, type MonthKey } from '../../dates/calendar';
import { compare, type Money, max, plus, sum } from '../../money/decimal';
import { plannedParts } from '../../plan/parts';
import type { SlotStatus } from '../../plan/statuses';
import { compareEntries } from '../../portfolio/lots';
import { type Entry, isEstimate } from '../../schema/entry';
import type { CoinId, EntityId } from '../../schema/ids';
import type { Plan } from '../../schema/plan';
import type { Day } from './plan-guards';

/** A coin's live one-tap estimates for a month, and the ids of this import's monthly buys for it. */
export type EstimateGroup = { readonly estimates: readonly Entry[]; readonly by: readonly EntityId[] };

/** The one-tap monthly estimates the Log holds, live or tombstoned, in `compareEntries` order. */
const tapsOf = (entries: readonly Entry[]) =>
  entries.filter((entry) => isEstimate(entry) && entry.kind === 'dca').sort(compareEntries);

type Input = {
  readonly plan: Plan;
  readonly stored: readonly Entry[];
  readonly live: readonly Entry[];
  readonly days: readonly Day[];
  readonly months: readonly SlotStatus[];
  readonly monthOf: (coin: CoinId, date: Day['date']) => MonthKey | undefined;
  readonly add: (day: Day, kind: 'dca', slot: MonthKey, note: string) => readonly EntityId[];
  /** The entries this import has added so far, which `add` grows. */
  readonly added: readonly Entry[];
  /** The live entries this file names for deletion as cancelled (step 1). */
  readonly gone: ReadonlySet<EntityId>;
};

/**
 * "Every unclaimed purchase date of C whose month is S is a monthly buy for S when C's share is above 0 and S is
 * neither skipped nor paused, or when the Log holds a one-tap estimate of C for S, live or tombstoned"; each takes the
 * note of C's first estimate for S in `compareEntries` order. C's live estimates for S are tombstoned only when this
 * import adds a monthly buy of C for S and the exchange-imported monthly buys of C for S, the live ones of any file and
 * this import's, fees excluded, come to at least half the largest of them; otherwise they stay beside the buys. A live
 * buy the file names as cancelled is not counted, so the parts of an export end where the whole file does.
 */
export function fillMonths(input: Input): { replaced: EstimateGroup[]; kept: (EstimateGroup & { imported: Money })[] } {
  const { plan, live, monthOf, add, added, gone } = input;
  const shares = new Set(plannedParts(plan, plan.monthlyAmount).map((part) => part.coin));
  const open = new Set(
    input.months.filter((each) => each.status !== 'skipped' && each.status !== 'paused').map((m) => m.key),
  );
  const taps = tapsOf(input.stored);
  const groups = new Map<string, { estimates: Entry[]; by: EntityId[] }>();
  for (const estimate of live
    .filter((entry) => isEstimate(entry) && entry.kind === 'dca')
    .sort((a, b) => compareDates(a.slot as MonthKey, b.slot as MonthKey) || compareEntries(a, b))) {
    const key = `${estimate.coin}|${estimate.slot}`;
    const group = groups.get(key) ?? { estimates: [], by: [] };
    groups.set(key, group);
    group.estimates.push(estimate);
  }
  for (const day of input.days.filter((each) => !each.claimed && each.role === 'purchase')) {
    const slot = monthOf(day.coin, day.date);
    if (slot === undefined) continue;
    const tapped = taps.filter((tap) => tap.coin === day.coin && tap.slot === slot);
    if (tapped.length === 0 && !(shares.has(day.coin) && open.has(slot))) continue;
    const by = add(day, 'dca', slot, tapped[0]?.note ?? '');
    groups.get(`${day.coin}|${slot}`)?.by.push(...by);
  }
  const replaced: EstimateGroup[] = [];
  const kept: (EstimateGroup & { imported: Money })[] = [];
  for (const group of [...groups.values()].filter((each) => each.by.length > 0)) {
    const [{ coin, slot }] = group.estimates as [Entry];
    // A monthly buy always has a cost: only a `held` entry may have none.
    const imported = sum(
      [...live.filter((each) => !gone.has(each.id)), ...added]
        .filter(
          (each) => each.source === 'import-csv' && each.kind === 'dca' && each.coin === coin && each.slot === slot,
        )
        .map((each) => each.amount as Money),
    );
    const [first, ...rest] = group.estimates.map((each) => each.amount as Money) as [Money, ...Money[]];
    if (compare(plus(imported, imported), max(first, ...rest)) >= 0) replaced.push(group);
    else kept.push({ ...group, imported });
  }
  return { replaced, kept };
}

/**
 * Step 1's named monthly buy: C's tombstoned estimates for its month, when the monthly buys of C for it the Log keeps
 * once this import adds its entries and the person deletes the named ones (`left` holds those of every month) are all
 * exchange-imported and come to less than half the largest of them, none at all included. It is written for an earlier
 * import's buy that replaced the estimate and that this file cancels, where one import of the whole file keeps the
 * estimate live. A tombstone does not record who made it, so one the person deleted or cleared by hand counts too,
 * among those named and in the largest: the line can then show where one import keeps no estimate live, or keeps live
 * one the person cleared. It errs only toward showing.
 */
export function carried(entry: Entry, left: readonly Entry[], stored: readonly Entry[]): Entry[] {
  const same = (other: Entry) => other.kind === 'dca' && other.coin === entry.coin && other.slot === entry.slot;
  const taps = tapsOf(stored).filter((tap) => tap.deletedAt !== null && same(tap));
  const rest = left.filter(same);
  if (entry.kind !== 'dca' || taps.length === 0 || rest.some((other) => other.source !== 'import-csv')) return [];
  const imported = sum(rest.map((each) => each.amount as Money));
  const [first, ...more] = taps.map((each) => each.amount as Money) as [Money, ...Money[]];
  return compare(plus(imported, imported), max(first, ...more)) < 0 ? taps : [];
}
