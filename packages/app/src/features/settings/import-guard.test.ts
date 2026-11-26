// The imports' turn checks what the screen showed (ADR-0053 Readings, 2026-11-26; docs/DOMAIN.md §3.13): a plan
// another tab stored meanwhile, or a kept-currency question the screen did not show, refuses with `changed` and
// writes nothing. Forward: what an import answered in the file's currency writes reads back through the current row
// readers. Rollback: a `changed` refusal leaves the stored rows byte for byte as they were.
import 'fake-indexeddb/auto';
import {
  type CurrencyCode,
  type Entry,
  exportBackup,
  type ImportMode,
  liveEntries,
  type Plan,
} from '@proofofcalm/core';
import { anEntry, aPlan, date, id, instant, money, split } from '@proofofcalm/core/testing';
import { FIXTURE_RULES, type FixtureCountry } from '@proofofcalm/core/testing/country-change';
import { IDBFactory } from 'fake-indexeddb';
import fc from 'fast-check';
import { openDB } from 'idb';
import { afterEach, describe, expect, it } from 'vitest';
import twoCoins from '../../../../core/test/golden/two-coins.json';
import { DATABASE_NAME, STORE_NAMES } from '../../lib/adapters/idb/database';
import { type IdbPlanStore, idbPlanStore } from '../../lib/adapters/idb-store';
import { EMPTY_SNAPSHOT } from '../../lib/adapters/memory-store';
import type { Snapshot } from '../../lib/ports';
import { createTestServices } from '../../lib/services/testing';
import { dataActions } from './actions';
import { type ImportShown, importShown, prototypeCurrency, turnRefusal } from './import-guard';

const NOW = instant('2026-10-20T09:00:00.000Z');
const rules = async (code: string) => FIXTURE_RULES[code as FixtureCountry] ?? null;
const changed = { kind: 'refused', refusal: { code: 'changed' } };
const NOTHING_SHOWN: ImportShown = { planShown: false, question: null };

/** Fourteen live entries with amounts, from 1 to 14 January 2026; `kept` stores them beside a set-aside plan row. */
const keptEntries = (): Entry[] =>
  Array.from({ length: 14 }, (_, n) => anEntry({ date: date(`2026-01-${String(n + 1).padStart(2, '0')}`) }));
const kept = (currency: CurrencyCode | null, entries = keptEntries()): Snapshot => ({
  ...EMPTY_SNAPSHOT,
  entries,
  quarantined: 1,
  setAside: { plans: [{ id: 'plan', at: NOW, currency }], entries: [] },
});
const fileIn = (currency: CurrencyCode, entries: readonly Entry[] = []) =>
  exportBackup(aPlan({ id: id(), payCurrency: currency, displayCurrency: currency }), entries, NOW);

async function started(snapshot: Snapshot) {
  const services = createTestServices({ snapshot, rules });
  await services.start();
  return services;
}
const stored = (services: Awaited<ReturnType<typeof started>>) => services.domain.store.getState().snapshot;

