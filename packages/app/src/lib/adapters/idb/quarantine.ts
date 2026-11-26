// Rows that fail their schema are set aside, never silently dropped (ADR-0019): moved out of their store
// into the list kept under meta's "corrupt" key, with what was found and why, and counted in the
// snapshot so the screens can say so in one line. Only "Delete everything" clears the list.
import { type CurrencyCode, CurrencyCodeSchema, type Instant, InstantSchema } from '@proofofcalm/core';
import * as z from 'zod/mini';
import type { SetAsideRow, Snapshot } from '../../ports';
import { issueCodes } from '../checks';
import { STORE_NAMES, type StoreName } from './database';
import { storedLive } from './rows';

export const CORRUPT_KEY = 'corrupt';

const QuarantinedSchema = z.strictObject({
  store: z.enum(STORE_NAMES),
  /** The row's key, as it was stored. */
  id: z.unknown(),
  /** The row exactly as it was read. */
  raw: z.unknown(),
  /** What its schema said, each as "path: code" (lib/adapters/checks.ts). */
  issues: z.array(z.string()),
  at: InstantSchema,
});
export type Quarantined = z.infer<typeof QuarantinedSchema>;

export function quarantineRecord(store: StoreName, id: unknown, raw: unknown, issues: readonly string[], at: Instant) {
  return { store, id, raw, issues: [...issues], at } satisfies Quarantined;
}

/**
 * The stored list and whether it must be written back: a list that no longer reads is kept too, as the
 * first item of a new one.
 */
export function quarantineList(raw: unknown, now: Instant): { readonly list: Quarantined[]; readonly fixed: boolean } {
  if (raw === undefined) return { list: [], fixed: false };
  const parsed = z.array(QuarantinedSchema).safeParse(raw);
  if (parsed.success) return { list: parsed.data, fixed: false };
  const record = quarantineRecord('meta', CORRUPT_KEY, raw, issueCodes(parsed.error.issues, null), now);
  return { list: [record], fixed: true };
}

/** The pay currency a set-aside plan row's payload names, when that one field reads; nothing else of it is used. */
const PayCurrencySchema = z.object({ payload: z.object({ payCurrency: CurrencyCodeSchema }) });
const payCurrency = (raw: unknown): CurrencyCode | null => {
  const parsed = PayCurrencySchema.safeParse(raw);
  return parsed.success ? parsed.data.payload.payCurrency : null;
};

/**
 * The plan and entry rows of the list that were live when set aside (`storedLive`), by their string key with
 * the time, in the list's order: what the screens' lines read. A plan row adds the pay currency its payload
 * names, else null (ADR-0053). Tombstones, the prefs row and a list kept whole hold nothing a screen would miss.
 * The list itself is read and written as before (ADR-0019 Readings, 2026-11-26).
 */
export function setAsideRows(list: readonly Quarantined[]): Snapshot['setAside'] {
  const rows = (store: 'plans' | 'entries'): Quarantined[] =>
    list.filter((item) => item.store === store && typeof item.id === 'string' && storedLive(item.raw));
  const row = (item: Quarantined): SetAsideRow => ({ id: String(item.id), at: item.at });
  return {
    plans: rows('plans').map((item) => ({ ...row(item), currency: payCurrency(item.raw) })),
    entries: rows('entries').map(row),
  };
}
