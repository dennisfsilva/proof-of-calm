// An entry is one coin (docs/DOMAIN.md §2.2). Amount and units are stored as typed; the implied
// price is derived, never stored. A "transaction" in the Log groups entries (§3.9).
import * as z from 'zod/mini';
import { ENTRY_NOTE_MAX_LENGTH, VENUE_MAX_LENGTH } from '../constants';
import { CalendarDateSchema, InstantSchema, MonthKeySchema } from '../dates/calendar';
import {
  compare,
  decimalPlaces,
  isNegative,
  isPositive,
  type Money,
  MoneySchema,
  type Units,
  UnitsSchema,
} from '../money/decimal';
import { CoinIdSchema, type EntityId, EntityIdSchema } from './ids';

/** `held`: coins the plan did not buy, held before it or received as a gift (docs/DOMAIN.md §2.2). */
export const ENTRY_KINDS = ['dca', 'lump', 'extra', 'sell', 'held'] as const;
export const EntryKindSchema = z.enum(ENTRY_KINDS);
export type EntryKind = z.infer<typeof EntryKindSchema>;

export const EntrySourceSchema = z.enum(['manual', 'one-tap', 'import-prototype', 'import-json', 'import-csv']);
export type EntrySource = z.infer<typeof EntrySourceSchema>;

/** A free-text label ("Kraken", "Ledger") for per-venue lot matching; a label, never a checklist. */
export const VenueSchema = z.string().check(z.minLength(1), z.maxLength(VENUE_MAX_LENGTH));

const EntryFieldsSchema = z.strictObject({
  id: EntityIdSchema,
  kind: EntryKindSchema,
  date: CalendarDateSchema,
  coin: CoinIdSchema,
  /** Pay currency; for sells, the proceeds received. Null (cost unknown) and 0 (nothing paid) on `held` only. */
  amount: z.nullable(MoneySchema),
  /** For sells, the units sold. */
  units: UnitsSchema,
  /** This entry's share of the transaction's fee, in the pay currency; null on `held`. */
  fee: z.nullable(MoneySchema),
  note: z.string().check(z.maxLength(ENTRY_NOTE_MAX_LENGTH)),
  /** Required for `dca`, null otherwise. */
  slot: z.nullable(MonthKeySchema),
  venue: z.nullable(VenueSchema),
  source: EntrySourceSchema,
  createdAt: InstantSchema,
  updatedAt: InstantSchema,
  /** Soft delete: the undo window and the sync tombstone. */
  deletedAt: z.nullable(InstantSchema),
});

export const ENTRY_ISSUE_CODES = [
  'amount-not-positive',
  'amount-required',
  'fee-not-allowed',
  'units-not-positive',
  'units-precision',
  'fee-negative',
  'slot-required',
  'slot-not-allowed',
] as const;
export type EntryIssueCode = (typeof ENTRY_ISSUE_CODES)[number];
export type EntryIssue = { readonly code: EntryIssueCode; readonly path: readonly string[] };

/** Units carry at most ten decimals (docs/DOMAIN.md §1). */
export const MAX_UNIT_DECIMALS = 10;

type EntryFields = z.infer<typeof EntryFieldsSchema>;

/** Every kind but `held` has a cost above zero; `held` may have none (null) or a cost of 0 or more. */
function amountIssues({ kind, amount }: EntryFields): EntryIssue[] {
  if (amount === null) return kind === 'held' ? [] : [{ code: 'amount-required', path: ['amount'] }];
  const valid = kind === 'held' ? !isNegative(amount) : isPositive(amount);
  return valid ? [] : [{ code: 'amount-not-positive', path: ['amount'] }];
}

export function entryIssues(entry: EntryFields): EntryIssue[] {
  const issues: EntryIssue[] = [];
  issues.push(...amountIssues(entry));
  if (!isPositive(entry.units)) issues.push({ code: 'units-not-positive', path: ['units'] });
  if (decimalPlaces(entry.units) > MAX_UNIT_DECIMALS) issues.push({ code: 'units-precision', path: ['units'] });
  if (entry.fee !== null && isNegative(entry.fee)) issues.push({ code: 'fee-negative', path: ['fee'] });
  if (entry.kind === 'held' && entry.fee !== null) issues.push({ code: 'fee-not-allowed', path: ['fee'] });
  if (entry.kind === 'dca' && entry.slot === null) issues.push({ code: 'slot-required', path: ['slot'] });
  if (entry.kind !== 'dca' && entry.slot !== null) issues.push({ code: 'slot-not-allowed', path: ['slot'] });
  return issues;
}

export const EntrySchema = EntryFieldsSchema.check(
  z.superRefine((entry, ctx) => {
    for (const issue of entryIssues(entry)) {
      ctx.addIssue({ code: 'custom', message: issue.code, path: [...issue.path], input: entry });
    }
  }),
);
export type Entry = z.infer<typeof EntrySchema>;

/** The ids of the entries an import would store that do not read as entries (docs/DOMAIN.md §3.13). */
export function invalidEntryIds(entries: readonly Entry[]): EntityId[] {
  return entries.filter((entry) => !EntrySchema.safeParse(entry).success).map((entry) => entry.id);
}

/** A one-tap entry's units are an estimate from the day's price (ADR-0003): the Log labels them as such. */
export function isEstimate(entry: Pick<Entry, 'source'>): boolean {
  return entry.source === 'one-tap';
}

/**
 * The source a save gives a row: a new entry takes `source`; an edited one keeps its own, except an estimate whose
 * units the save changes in value, which becomes `manual` (docs/DOMAIN.md §2.2). Amount, fee, venue, note, date or
 * slot alone, and units retyped equal in value, keep the label.
 */
export function savedSource(
  existing: Pick<Entry, 'source' | 'units'> | undefined,
  units: Units,
  source: EntrySource,
): EntrySource {
  if (existing === undefined) return source;
  return isEstimate(existing) && compare(existing.units, units) !== 0 ? 'manual' : existing.source;
}

/** The recorded costs, in their order: a `held` entry whose cost is unknown (null) adds none. */
export function recordedAmounts(entries: readonly { readonly amount: Money | null }[]): Money[] {
  return entries.flatMap((entry) => (entry.amount === null ? [] : [entry.amount]));
}

/** The latest entry payload version: 3 adds the `held` kind and its null or zero amount to v2's shape. */
export const ENTRY_SCHEMA_VERSION = 3;
const PREVIOUS_ENTRY_VERSION = 2;

/**
 * The version an entry is written at, in a row or a backup: the lowest that holds it (as `writtenPlan` for plans),
 * so 3 only for `held` and 2 for every kind the previous build reads.
 */
export function writtenEntryVersion(entry: Entry): typeof PREVIOUS_ENTRY_VERSION | typeof ENTRY_SCHEMA_VERSION {
  return entry.kind === 'held' ? ENTRY_SCHEMA_VERSION : PREVIOUS_ENTRY_VERSION;
}
