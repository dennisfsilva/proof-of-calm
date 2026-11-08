// The PlanStore of ADR-0019 on IndexedDB through idb: the database is read whole into one snapshot at
// startup (and again when another tab writes), and each change is written in one transaction. Rows have
// the sync shape (idb/rows.ts); every row read passes its schema or is set aside (idb/quarantine.ts);
// the outbox keeps one copy of each synced row for the push of M3 (ADR-0021).
import {
  DEFAULT_PREFS,
  type EntityId,
  EntityIdSchema,
  type Entry,
  type Instant,
  type Plan,
  type Prefs,
  PrefsSchema,
} from '@proofofcalm/core';
import type { IDBPObjectStore, IDBPTransaction } from 'idb';
import * as z from 'zod/mini';
import { type Changes, type Clock, type PlanStore, PricesStateSchema, type Snapshot, type WipedRows } from '../ports';
import { assertStorableChanges, issueCodes } from './checks';
import { pricesKept } from './history';
import {
  type Database,
  MIGRATIONS,
  type Migration,
  openDatabase,
  STORE_NAMES,
  type StorageSchema,
  type StoreName,
} from './idb/database';
import { idbHistoryCache, sweepHistory } from './idb/history';
import { CORRUPT_KEY, type Quarantined, quarantineList, quarantineRecord } from './idb/quarantine';
import {
  entryRow,
  isLaterVersion,
  newest,
  outboxRecord,
  type PlanRow,
  planRow,
  planTombstone,
  ROW_SCHEMA_VERSIONS,
  type RowVersions,
  readEntryRow,
  readPlanRow,
  storedLive,
  type Unread,
} from './idb/rows';

const PREFS_KEY = 'device';
const PRICES_KEY = 'latest';
const DEVICE_ID_KEY = 'deviceId';
const LOAD_STORES: StoreName[] = ['plans', 'entries', 'prefs', 'prices', 'history', 'meta'];
const META: StoreName[] = ['meta'];

export type IdbPlanStoreOptions = {
  readonly clock: Pick<Clock, 'now'>;
  /** Makes the device id, once: crypto.randomUUID unless a test brings its own. */
  readonly randomUUID?: () => string;
  /** The schema versions; a test appends a synthetic next one. */
  readonly migrations?: readonly Migration[];
  /** The payload versions the rows are read and written at; a test passes the previous build's. */
  readonly rowVersions?: RowVersions;
};

export type IdbPlanStore = PlanStore & {
  /** This device's id, made once and kept in meta; it stamps every row the device writes. */
  deviceId(): Promise<EntityId>;
  /** Closes the connection; the next call opens it again. */
  close(): Promise<void>;
};

type Tx = IDBPTransaction<StorageSchema, StoreName[], 'readwrite'>;
type Store<N extends StoreName> = IDBPObjectStore<StorageSchema, StoreName[], N, 'readwrite'>;
type SetAside = { readonly store: 'plans' | 'entries' | 'prefs'; readonly key: string };

/** One store's rows as a wipe read them: keys and values in the same (key) order. */
type Taken = { readonly name: StoreName; readonly keys: readonly IDBValidKey[]; readonly values: readonly unknown[] };
type IdbWiped = { readonly idb: readonly Taken[] };
// WipedRows is opaque outside this adapter, which alone makes and reads them.
const wipedRows = (taken: readonly Taken[]): WipedRows => ({ idb: taken }) satisfies IdbWiped as unknown as WipedRows;
const takenRows = (rows: WipedRows): readonly Taken[] => (rows as unknown as IdbWiped).idb;

// The device-local records carry no version, so they are read without their schemas' strictness: a
// field that a later build added, at the top or inside the price snapshot, is ignored, not a reason to
// reset the preferences or erase typed prices after a rollback (docs/RELEASE.md). What is written is
// still checked by the strict schemas.
const PrefsReadSchema = z.object(PrefsSchema.shape);
const PricesReadSchema = z.object({
  ...PricesStateSchema.shape,
  snapshot: z.object(PricesStateSchema.shape.snapshot.shape),
});

/** The stores a write of these changes touches, and whether it writes synced rows (the plan or entries). */
function touches(changes: Changes) {
  const entries = changes.entries?.length ?? 0;
  const synced = changes.plan !== undefined || entries > 0;
  const prefsChanged = changes.prefs !== undefined || changes.changedAt !== undefined;
  const stores: StoreName[] = [
    ...(synced ? (['plans', 'outbox', 'meta'] as const) : []),
    ...(entries > 0 ? (['entries'] as const) : []),
    ...(prefsChanged ? (['prefs'] as const) : []),
    ...(changes.prices === undefined ? [] : (['prices'] as const)),
  ];
  return { synced, prefsChanged, stores };
}

