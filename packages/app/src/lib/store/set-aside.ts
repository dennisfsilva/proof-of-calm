// The set-aside entries a person would miss (ADR-0019 Readings, 2026-11-26): those whose id no snapshot entry
// holds, since an import or a new record with that id brings it back. Hidden on this device by the key
// `set-aside:<n>` in `prefs.dismissedBanners`, n the set-aside entry rows, so a later one shows the line again.
import type { Entry, Instant } from '@proofofcalm/core';
import type { SetAsideRow } from '../ports';

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
