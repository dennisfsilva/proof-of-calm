// @vitest-environment node
// Property tests of the IndexedDB adapter (ADR-0019): any valid snapshot survives a write and a load
// unchanged, the backup cycle export → read → import → write → load → export is a fixed point, a
// migration runs once over any stored data, whatever number of opens follow, and an update's delete or
// undo stamps each entry row after the row as stored.
// The generators build on the core's test builders and keep every invariant of docs/DOMAIN.md §2.
import 'fake-indexeddb/auto';
import {
  addDays,
  addMonthsClamped,
  applyImport,
  BACKUP_SCHEMA_VERSION,
  type BackupFile,
  CHART_RANGES,
  type Coin,
  type CoinId,
  compareInstants,
  deleteEntries,
  type Entry,
  eligibleFrom,
  epochDay,
  exportBackup,
  fromEpochDay,
  type HoldingRule,
  type ImportMode,
  type Instant,
  instantFromEpochMs,
  monthKey,
  type Plan,
  PlanSchema,
  type Prefs,
  type PriceSnapshot,
  readBackup,
  restoreEntries,
  type SlotsAtDelete,
  slotsAtDelete,
  stampAfter,
  writtenBackup,
} from '@proofofcalm/core';
import {
  anEntry,
  aPlan,
  BTC,
  date,
  ETH,
  money,
  PreviousBuildPlanSchema,
  split,
  units,
} from '@proofofcalm/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import fc from 'fast-check';
import { type IDBPTransaction, openDB } from 'idb';
import { describe, expect, it, vi } from 'vitest';
import type { PricesState, Snapshot } from '../ports';
import { DATABASE_NAME, MIGRATIONS, type Migration, STORE_NAMES } from './idb/database';
import { idbPlanStore } from './idb-store';
import { EMPTY_SNAPSHOT, inIdOrder } from './memory-store';

const NOW = '2026-10-17T09:00:00.000Z' as Instant;
const EXPORTED_AT = '2026-10-17T09:30:00.000Z' as Instant;
const SOL: Coin = { id: 'SOL' as CoinId, name: 'Solana', geckoId: 'solana', decimals: 4 };
const LINK: Coin = { id: 'LINK' as CoinId, name: 'Chainlink', geckoId: 'chainlink', decimals: 4 };
const COINS = [BTC, ETH, SOL, LINK];
const RULES: HoldingRule[] = [
  { kind: 'none' },
  { kind: 'days', days: 365, effect: 'exempt' },
  { kind: 'years', years: 1, effect: 'exempt' },
  { kind: 'years', years: 1, effect: 'lower-rate' },
];

/** `n` scaled down by `dp` decimals as a plain decimal string: (12345, 2) → "123.45". */
function scaled(n: number, dp: number): string {
  const digits = String(Math.abs(n)).padStart(dp + 1, '0');
  return `${n < 0 ? '-' : ''}${digits.slice(0, -dp)}.${digits.slice(-dp)}`;
}

const DAY_ONE = epochDay(date('2020-01-01'));
const dateArb = fc.integer({ min: 0, max: 3650 }).map((days) => fromEpochDay(DAY_ONE + days));
const instantArb = fc.integer({ min: Date.UTC(2020, 0, 1), max: Date.UTC(2030, 0, 1) }).map(instantFromEpochMs);
const uuidArb = fc.uuid({ version: 4 });
const textArb = (codePoints: number) => fc.string({ unit: 'binary', maxLength: codePoints });

