// The shell's ports (docs/ARCHITECTURE.md, ADR-0016): what the features need from the world, as
// interfaces, so that the web host, the static-export host, Storybook and the tests each plug in their
// own adapters (lib/adapters). The core never sees a port; the shell calls the core with plain data.
import {
  type CalendarDate,
  type CoinId,
  CoinIdSchema,
  type CurrencyCode,
  CurrencyCodeSchema,
  type Entry,
  type Instant,
  InstantSchema,
  type Plan,
  type Prefs,
  PriceHistorySchema,
  PriceSnapshotSchema,
  type Result,
} from '@proofofcalm/core';
import * as z from 'zod/mini';

/** Time, owned by the shell (ADR-0018, ADR-0042). */
export interface Clock {
  readonly timeZone: string;
  /** The current instant, ISO 8601 in UTC. */
  now(): Instant;
  /** The calendar date in `timeZone` at this moment; derived once per render tick. */
  today(): CalendarDate;
}

/**
 * The prices with the time they were fetched, kept in IndexedDB so "prices from 14:05" reads the same
 * offline (ADR-0033's `{ prices, asOf, fetchedAt, source, stale }`: `prices` and `asOf` are the
 * snapshot and its `at`). `currency` is the pay currency the 24-hour change was asked in; `stale` says
 * the server answered with its last good copy (ADR-0036); `source` is `manual` for prices typed by hand.
 * Live prices are kept for less than 24 hours (ADR-0019 readings); typed ones until replaced.
 */
export const PricesStateSchema = z.strictObject({
  snapshot: PriceSnapshotSchema,
  currency: CurrencyCodeSchema,
  fetchedAt: InstantSchema,
  stale: z.boolean(),
  source: z.enum(['live', 'manual']),
});
export type PricesState = Readonly<z.infer<typeof PricesStateSchema>>;

/**
 * Why a call to the API failed, as a value callers switch on (lib/adapters/api-client): `network` when
 * no answer came (offline, unreachable or too slow), `http` for an error status, `invalid` for an
 * answer that is not JSON or does not match the expected schema.
 */
export type ApiFailure =
  | { readonly kind: 'network' }
  | { readonly kind: 'http'; readonly status: number }
  | { readonly kind: 'invalid' };

/**
 * Why the last price refresh failed (lib/services, ADR-0020 readings): an ApiFailure, or `local` when
 * the failure happened on this device rather than in the API's answer, as when the price source threw
 * or the store refused the prices. The refresh never rejects: every failure is this value.
 */
export type PricesFailure = ApiFailure | { readonly kind: 'local' };

/** Everything the screens read, as one immutable value (ADR-0019, ADR-0020). */
export type Snapshot = {
  readonly plan: Plan | null;
  /** Soft-deleted entries included (the undo window, the sync tombstones), in id order. */
  readonly entries: readonly Entry[];
  readonly prefs: Prefs;
  readonly prices: PricesState | null;
  /** Stored rows that failed their schema and were set aside (ADR-0019), for a one-line notice. */
  readonly quarantined: number;
  /**
   * Live stored rows a newer build wrote (a later schema or encryption version), left in place unread
   * (ADR-0019 readings): a newer plan takes the screen area, newer entries alone get a line on Today.
   */
  readonly newer: { readonly plans: number; readonly entries: number };
  /**
   * Deleted stored rows a newer build wrote, kept apart from `newer`: a tombstone holds nothing a person
   * would lose, so only the refusal of an import reads this (docs/DOMAIN.md §3.13).
   */
  readonly newerTombstones: number;
};

/**
 * The rows a write changes: the plan (null removes it), entries by id (soft deletes included), the prefs,
 * the prices. `changedAt` alone sets the stored prefs row's `changedAt`, which `prefs` never moves: the
 * row as stored, not as this tab last read it, so neither puts back what another tab wrote.
 */
export type Changes = {
  readonly plan?: Plan | null;
  readonly entries?: readonly Entry[];
  readonly prefs?: Prefs;
  readonly changedAt?: Instant;
  readonly prices?: PricesState;
};

/** One coin's daily closes in one currency, with the time they were fetched. */
export const CachedHistorySchema = z.strictObject({
  coin: CoinIdSchema,
  currency: CurrencyCodeSchema,
  closes: PriceHistorySchema,
  fetchedAt: InstantSchema,
});
export type CachedHistory = Readonly<z.infer<typeof CachedHistorySchema>>;

