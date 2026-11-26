// The set-aside entries a person would miss (ADR-0019 Readings, 2026-11-26): those whose id no snapshot entry
// holds, since only an import of that row brings it back (a new record gets a new id). Hidden on this device by the key
// `set-aside:<n>` in `prefs.dismissedBanners`, n the set-aside entry rows, so a later one shows the line again.
// And the currency of the set-aside plan, which onboarding asks about before writing a plan beside the entries.
import {
  type CurrencyCode,
  type Entry,
  type Instant,
  type KeptCurrencyQuestion,
  keptCurrencyQuestion,
} from '@proofofcalm/core';
import type { SetAsideRow, Snapshot } from '../ports';

const PREFIX = 'set-aside:';

/** The key that hides the lines while `count` entry rows are set aside (docs/DOMAIN.md §2.3). */
export const setAsideKey = (count: number): string => `${PREFIX}${count}`;

/** The banner keys with older set-aside keys dropped and this one added. */
export function withSetAsideKey(keys: readonly string[], count: number): string[] {
  return [...keys.filter((key) => !key.startsWith(PREFIX)), setAsideKey(count)];
}

/** How many set-aside entries are still missing and the earliest time one of them was set aside. */
export type MissingEntries = { readonly count: number; readonly since: Instant | null };

const NONE: MissingEntries = { count: 0, since: null };

export function missingEntries(
  setAside: readonly SetAsideRow[],
  entries: readonly Entry[],
  dismissed: readonly string[],
): MissingEntries {
  if (setAside.length === 0 || dismissed.includes(setAsideKey(setAside.length))) return NONE;
  const stored = new Set<string>(entries.map((entry) => entry.id));
  const missing = setAside.filter((row) => !stored.has(row.id));
  let since: Instant | null = null;
  for (const { at } of missing) if (since === null || Date.parse(at) < Date.parse(since)) since = at;
  return since === null ? NONE : { count: missing.length, since };
}

/**
 * The currency the entries kept with no plan were last shown in (ADR-0053): the one the set-aside plan rows with
 * the latest time name, if they all agree. The list is never pruned, so those rows are the plan last stored. Null
 * when none is set aside (a list kept whole names none), when they disagree or when the payload does not read.
 */
export function keptCurrency(setAside: Snapshot['setAside']): CurrencyCode | null {
  const latest = Math.max(...setAside.plans.map(({ at }) => Date.parse(at)));
  const named = new Set(setAside.plans.filter(({ at }) => Date.parse(at) === latest).map(({ currency }) => currency));
  const [only] = named;
  return named.size === 1 && only !== undefined ? only : null;
}

/**
 * The question onboarding asks before it writes a plan in `next` beside entries kept with no plan (ADR-0053), the
 * same at render and in the write's turn: null while a plan or a newer build's plan row is stored.
 */
export function keptQuestion(
  { plan, newer, entries, setAside }: Pick<Snapshot, 'plan' | 'newer' | 'entries' | 'setAside'>,
  next: CurrencyCode,
): KeptCurrencyQuestion | null {
  if (plan !== null || newer.plans > 0) return null;
  return keptCurrencyQuestion(entries, keptCurrency(setAside), next);
}