describe('dataActions: the import’s turn checks what the screen showed (ADR-0053)', () => {
  it('a no-plan import over a plan another tab stored refuses with changed and writes nothing', async () => {
    // The screen showed no plan; meanwhile another tab stored one beside the 14 entries.
    const plan = aPlan();
    const services = await started({ ...EMPTY_SNAPSHOT, plan, entries: keptEntries() });
    const before = stored(services);
    expect(liveEntries(before.entries)).toHaveLength(14);
    expect(await dataActions(services).importBackup(fileIn('EUR'), 'replace', NOTHING_SHOWN)).toEqual(changed);
    expect(stored(services)).toStrictEqual(before);
    services.dispose();
  });

  it('a question the screen did not show refuses with changed, for a backup and a DCA plan page file', async () => {
    const services = await started(kept('EUR'));
    const before = stored(services);
    const actions = dataActions(services);
    expect(await actions.importBackup(fileIn('GBP'), 'replace', NOTHING_SHOWN)).toEqual(changed);
    const gbp = { ...twoCoins.state, settings: { ...twoCoins.state.settings, base: 'GBP' } };
    expect(await actions.importPrototype(gbp, 'replace', 'PT', NOTHING_SHOWN)).toEqual({ ...changed, report: [] });
    // A question shown for another currency, or for other entries, is not the one the turn finds either.
    const shown = importShown(before, { kind: 'backup', file: fileIn('GBP') });
    const other = { planShown: false, question: shown.question && { ...shown.question, next: 'USD' as const } };
    expect(await actions.importBackup(fileIn('GBP'), 'replace', other)).toEqual(changed);
    const fewer = { planShown: false, question: shown.question && { ...shown.question, count: 13 } };
    expect(await actions.importBackup(fileIn('GBP'), 'replace', fewer)).toEqual(changed);
    expect(stored(services)).toStrictEqual(before);
    services.dispose();
  });

  it('the question the screen showed imports the file’s plan and keeps the entries, which then show in its currency', async () => {
    const services = await started(kept('EUR'));
    const file = fileIn('GBP');
    const shown = importShown(stored(services), { kind: 'backup', file });
    expect(shown).toMatchObject({ planShown: false, question: { kept: 'EUR', next: 'GBP', count: 14 } });
    expect(await dataActions(services).importBackup(file, 'replace', shown)).toMatchObject({ kind: 'imported' });
    expect(stored(services).plan).toMatchObject({ id: file.plan.id, payCurrency: 'GBP', displayCurrency: 'GBP' });
    expect(liveEntries(stored(services).entries)).toHaveLength(14);
    services.dispose();
  });

  it('a DCA plan page file whose base does not read is asked about as the EUR plan its import writes', async () => {
    const unread = { ...twoCoins.state, settings: { ...twoCoins.state.settings, base: 'SEK' } };
    expect(prototypeCurrency(unread)).toBe('EUR');
    const services = await started(kept('EUR'));
    const shown = importShown(stored(services), { kind: 'prototype', json: unread, count: 0 });
    expect(shown).toStrictEqual(NOTHING_SHOWN);
    const outcome = await dataActions(services).importPrototype(unread, 'replace', 'PT', shown);
    expect(outcome).toMatchObject({ kind: 'imported' });
    expect(stored(services).plan?.payCurrency).toBe('EUR');
    services.dispose();

    const gbp = await started(kept('GBP'));
    const asked = importShown(stored(gbp), { kind: 'prototype', json: unread, count: 0 });
    expect(asked.question).toMatchObject({ kept: 'GBP', next: 'EUR' });
    expect(await dataActions(gbp).importPrototype(unread, 'replace', 'PT', asked)).toMatchObject({ kind: 'imported' });
    gbp.dispose();
  });

  it('a plan shown and still stored replaces as before, and one deleted meanwhile imports when no question arises', async () => {
    const plan = aPlan();
    const services = await started({ ...EMPTY_SNAPSHOT, plan, entries: [anEntry()] });
    const shown = importShown(stored(services), { kind: 'backup', file: fileIn('EUR') });
    expect(shown).toStrictEqual({ planShown: true, question: null });
    expect(await dataActions(services).importBackup(fileIn('EUR'), 'replace', shown)).toMatchObject({
      kind: 'replaced',
    });
    services.dispose();

    const empty = await started(EMPTY_SNAPSHOT);
    const outcome = await dataActions(empty).importBackup(fileIn('GBP'), 'replace', {
      planShown: true,
      question: null,
    });
    expect(outcome).toMatchObject({ kind: 'imported' });
    empty.dispose();
  });
});

describe('turnRefusal (ADR-0053)', () => {
  const currencies = fc.constantFrom<CurrencyCode>('EUR', 'USD', 'GBP', 'CHF');
  const question = fc.option(
    fc.record({
      kept: fc.option(currencies),
      next: currencies,
      count: fc.nat(20),
      first: fc.constant(date('2026-01-01')),
      last: fc.constant(date('2026-02-01')),
    }),
  );

  it('never lets a no-plan import write over a stored plan, whatever question was shown', () => {
    fc.assert(
      fc.property(currencies, fc.option(currencies), question, fc.nat(3), (file, setAside, shown, count) => {
        const entries = Array.from({ length: count }, () => anEntry());
        const snapshot = { ...kept(setAside, entries), plan: aPlan() };
        expect(turnRefusal(snapshot, file, { planShown: false, question: shown })).toEqual({ code: 'changed' });
      }),
      { numRuns: 200 },
    );
  });

  it('refuses rows a newer version wrote before it looks at what was shown', () => {
    const newer = { ...kept('EUR'), newerTombstones: 1 };
    expect(turnRefusal(newer, 'GBP', importShown(newer, { kind: 'backup', file: fileIn('GBP') }))).toEqual({
      code: 'newer-rows',
    });
  });

  it('a no-plan import with planShown false never writes over a stored plan (the action, over the memory store)', async () => {
    await fc.assert(
      fc.asyncProperty(currencies, fc.constantFrom<ImportMode>('replace', 'add-missing'), async (currency, mode) => {
        const plan = aPlan({ split: split({ BTC: '70', ETH: '30' }), monthlyAmount: money('100') });
        const services = await started({ ...EMPTY_SNAPSHOT, plan, entries: [anEntry()] });
        const before = stored(services);
        expect(await dataActions(services).importBackup(fileIn(currency), mode, NOTHING_SHOWN)).toEqual(changed);
        expect(stored(services)).toStrictEqual(before);
        services.dispose();
      }),
      { numRuns: 16 },
    );
  });
});

