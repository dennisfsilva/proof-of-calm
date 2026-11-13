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

/** The kinds the Log's transaction form saves (`saveTransaction`); a move has its own save (`saveMove`). */
const TRANSACTION_KINDS = ['dca', 'lump', 'extra', 'sell', 'held'] as const;
/**
 * `held`: coins the plan did not buy, held before it or received as a gift; `move`: units sent from one venue to
 * another (docs/DOMAIN.md §2.2).
 */
export const ENTRY_KINDS = [...TRANSACTION_KINDS, 'move'] as const;
export const EntryKindSchema = z.enum(ENTRY_KINDS);
export type EntryKind = z.infer<typeof EntryKindSchema>;
export const TransactionKindSchema = z.enum(TRANSACTION_KINDS);
export type TransactionKind = z.infer<typeof TransactionKindSchema>;

export const EntrySourceSchema = z.enum(['manual', 'one-tap', 'import-prototype', 'import-json', 'import-csv']);
export type EntrySource = z.infer<typeof EntrySourceSchema>;

/** A free-text label ("Kraken", "Ledger") for per-venue lot matching; a label, never a checklist. */
export const VenueSchema = z.string().check(z.minLength(1), z.maxLength(VENUE_MAX_LENGTH));

const EntryFieldsSchema = z.strictObject({
  id: EntityIdSchema,
  kind: EntryKindSchema,
  date: CalendarDateSchema,
  coin: CoinIdSchema,
  /** Pay currency, before the fee (DOMAIN §2.2): for buys what the units cost, for sells what they sold for; a `held` cost includes any fee paid in money, since `held` carries no fee. Null (cost unknown) and 0 (nothing paid) on `held` only. */
  amount: z.nullable(MoneySchema),
  /** For sells, the units sold. */
  units: UnitsSchema,
  /** This entry's share of the transaction's fee, in the pay currency; null on `held`. */
  fee: z.nullable(MoneySchema),
  note: z.string().check(z.maxLength(ENTRY_NOTE_MAX_LENGTH)),
  /** Required for `dca`, null otherwise. */
  slot: z.nullable(MonthKeySchema),
  /** For a move, the venue it sends from (null: none named). */
  venue: z.nullable(VenueSchema),
  /** A move's destination; absent on every other kind, never undefined (the previous build's strict object). */
  to: z.optional(VenueSchema),
  /** A move's units received at `to`, above 0 and at most `units`; the rest is its fee in the coin. Absent otherwise. */
  received: z.optional(UnitsSchema),
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
  'amount-not-allowed',
  'move-required',
  'move-not-allowed',
  'received-not-positive',
  'received-exceeds-units',
  'same-venue',
] as const;
export type EntryIssueCode = (typeof ENTRY_ISSUE_CODES)[number];
export type EntryIssue = { readonly code: EntryIssueCode; readonly path: readonly string[] };

/** Units carry at most ten decimals (docs/DOMAIN.md §1). */
export const MAX_UNIT_DECIMALS = 10;

type EntryFields = z.infer<typeof EntryFieldsSchema>;

/** A purchase or sale has a cost above zero; `held` may have none (null) or a cost of 0 or more; a move has none. */
function amountIssues({ kind, amount }: EntryFields): EntryIssue[] {
  if (kind === 'move') return amount === null ? [] : [{ code: 'amount-not-allowed', path: ['amount'] }];
  if (amount === null) return kind === 'held' ? [] : [{ code: 'amount-required', path: ['amount'] }];
  const valid = kind === 'held' ? !isNegative(amount) : isPositive(amount);
  return valid ? [] : [{ code: 'amount-not-positive', path: ['amount'] }];
}

/** A move names where its units went and how many arrived; no other kind carries either key, not even undefined. */
function moveIssues(entry: EntryFields): EntryIssue[] {
  const keys = ['to', 'received'] as const;
  if (entry.kind !== 'move') {
    return keys.filter((key) => key in entry).map((key) => ({ code: 'move-not-allowed', path: [key] }));
  }
  const { to, received } = entry;
  if (to === undefined || received === undefined) {
    return keys.filter((key) => entry[key] === undefined).map((key) => ({ code: 'move-required', path: [key] }));
  }
  const issues: EntryIssue[] = [];
  if (!isPositive(received)) issues.push({ code: 'received-not-positive', path: ['received'] });
  if (compare(received, entry.units) > 0) issues.push({ code: 'received-exceeds-units', path: ['received'] });
  if (decimalPlaces(received) > MAX_UNIT_DECIMALS) issues.push({ code: 'units-precision', path: ['received'] });
  if (to === entry.venue) issues.push({ code: 'same-venue', path: ['to'] });
  return issues;
}

export function entryIssues(entry: EntryFields): EntryIssue[] {
  const issues: EntryIssue[] = [];
  issues.push(...amountIssues(entry), ...moveIssues(entry));
  if (!isPositive(entry.units)) issues.push({ code: 'units-not-positive', path: ['units'] });
  if (decimalPlaces(entry.units) > MAX_UNIT_DECIMALS) issues.push({ code: 'units-precision', path: ['units'] });
  if (entry.fee !== null && isNegative(entry.fee)) issues.push({ code: 'fee-negative', path: ['fee'] });
  if ((entry.kind === 'held' || entry.kind === 'move') && entry.fee !== null)
    issues.push({ code: 'fee-not-allowed', path: ['fee'] });
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

/**
 * The latest entry payload version: 4 adds the `move` kind and its `to` and `received` keys to v3's shape, which added
 * the `held` kind and its null or zero amount to v2's.
 */
export const ENTRY_SCHEMA_VERSION = 4;
export type EntryVersion = 2 | 3 | typeof ENTRY_SCHEMA_VERSION;

/**
 * The version an entry is written at, in a row or a backup: the lowest that holds it (as `writtenPlan` for plans),
 * so 4 only for a move, 3 for `held` and 2 for every kind the build before `held` reads.
 */
export function writtenEntryVersion(entry: Entry): EntryVersion {
  if (entry.kind === 'move') return ENTRY_SCHEMA_VERSION;
  return entry.kind === 'held' ? 3 : 2;
}