const planArb = fc
  .record({
    id: uuidArb,
    country: fc.constantFrom('PT', 'DE', 'NL', 'XX'),
    payCurrency: fc.constantFrom('EUR', 'USD', 'GBP', 'CHF'),
    displayCurrency: fc.constantFrom('EUR', 'USD', 'GBP', 'CHF'),
    coinCount: fc.integer({ min: 1, max: COINS.length }),
    cuts: fc.array(fc.integer({ min: 0, max: 1_000_000 }), { minLength: 3, maxLength: 3 }),
    monthly: fc.integer({ min: 0, max: 500_000 }),
    starting: fc.integer({ min: 0, max: 5_000_000 }),
    firstBuy: dateArb,
    buyDay: fc.integer({ min: 1, max: 28 }),
    months: fc.integer({ min: 0, max: 120 }),
    rule: fc.constantFrom(...RULES),
    window: fc.option(fc.tuple(fc.nat(400), fc.nat(400), fc.nat(400))),
    halving: fc.option(dateArb),
    paused: fc.option(fc.tuple(uuidArb, fc.nat(60))),
    skips: fc.uniqueArray(fc.tuple(fc.nat(120), uuidArb), { maxLength: 3, selector: ([offset]) => offset }),
    ended: fc.boolean(),
    checks: fc.tuple(fc.boolean(), fc.boolean(), fc.boolean()),
    why: textArb(140),
    templateId: fc.option(fc.constantFrom('balanced', 'bitcoin-only')),
    // Acknowledged at onboarding (an instant and a wording version, together) or not recorded (null and 0).
    acknowledged: fc.option(fc.tuple(instantArb, fc.integer({ min: 1, max: 9 }))),
    createdAt: instantArb,
    updatedAt: instantArb,
  })
  .map((input): Plan => {
    const coins = COINS.slice(0, input.coinCount);
    const bounds = [0, ...input.cuts.slice(0, input.coinCount - 1).sort((a, b) => a - b), 1_000_000];
    const shares = Object.fromEntries(
      coins.map((coin, index) => [coin.id, scaled(bounds[index + 1]! - bounds[index]!, 4)]),
    );
    const lastBuy = addMonthsClamped(input.firstBuy, input.months, input.buyDay);
    const opens = addDays(
      input.rule.kind === 'none' ? lastBuy : eligibleFrom(lastBuy, input.rule),
      input.window?.[0] ?? 0,
    );
    const closes = addDays(opens, input.window?.[1] ?? 0);
    return aPlan({
      id: input.id as Plan['id'],
      country: input.country,
      payCurrency: input.payCurrency,
      displayCurrency: input.displayCurrency,
      coins,
      split: split(shares),
      monthlyAmount: money(scaled(input.monthly === 0 && input.starting === 0 ? 1 : input.monthly, 2)),
      startingAmount: money(scaled(input.starting, 2)),
      firstBuy: input.firstBuy,
      buyDay: input.buyDay,
      lastBuy,
      holdingRule: input.rule,
      sellWindow: input.window === null ? null : { opens, closes, exitBy: addDays(closes, input.window[2]) },
      references: input.halving === null ? {} : { halving: input.halving },
      pauses:
        input.paused === null
          ? []
          : [
              {
                id: input.paused[0] as Plan['id'],
                from: addDays(input.firstBuy, input.paused[1]),
                until: null,
                note: '',
              },
            ],
      skips: input.skips
        .filter(([offset]) => offset <= input.months)
        .map(([offset, id]) => ({
          id: id as Plan['id'],
          slot: monthKey(addMonthsClamped(input.firstBuy, offset, input.buyDay)),
          note: 'away',
          createdAt: input.createdAt,
        })),
      endedBuyingOn: input.ended ? lastBuy : null,
      sellChecks: { part1: input.checks[0], part2: input.checks[1], part3: input.checks[2] },
      why: input.why,
      templateId: input.templateId,
      riskAcknowledgedAt: input.acknowledged?.[0] ?? null,
      riskWordingVersion: input.acknowledged?.[1] ?? 0,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    });
  })
  .filter((plan) => PlanSchema.safeParse(plan).success);