export function idbPlanStore(options: IdbPlanStoreOptions): IdbPlanStore {
  const { clock, migrations = MIGRATIONS, rowVersions = ROW_SCHEMA_VERSIONS } = options;
  const randomUUID = options.randomUUID ?? (() => crypto.randomUUID());
  let connection: Promise<Database> | null = null;

  /** Drops a connection that closed or failed to open, unless a newer one has taken its place. */
  function forget(which: Promise<Database>): void {
    if (connection === which) connection = null;
  }

  function connect(): Promise<Database> {
    if (connection !== null) return connection;
    const opening: Promise<Database> = openDatabase(migrations, { closed: () => forget(opening) }).catch(
      (error: unknown) => {
        forget(opening);
        throw error;
      },
    );
    connection = opening;
    return opening;
  }

  /** The id in meta, or a new one; an unreadable id is set aside like any row and replaced. */
  async function deviceIdIn(meta: Store<'meta'>, now: Instant): Promise<EntityId> {
    const raw = await meta.get(DEVICE_ID_KEY);
    const stored = EntityIdSchema.safeParse(raw);
    if (stored.success) return stored.data;
    if (raw !== undefined) {
      const { list } = quarantineList(await meta.get(CORRUPT_KEY), now);
      const item = quarantineRecord('meta', DEVICE_ID_KEY, raw, issueCodes(stored.error.issues, null), now);
      await meta.put([...list, item], CORRUPT_KEY);
    }
    const fresh = EntityIdSchema.parse(randomUUID());
    await meta.put(fresh, DEVICE_ID_KEY);
    return fresh;
  }

  /**
   * One live plan at a time: a plan with another id tombstones the old one, null tombstones it. Entry
   * rows are stamped with the plan live after the write. Every row written joins the outbox. A stored entry
   * of a later version is never written over, a tombstone included: its id is skipped, row and outbox copy
   * (ADR-0019 readings). It gives back the entries it wrote; `writeChanges` has already stopped at a plan
   * held at a later version.
   */
  async function writeSynced(tx: Tx, plan: Plan | null | undefined, entries: readonly Entry[], now: Instant) {
    const deviceId = await deviceIdIn(tx.objectStore('meta'), now);
    const plans = tx.objectStore('plans');
    const outbox = tx.objectStore('outbox');
    const stored = (await plans.getAll()).flatMap((raw) => {
      const read = readPlanRow(raw, rowVersions);
      return read.ok ? [read.value.row] : [];
    });
    const live = stored.filter((row) => row.deletedAt === null);
    const own = plan ? (stored.find((row) => row.id === plan.id) ?? null) : null;
    const planRows: PlanRow[] =
      plan === undefined
        ? []
        : [
            ...live.filter((row) => row.id !== plan?.id).map((row) => planTombstone(row, deviceId, now)),
            ...(plan === null ? [] : [planRow(plan, deviceId, own)]),
          ];
    const planId = plan === undefined ? (newest(live, (row) => row)?.id ?? null) : (plan?.id ?? null);
    const held = await Promise.all(entries.map(({ id }) => tx.objectStore('entries').get(id)));
    const written = entries.filter((_, index) => !isLaterVersion(held[index], 'entries', rowVersions));
    const entryRows = written.map((entry) => entryRow(entry, planId, deviceId));
    await Promise.all([
      ...planRows.flatMap((row) => [plans.put(row), outbox.put(outboxRecord('plans', row))]),
      ...entryRows.flatMap((row) => [tx.objectStore('entries').put(row), outbox.put(outboxRecord('entries', row))]),
    ]);
    return written;
  }

  /**
   * The preferences are written whole, but the stored row may carry fields of a later build that this
   * build's read schema dropped (PrefsReadSchema): they are kept under the validated change, so a
   * rollback or an old tab does not reset them (docs/RELEASE.md, rollback). A row that is not a record
   * has nothing to keep. `changedAt` belongs to the stamp alone: the row's own stays under a changed
   * record, which may be built from an older read, and only `stampedAt` sets it, on the row as stored
   * (the defaults when there is none or it does not read), so neither puts back what another tab wrote
   * since this tab read.
   */
  async function writePrefs(prefs: Store<'prefs'>, changed: Prefs | undefined, stampedAt?: Instant): Promise<void> {
    const stored = await prefs.get(PREFS_KEY);
    const kept = typeof stored === 'object' && stored !== null && !Array.isArray(stored) ? stored : DEFAULT_PREFS;
    const own = PrefsSchema.shape.changedAt.safeParse('changedAt' in kept ? kept.changedAt : undefined);
    const changedAt = stampedAt ?? (own.success ? own.data : DEFAULT_PREFS.changedAt);
    await prefs.put({ ...kept, ...changed, changedAt }, PREFS_KEY);
  }

  /**
   * The rows of the changes, in a transaction over the stores `touches` names (or more), and the changes it
   * wrote. A plan held at a later version stops the whole write, tombstones, entries, preferences and
   * prices alike, and it gives back no changes (ADR-0019 readings).
   */
  async function writeChanges(tx: Tx, changes: Changes, now: Instant): Promise<Changes> {
    const { synced, prefsChanged } = touches(changes);
    if (changes.plan && isLaterVersion(await tx.objectStore('plans').get(changes.plan.id), 'plans', rowVersions)) {
      return {};
    }
    const [entries] = await Promise.all([
      synced ? writeSynced(tx, changes.plan, changes.entries ?? [], now) : [],
      ...(prefsChanged ? [writePrefs(tx.objectStore('prefs'), changes.prefs, changes.changedAt)] : []),
      ...(changes.prices === undefined ? [] : [tx.objectStore('prices').put(changes.prices, PRICES_KEY)]),
    ]);
    return changes.entries === undefined ? changes : { ...changes, entries };
  }

  async function readSnapshot(tx: Tx, now: Instant): Promise<Snapshot> {
    const plans = tx.objectStore('plans');
    const entries = tx.objectStore('entries');
    const [planValues, planKeys, entryValues, entryKeys, prefsRaw, pricesRaw, corruptRaw] = await Promise.all([
      plans.getAll(),
      plans.getAllKeys(),
      entries.getAll(),
      entries.getAllKeys(),
      tx.objectStore('prefs').get(PREFS_KEY),
      tx.objectStore('prices').get(PRICES_KEY),
      tx.objectStore('meta').get(CORRUPT_KEY),
    ]);
    const setAside: SetAside[] = [];
    const found: Quarantined[] = [];
    const reject = (store: SetAside['store'], key: string, raw: unknown, issues: readonly string[]) => {
      setAside.push({ store, key });
      found.push(quarantineRecord(store, key, raw, issues, now));
    };
    /**
     * A row of a later version stays in place, unread: a rolled-back build or an old tab must not strip it
     * (RELEASE.md). A live one is counted for the newer-version screen, a tombstone apart, for the refusal
     * of an import alone. The rest is set aside.
     */
    const newer = { plans: 0, entries: 0 };
    let newerTombstones = 0;
    const unread = (store: 'plans' | 'entries', key: string, raw: unknown, why: Unread) => {
      if (why.kind === 'invalid') reject(store, key, raw, why.issues);
      else if (why.live) newer[store] += 1;
      else newerTombstones += 1;
    };

    // getAll and getAllKeys of one transaction list the same records in the same (key) order.
    const livePlans: { readonly row: PlanRow; readonly plan: Plan }[] = [];
    planKeys.forEach((key, index) => {
      const raw = planValues[index];
      const read = readPlanRow(raw, rowVersions);
      if (!read.ok) unread('plans', key, raw, read.error);
      else if (read.value.row.deletedAt === null) livePlans.push({ row: read.value.row, plan: read.value.value });
    });
    const loaded: Entry[] = [];
    entryKeys.forEach((key, index) => {
      const raw = entryValues[index];
      const read = readEntryRow(raw, rowVersions);
      if (read.ok) loaded.push(read.value.value);
      else unread('entries', key, raw, read.error);
    });
    const parsedPrefs = prefsRaw === undefined ? null : PrefsReadSchema.safeParse(prefsRaw);
    if (parsedPrefs?.success === false)
      reject('prefs', PREFS_KEY, prefsRaw, issueCodes(parsedPrefs.error.issues, null));
    const prefs = parsedPrefs?.success ? parsedPrefs.data : DEFAULT_PREFS;
    // Live prices are CoinGecko's, under the same 24 hours as the closes (ADR-0036): an older copy is
    // deleted, not set aside, and so is one that no longer reads, which may hold the same data (as the
    // history cache does). Prices typed by hand are the user's and stay until replaced.
    const parsedPrices = pricesRaw === undefined ? null : PricesReadSchema.safeParse(pricesRaw);
    const storedPrices = parsedPrices?.success ? parsedPrices.data : null;
    const prices = storedPrices !== null && pricesKept(storedPrices, now) ? storedPrices : null;
    const expiredPrices = pricesRaw !== undefined && prices === null;

    const { list, fixed } = quarantineList(corruptRaw, now);
    await Promise.all([
      ...setAside.map(({ store, key }) => tx.objectStore(store).delete(key)),
      ...(found.length > 0 || fixed ? [tx.objectStore('meta').put([...list, ...found], CORRUPT_KEY)] : []),
      ...(expiredPrices ? [tx.objectStore('prices').delete(PRICES_KEY)] : []),
      sweepHistory(tx.objectStore('history'), now),
    ]);
    const plan = newest(livePlans, (item) => item.row)?.plan ?? null;
    return { plan, entries: loaded, prefs, prices, quarantined: list.length + found.length, newer, newerTombstones };
  }

  return {
    async load() {
      // Read and set aside in one transaction, so a row another tab rewrites meanwhile is never lost.
      const tx = (await connect()).transaction(LOAD_STORES, 'readwrite');
      const [snapshot] = await Promise.all([readSnapshot(tx, clock.now()), tx.done]);
      return snapshot;
    },

    async write(changes) {
      assertStorableChanges(changes);
      const { synced, stores } = touches(changes);
      if (stores.length === 0) return;
      // The plan and the log change rarely and are costly to lose: on disk before success. Prices and
      // preferences are cheap to lose, and prices may be rewritten every minute (PRICE_TTL).
      const durability = synced ? 'strict' : 'relaxed';
      const tx = (await connect()).transaction(stores, 'readwrite', { durability });
      await Promise.all([writeChanges(tx, changes, clock.now()), tx.done]);
    },

    async update(build) {
      // Every store, so that the read (quarantine included), the build and the write are one turn of the
      // database: no other tab's write lands between them. An await on anything else would end it early.
      const tx = (await connect()).transaction([...STORE_NAMES], 'readwrite', { durability: 'strict' });
      const now = clock.now();
      let refused = false;
      const run = async () => {
        const snapshot = await readSnapshot(tx, now);
        let changes: Changes;
        try {
          changes = build(snapshot);
          assertStorableChanges(changes);
        } catch (error) {
          refused = true;
          tx.abort();
          throw error;
        }
        return { snapshot, changes: await writeChanges(tx, changes, now) };
      };
      // The abort a refused build causes rejects `done` too; the build's own error is the one to give
      // back. Any other failure of `done` is a commit that did not land (a full disk, a closed
      // connection): on disk before success, as `write`.
      const done = tx.done.catch((error: unknown) => {
        if (!refused) throw error;
      });
      const [result] = await Promise.all([run(), done]);
      return result;
    },

    async wipe() {
      // One transaction reading, then clearing, every store; deleting the database would wait for every tab
      // to close it. The rows go back as they were read, unparsed, so the undo returns them byte for byte.
      const tx = (await connect()).transaction([...STORE_NAMES], 'readwrite', { durability: 'strict' });
      const take = async (name: StoreName): Promise<Taken> => {
        const store = tx.objectStore(name);
        const [keys, values] = await Promise.all([store.getAllKeys(), store.getAll()]);
        await store.clear();
        return { name, keys, values };
      };
      const [taken] = await Promise.all([Promise.all(STORE_NAMES.map(take)), tx.done]);
      return wipedRows(taken);
    },

    async restore(rows) {
      const tx = (await connect()).transaction([...STORE_NAMES], 'readwrite', { durability: 'strict' });
      const run = async () => {
        const [plans, entries] = await Promise.all([
          tx.objectStore('plans').getAll(),
          tx.objectStore('entries').getAll(),
        ]);
        // Another tab started or imported a plan since the wipe: its data wins, and nothing is written.
        if (plans.some(storedLive) || entries.some(storedLive)) return false;
        await Promise.all(
          takenRows(rows).flatMap(({ name, keys, values }) => {
            // The rows as they were read, unparsed: the store untyped, so a row this build cannot read goes back too.
            const store = tx.objectStore(name) as unknown as IDBPObjectStore<unknown, string[], string, 'readwrite'>;
            // A store keyed inside its rows takes the row alone; the others take their key beside it.
            return values.map((value, index) =>
              store.keyPath === null ? store.put(value, keys[index]) : store.put(value),
            );
          }),
        );
        return true;
      };
      const [restored] = await Promise.all([run(), tx.done]);
      return restored;
    },

    history: idbHistoryCache(connect),

    async deviceId() {
      const tx = (await connect()).transaction(META, 'readwrite');
      const [id] = await Promise.all([deviceIdIn(tx.objectStore('meta'), clock.now()), tx.done]);
      return id;
    },

    async close() {
      const open = connection;
      connection = null;
      await open?.then(
        (database) => database.close(),
        () => undefined,
      );
    },
  };
}
