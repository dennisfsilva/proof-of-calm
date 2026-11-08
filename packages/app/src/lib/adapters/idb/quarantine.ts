// Rows that fail their schema are set aside, never silently dropped (ADR-0019): moved out of their store
// into the list kept under meta's "corrupt" key, with what was found and why, and counted in the
// snapshot so the screens can say so in one line. Only "Delete everything" clears the list.
import { type Instant, InstantSchema } from '@proofofcalm/core';
import * as z from 'zod/mini';
import { issueCodes } from '../checks';
import { STORE_NAMES, type StoreName } from './database';

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