const entryArb = fc
  .record({
    id: uuidArb,
    kind: fc.constantFrom('dca', 'lump', 'extra', 'sell'),
    date: dateArb,
    coin: fc.constantFrom(...COINS.map((coin) => coin.id)),
    amount: fc.integer({ min: 1, max: 10_000_000 }),
    units: fc.integer({ min: 1, max: 10_000_000_000_000 }),
    fee: fc.option(fc.integer({ min: 0, max: 10_000 })),
    note: textArb(250),
    venue: fc.option(fc.string({ minLength: 1, maxLength: 40 })),
    source: fc.constantFrom('manual', 'one-tap', 'import-prototype', 'import-json', 'import-csv'),
    createdAt: instantArb,
    updatedAt: instantArb,
    // One entry in five soft-deleted: exports leave them out, storage keeps them.
    deletedAt: fc.oneof({ weight: 4, arbitrary: fc.constant(null) }, { weight: 1, arbitrary: instantArb }),
  })
  .map(
    (input): Entry =>
      anEntry({
        ...input,
        id: input.id as Entry['id'],
        slot: input.kind === 'dca' ? monthKey(input.date) : null,
        amount: money(scaled(input.amount, 2)),
        units: units(scaled(input.units, 10)),
        fee: input.fee === null ? null : money(scaled(input.fee, 2)),
      }),
  );
const entriesArb = fc.uniqueArray(entryArb, { maxLength: 12, selector: (entry) => entry.id }).map(inIdOrder);

// fc.record builds objects without a prototype; spreading gives the plain objects storage gives back.
const prefsArb = fc
  .record({
    theme: fc.constantFrom('system', 'light', 'dark'),
    chartRange: fc.constantFrom(...CHART_RANGES),
    lastBackupAt: fc.option(instantArb),
    changedAt: fc.option(instantArb),
    dismissedBanners: fc.array(fc.string({ maxLength: 80 }), { maxLength: 4 }),
    reviewedAt: fc.option(instantArb),
    logShowAll: fc.boolean(),
    motion: fc.constantFrom('system', 'reduce'),
  })
  .map((prefs): Prefs => ({ ...prefs }));

// Live prices fetched, and describing a time, less than 24 hours before NOW (older ones are deleted at
// load); typed ones any time.
const DAY_MS = 24 * 60 * 60 * 1000;
const pricesArb = fc.option(
  fc
    .record({
      at: instantArb,
      source: fc.constantFrom('live', 'manual'),
      age: fc.integer({ min: 0, max: DAY_MS - 1 }),
      dataAge: fc.integer({ min: 0, max: DAY_MS - 1 }),
      typedAt: instantArb,
      currency: fc.constantFrom('EUR', 'USD', 'GBP', 'CHF'),
      stale: fc.boolean(),
      btc: fc.integer({ min: 1, max: 1e12 }),
      eth: fc.integer({ min: 1, max: 1e12 }),
      change: fc.option(fc.integer({ min: -10_000, max: 10_000 })),
    })
    .map(({ at: typedFor, source, age, dataAge, typedAt, currency, stale, btc, eth, change }): PricesState => {
      const at = source === 'live' ? instantFromEpochMs(Date.parse(NOW) - dataAge) : typedFor;
      const prices = { BTC: { EUR: scaled(btc, 2), USD: scaled(eth, 8) }, ETH: { EUR: scaled(eth, 2) } };
      const snapshot = { at, prices, ...(change === null ? {} : { change24h: { BTC: scaled(change, 2) } }) };
      const fetchedAt = source === 'live' ? instantFromEpochMs(Date.parse(NOW) - age) : typedAt;
      return { snapshot: snapshot as unknown as PriceSnapshot, currency, fetchedAt, stale, source };
    }),
);

const snapshotArb = fc
  .record({ plan: fc.option(planArb), entries: entriesArb, prefs: prefsArb, prices: pricesArb })
  .map((rows): Snapshot => ({ ...rows, quarantined: 0, newer: { plans: 0, entries: 0 }, newerTombstones: 0 }));

/** A prefs write keeps the stored changedAt; the stamp sets it, as a plan or entries write does. */
const stampOf = (prefs: Prefs): { changedAt?: Instant } =>
  prefs.changedAt === null ? {} : { changedAt: prefs.changedAt };

/** A fresh browser profile, a store on it, and the store closed afterwards. */
async function withStore<T>(run: (store: ReturnType<typeof idbPlanStore>) => Promise<T>): Promise<T> {
  globalThis.indexedDB = new IDBFactory();
  const store = idbPlanStore({ clock: { now: () => NOW } });
  try {
    return await run(store);
  } finally {
    await store.close();
  }
}