// Over the real store (app-storage rule): a plan row set aside by the load, its currency readable, two entries kept.
describe('dataActions over the idb store beside a set-aside plan (ADR-0053, ADR-0019)', () => {
  const opened: IdbPlanStore[] = [];
  let closing: (() => void) | null = null;
  afterEach(async () => {
    closing?.();
    await Promise.all(opened.splice(0).map((store) => store.close()));
  });

  const open = () => {
    const store = idbPlanStore({ clock: { now: () => NOW } });
    opened.push(store);
    return store;
  };
  const withDb = async <T>(run: (db: Awaited<ReturnType<typeof openDB>>) => Promise<T>) => {
    const db = await openDB(DATABASE_NAME);
    try {
      return await run(db);
    } finally {
      db.close();
    }
  };
  /** Every store's keys and values as stored. */
  const dump = () =>
    withDb(async (db) => {
      const stores: Record<string, unknown> = {};
      for (const name of STORE_NAMES) stores[name] = { keys: await db.getAllKeys(name), values: await db.getAll(name) };
      return JSON.stringify(stores);
    });

  /** An EUR plan and two entries stored by this build, then the plan row made unreadable; the services started. */
  async function setAside(): Promise<{ plan: Plan; entries: Entry[]; services: Awaited<ReturnType<typeof started>> }> {
    globalThis.indexedDB = new IDBFactory();
    const plan = aPlan();
    const entries = [anEntry(), anEntry({ date: date('2026-02-01') })];
    await open().write({ plan, entries });
    const [row] = await withDb((db) => db.getAll('plans'));
    await withDb((db) => db.put('plans', { ...row, payload: { ...plan, split: split({ BTC: '70', ETH: '20' }) } }));
    const services = createTestServices({ planStore: open(), rules });
    closing = services.dispose;
    await services.start();
    expect(stored(services)).toMatchObject({ plan: null, setAside: { plans: [{ currency: 'EUR' }] } });
    return { plan, entries, services };
  }

  it('forward read: Import in GBP writes rows that read back through the current row readers', async () => {
    const { entries, services } = await setAside();
    const file = fileIn('GBP');
    const shown = importShown(stored(services), { kind: 'backup', file });
    expect(shown.question).toMatchObject({ kept: 'EUR', next: 'GBP', count: 2 });
    expect(await dataActions(services).importBackup(file, 'replace', shown)).toMatchObject({ kind: 'imported' });
    const read = await open().load();
    expect(read.plan).toStrictEqual(stored(services).plan);
    expect(read.plan).toMatchObject({ id: file.plan.id, payCurrency: 'GBP', displayCurrency: 'GBP' });
    expect(read.entries.map(({ id, amount }) => ({ id, amount }))).toStrictEqual(
      entries.map(({ id, amount }) => ({ id, amount })),
    );
    const rows = await withDb((db) => db.getAll('entries'));
    expect(rows.map((row: { planId: unknown }) => row.planId)).toStrictEqual([file.plan.id, file.plan.id]);
  });

  it('rollback read: a changed refusal leaves the stored rows byte for byte unchanged', async () => {
    const { services } = await setAside();
    const before = await dump();
    const actions = dataActions(services);
    expect(await actions.importBackup(fileIn('GBP'), 'replace', NOTHING_SHOWN)).toEqual(changed);
    expect(await actions.importBackup(fileIn('GBP'), 'add-missing', NOTHING_SHOWN)).toEqual(changed);
    const gbp = { ...twoCoins.state, settings: { ...twoCoins.state.settings, base: 'GBP' } };
    expect(await actions.importPrototype(gbp, 'replace', 'PT', NOTHING_SHOWN)).toEqual({ ...changed, report: [] });
    expect(await dump()).toBe(before);
  });
});
