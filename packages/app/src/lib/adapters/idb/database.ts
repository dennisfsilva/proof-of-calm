// The IndexedDB database of ADR-0019: its name, its seven stores and the migrations that build them.
// The version is the number of migrations. A shipped migration never changes; each schema change adds
// one, tested against a database of the previous version (docs/RELEASE.md, "Storage migration").
import { type DBSchema, type IDBPDatabase, type IDBPTransaction, openDB } from 'idb';

/**
 * Like the backup format marker, the name stays "proof-of-calm" whatever the product is called
 * (ADR-0040): a database under a new name would open empty and leave every device's data behind.
 */
export const DATABASE_NAME = 'proof-of-calm';

export const STORE_NAMES = ['plans', 'entries', 'prefs', 'prices', 'history', 'outbox', 'meta'] as const;
export type StoreName = (typeof STORE_NAMES)[number];

/**
 * Keys and indexes per store. Every value is `unknown` on purpose: what comes back from IndexedDB is
 * read through a schema before anything trusts it (ADR-0019).
 */
export interface StorageSchema extends DBSchema {
  plans: { key: string; value: unknown; indexes: { updatedAt: string } };
  entries: { key: string; value: unknown; indexes: { planId: string; updatedAt: string } };
  prefs: { key: string; value: unknown };
  prices: { key: string; value: unknown };
  history: { key: [string, string]; value: unknown };
  outbox: { key: [string, string]; value: unknown };
  meta: { key: string; value: unknown };
}

export type Database = IDBPDatabase<StorageSchema>;
type UpgradeTransaction = IDBPTransaction<StorageSchema, StoreName[], 'versionchange'>;

/** One schema version: it gets the database at the previous version, inside the upgrade transaction. */
export type Migration = (database: Database, transaction: UpgradeTransaction) => void | Promise<void>;

/** Version 1: the stores of ADR-0019, keyed and indexed as its readings record. */
function createStores(database: Database): void {
  database.createObjectStore('plans', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
  const entries = database.createObjectStore('entries', { keyPath: 'id' });
  entries.createIndex('planId', 'planId');
  entries.createIndex('updatedAt', 'updatedAt');
  database.createObjectStore('prefs');
  database.createObjectStore('prices');
  database.createObjectStore('history', { keyPath: ['coin', 'currency'] });
  database.createObjectStore('outbox', { keyPath: ['store', 'id'] });
  database.createObjectStore('meta');
}

/** Entry n upgrades version n to n + 1. */
export const MIGRATIONS: readonly Migration[] = [createStores];

export type ConnectionEvents = {
  /** The connection closed: another tab opened a newer version, or the browser dropped it. */
  readonly closed: () => void;
};

/**
 * Opens the database at version `migrations.length`, running the missing migrations in order. They
 * share the one upgrade transaction, so the first that fails aborts it: the open rejects with that
 * failure and the database stays at its old version, untouched.
 */
export async function openDatabase(migrations: readonly Migration[], events: ConnectionEvents): Promise<Database> {
  let failure: unknown = null;
  let opened: Database | null = null;
  try {
    opened = await openDB<StorageSchema>(DATABASE_NAME, migrations.length, {
      upgrade(database, oldVersion, _newVersion, transaction) {
        // The open request reports the abort; the transaction's own rejection is not a second error.
        transaction.done.catch(() => undefined);
        // Nothing may throw out of this handler, so the steps run in a promise that aborts on failure.
        const run = async () => {
          for (const migration of migrations.slice(oldVersion)) await migration(database, transaction);
        };
        run().catch((error: unknown) => {
          failure = error;
          transaction.abort();
          // Browsers close an aborted upgrade's connection themselves; closing it here makes sure.
          database.close();
        });
      },
      // A newer version waits for this connection: let it go, and the next call opens afresh.
      blocking() {
        opened?.close();
        events.closed();
      },
      terminated: () => events.closed(),
    });
    return opened;
  } catch (error) {
    throw failure ?? error;
  }
}