/** export → write the file → read → import → write → load → export, from a store that starts as `start`. */
function cycle(backup: BackupFile, start: Snapshot, mode: ImportMode): Promise<BackupFile> {
  return withStore(async (store) => {
    await store.write({ plan: start.plan, entries: start.entries });
    const read = readBackup(JSON.parse(JSON.stringify(writtenBackup(backup))));
    if (!read.ok) throw new Error(`The export did not read back: ${JSON.stringify(read.error)}`);
    const imported = applyImport(await store.load(), read.value, mode, NOW);
    await store.write({ plan: imported.plan, entries: imported.entries });
    const loaded = await store.load();
    if (loaded.plan === null) throw new Error('No plan after the import');
    return exportBackup(loaded.plan, loaded.entries, EXPORTED_AT);
  });
}

/**
 * A synthetic version 2, as in idb/database.test.ts: entries written without a plan get the live plan's
 * id, and entries gain an index. It changes stored rows, so running it twice would show.
 */
const backfillPlanIds: Migration = async (_database, transaction) => {
  const plans = (await transaction.objectStore('plans').getAll()) as { id: string; deletedAt: string | null }[];
  const live = plans.find((row) => row.deletedAt === null);
  const entries = transaction.objectStore('entries');
  for (const row of (await entries.getAll()) as Record<string, unknown>[]) {
    if (row.planId === null && live !== undefined) await entries.put({ ...row, planId: live.id });
  }
  const untyped = transaction as unknown as IDBPTransaction<unknown, string[], 'versionchange'>;
  untyped.objectStore('entries').createIndex('deletedAt', 'deletedAt');
};

/** The database's version and every store's records, as raw as IndexedDB keeps them. */
async function dump(): Promise<{ version: number; stores: Record<string, unknown[]> }> {
  const database = await openDB(DATABASE_NAME);
  try {
    const stores = Object.fromEntries(
      await Promise.all(STORE_NAMES.map(async (name) => [name, await database.getAll(name)] as const)),
    );
    return { version: database.version, stores };
  } finally {
    database.close();
  }
}