/** Daily closes for the Portfolio charts, kept on the device for at most 24 hours (ADR-0036 allows no longer). */
export interface HistoryCache {
  /** The closes fetched less than 24 hours before `now`, else null; an older copy is deleted. */
  get(coin: CoinId, currency: CurrencyCode, now: Instant): Promise<CachedHistory | null>;
  /** Stores the closes only while a live plan is stored, so a fetch that lands after "Delete everything" keeps nothing. */
  put(history: CachedHistory): Promise<void>;
}

/** What an update's build returns: changes, never a Promise (an await would end the transaction). */
export type Built = Changes & { readonly then?: never };

declare const wiped: unique symbol;
/** The rows "Delete everything" took, as stored, for its undo alone: only the adapter that made them reads them. */
export type WipedRows = { readonly [wiped]: true };

/** Device storage (IndexedDB through `idb` in M1, ADR-0019). */
export interface PlanStore {
  load(): Promise<Snapshot>;
  /** Persists the changed rows in one transaction; a row its schema rejects is refused, never stored. */
  write(changes: Changes): Promise<void>;
  /**
   * Builds the changes on the rows as stored and writes them, in one transaction over every store: it reads
   * the snapshot (setting aside what does not read), calls `build` on it, checks and writes what it returned,
   * and gives back the snapshot and the changes it wrote: a row skipped because a later version holds its id
   * is not among them, and a plan held that way leaves them empty (ADR-0019 readings). `build` runs synchronously
   * inside the transaction, so no other tab writes between the read and the write. It resolves only once the
   * transaction has committed and rejects when the commit fails; a `build` that throws, or returns a Promise,
   * is refused: the transaction aborts and nothing is written.
   */
  update(build: (stored: Snapshot) => Built): Promise<{ readonly snapshot: Snapshot; readonly changes: Changes }>;
  /**
   * "Delete everything" (Settings), at once: one transaction reads every store's rows as stored, then clears
   * the stores, and gives the rows back for the undo. What the device keeps outside these stores (the form
   * drafts) is the domain store's `afterWipe`.
   */
  wipe(): Promise<WipedRows>;
  /**
   * The undo of a wipe: one transaction writes every row back, only while no plan and no live entry is
   * stored (another tab started or imported one since); else it writes nothing and gives false.
   */
  restore(rows: WipedRows): Promise<boolean>;
  readonly history: HistoryCache;
}

/** The latest prices from `/api/prices` (ADR-0036) for the pay currency; a failure is a value, never a rejection. */
export interface PriceSource {
  latest(currency: CurrencyCode): Promise<Result<PricesState, ApiFailure>>;
}

/**
 * One coin's daily closes from `/api/history/:coin` (ADR-0006, ADR-0036), the device's HistoryCache
 * first; the answer is the route's body, `fetchedAt` included. A failure is a value, never a rejection.
 */
export interface HistorySource {
  closes(coin: CoinId, currency: CurrencyCode): Promise<Result<CachedHistory, ApiFailure>>;
}

/** Navigation without importing next/link or next/navigation in features (ADR-0032). */
export interface Router {
  push(href: string): void;
  replace(href: string): void;
  back(): void;
}

/** What differs between the browser and the native wrapper (ADR-0032). */
export interface Platform {
  readonly native: boolean;
  /** Opens the share sheet; false when there is none or the user cancelled. */
  share(data: { readonly title: string; readonly text?: string; readonly url?: string }): Promise<boolean>;
  /** Saves a file the user can keep (an export); false when the platform cannot. */
  download(name: string, content: string, type: string): Promise<boolean>;
  /** Asks the browser to keep the data (ADR-0019: after the first entry, never on load). */
  persistStorage(): Promise<boolean>;
  /** Loads the page again (a screen whose code could not be loaded offers it). */
  reload(): void;
  /** True in the installed app, false in a browser tab (the durability line says which it asks for). */
  installed(): boolean;
}

/** The five counted events of ADR-0028: counts only, no identifier. */
export type AnalyticsEvent = 'plan_created' | 'entry_logged' | 'account_linked' | 'reminder_sent' | 'export_downloaded';

export interface Analytics {
  count(event: AnalyticsEvent): void;
}