describe('idb plan store properties (ADR-0019)', () => {
  it('runs a migration once over any stored data: later opens change nothing', async () => {
    await fc.assert(
      fc.asyncProperty(
        snapshotArb,
        fc.boolean(),
        fc.integer({ min: 1, max: 4 }),
        async (snapshot, entriesFirst, reopens) => {
          globalThis.indexedDB = new IDBFactory();
          const v1 = idbPlanStore({ clock: { now: () => NOW } });
          const { prices, quarantined: _none, newer: _unread, plan, entries, prefs } = snapshot;
          // Entries written before the plan keep planId null at version 1, which the migration fills in.
          const rows = entriesFirst ? [{ entries }, { plan }] : [{ plan }, { entries }];
          for (const change of rows) await v1.write(change);
          await v1.write({ prefs, ...stampOf(prefs), ...(prices === null ? {} : { prices }) });
          await v1.close();

          const v2 = vi.fn(backfillPlanIds);
          const migrations = [...MIGRATIONS, v2];
          const first = idbPlanStore({ clock: { now: () => NOW }, migrations });
          expect(await first.load()).toStrictEqual(snapshot);
          await first.close();
          const upgraded = await dump();
          expect(upgraded.version).toBe(2);

          for (let open = 0; open < reopens; open += 1) {
            const again = idbPlanStore({ clock: { now: () => NOW }, migrations });
            expect(await again.load()).toStrictEqual(snapshot);
            await again.close();
          }
          expect(v2).toHaveBeenCalledTimes(1);
          expect(await dump()).toStrictEqual(upgraded);
        },
      ),
      { numRuns: 40 },
    );
  });

  it('keeps any valid snapshot unchanged through a write and a load', async () => {
    await fc.assert(
      fc.asyncProperty(snapshotArb, (snapshot) =>
        withStore(async (store) => {
          const { prices, quarantined: _none, newer: _unread, newerTombstones: _gone, ...rows } = snapshot;
          await store.write({ ...rows, ...stampOf(rows.prefs), ...(prices === null ? {} : { prices }) });
          expect(await store.load()).toStrictEqual(snapshot);
        }),
      ),
      { numRuns: 60 },
    );
  });

  it('writes a plan row at the lowest version that holds the plan, acknowledged or not, and reads it back exactly', async () => {
    await fc.assert(
      fc.asyncProperty(planArb, (plan) =>
        withStore(async (store) => {
          await store.write({ plan });
          const recorded = plan.riskAcknowledgedAt !== null || plan.riskWordingVersion !== 0;
          const [row] = (await dump()).stores.plans as { schemaVersion: number; payload: unknown }[];
          expect(row?.schemaVersion).toBe(recorded ? 3 : 2);
          // The previous build's schema reads every row written while nothing is recorded.
          expect(PreviousBuildPlanSchema.safeParse(row?.payload).success).toBe(!recorded);
          expect((await store.load()).plan).toStrictEqual(plan);
        }),
      ),
      { numRuns: 60 },
    );
  });

  it('makes the backup cycle a fixed point: imported rows are stamped once, then nothing changes', async () => {
    await fc.assert(
      fc.asyncProperty(
        planArb,
        entriesArb,
        fc.constantFrom<ImportMode>('replace', 'add-missing'),
        fc.boolean(),
        async (plan, entries, mode, fromSameDevice) => {
          const backup = exportBackup(plan, entries, EXPORTED_AT);
          const start = fromSameDevice ? { ...EMPTY_SNAPSHOT, plan, entries } : EMPTY_SNAPSHOT;
          const once = await cycle(backup, start, mode);
          expect(once.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
          expect(await cycle(once, start, mode)).toStrictEqual(once);
          const untouched = mode === 'add-missing' && fromSameDevice;
          // A row stored here at or after NOW is stamped one millisecond after it (docs/DOMAIN.md §3.13, ADR-0021).
          const storedAt = new Map(start.entries.map((entry) => [entry.id, entry.updatedAt]));
          const over = (at: Instant | undefined) => (at === undefined ? NOW : stampAfter(NOW, at));
          const stamped: BackupFile = {
            ...backup,
            plan: { ...backup.plan, updatedAt: over(start.plan?.updatedAt) },
            entries: backup.entries.map((entry) => ({ ...entry, updatedAt: over(storedAt.get(entry.id)) })),
          };
          expect(once).toStrictEqual(untouched ? backup : stamped);
        },
      ),
      { numRuns: 40 },
    );
  });

  it('stamps every entry row a delete or its undo writes strictly after the row as stored, whatever the clock', async () => {
    const laterThanStored = (stored: Snapshot, written: readonly Entry[]) => {
      for (const entry of written) {
        const row = stored.entries.find((each) => each.id === entry.id);
        if (row === undefined) throw new Error('an entry that was not stored');
        for (const stamp of [row.updatedAt, row.deletedAt]) {
          if (stamp !== null) expect(compareInstants(entry.updatedAt, stamp)).toBe(1);
        }
      }
    };
    await fc.assert(
      fc.asyncProperty(
        planArb,
        entriesArb,
        fc.array(fc.boolean(), { minLength: 12, maxLength: 12 }),
        async (plan, entries, picked) =>
          withStore(async (store) => {
            await store.write({ plan, entries });
            const ids = entries.filter((_, index) => picked[index]).map((entry) => entry.id);
            const box: { before?: SlotsAtDelete } = {};
            const deleted = await store.update((stored) => {
              const before = slotsAtDelete(stored.plan, stored.entries, ids, NOW);
              box.before = before;
              return { entries: deleteEntries(stored.entries, before.ids, before.at) };
            });
            laterThanStored(deleted.snapshot, deleted.changes.entries ?? []);
            const before = box.before;
            if (before === undefined) throw new Error('the delete did not run');
            const restored = await store.update((stored) => {
              if (stored.plan === null) return {};
              const result = restoreEntries(stored.plan, stored.entries, ids, before, NOW);
              return result.ok ? { entries: result.value } : {};
            });
            laterThanStored(restored.snapshot, restored.changes.entries ?? []);
          }),
      ),
      { numRuns: 40 },
    );
  });
});
