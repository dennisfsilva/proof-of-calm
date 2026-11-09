import 'fake-indexeddb/auto';
import {
  backupNeeded,
  type CalendarDate,
  type CoinId,
  type EntityId,
  type Entry,
  endBuying,
  exportBackup,
  type Instant,
  type Money,
  type Plan,
  readBackup,
} from '@proofofcalm/core';
import { FIXTURE_RULES, type FixtureCountry } from '@proofofcalm/core/testing/country-change';
import { IDBFactory } from 'fake-indexeddb';
import { type IDBPDatabase, openDB } from 'idb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import twoCoins from '../../../../core/test/golden/two-coins.json';
import { systemClock } from '../../lib/adapters/clock';
import { DATABASE_NAME } from '../../lib/adapters/idb/database';
import { type IdbPlanStore, idbPlanStore } from '../../lib/adapters/idb-store';
import { EMPTY_SNAPSHOT, memoryPlanStore } from '../../lib/adapters/memory-store';
import type { Snapshot } from '../../lib/ports';
import type { Services } from '../../lib/services';
import { fixtureSnapshot } from '../../lib/services/fixtures';
import { createTestServices, recordingPlatform } from '../../lib/services/testing';
import { crossTabChannel } from '../../lib/store/channel';
import { changeCountryOf, dataActions, savePlan } from './actions';

describe('dataActions', () => {
  // DOMAIN §3.13: the backup's moment is taken in its turn in the queue, so a write queued behind the
  // read stamps a later changedAt and the banner still asks for the backup that lacks it.
  it('exportJson: an entries write queued behind its read stamps a later changedAt, so a backup is still needed', async () => {
    // The device clock, as in production: the read and the write behind it run in the same millisecond.
    const clock = systemClock('Europe/Lisbon', () => Date.now());
    const snapshot = fixtureSnapshot();
    const [first] = snapshot.entries;
    if (first === undefined) throw new Error('the fixture has entries');
    const added: Entry = { ...first, id: '00000000-0000-4000-8000-000000009999' as Entry['id'] };
    const platform = recordingPlatform();
    const services = createTestServices({ planStore: memoryPlanStore(snapshot), clock, platform });
    await services.start();

    const exported = dataActions(services).exportJson();
    const written = services.domain.write({ entries: [added] });
    expect(await exported).toBe('saved');
    await written;

    const [download] = platform.calls.downloads;
    if (download === undefined) throw new Error('the backup was downloaded');
    const backup = JSON.parse(download.content) as { entries: { id: string }[] };
    expect(backup.entries.map(({ id }) => id)).not.toContain(added.id);
    const { prefs, entries } = services.domain.store.getState().snapshot;
    expect(entries.map(({ id }) => id)).toContain(added.id);
    expect(backupNeeded(entries, prefs, false)).toBe(true);
    services.dispose();
  });

  it('exportJson: writes a version 2 file with the v2 plan while nothing is recorded, which reads back as the plan', async () => {
    const snapshot = fixtureSnapshot();
    const platform = recordingPlatform();
    const services = createTestServices({ planStore: memoryPlanStore(snapshot), platform });
    await services.start();
    expect(snapshot.plan).toMatchObject({ riskAcknowledgedAt: null, riskWordingVersion: 0 });

    expect(await dataActions(services).exportJson()).toBe('saved');
    const [download] = platform.calls.downloads;
    if (download === undefined) throw new Error('the backup was downloaded');
    const file = JSON.parse(download.content) as { schemaVersion: number; plan: Record<string, unknown> };
    expect(file.schemaVersion).toBe(2);
    expect(file.plan).not.toHaveProperty('riskAcknowledgedAt');
    const read = readBackup(file);
    expect(read.ok && read.value.plan).toStrictEqual(snapshot.plan);
    services.dispose();
  });

  // DOMAIN §2.1: an amount is never converted, so add-missing takes nothing from a backup in another currency.
  it('importBackup: Add missing from a USD backup onto an EUR plan writes nothing and gives the refusal', async () => {
    const snapshot = fixtureSnapshot();
    if (snapshot.plan === null) throw new Error('the fixture has a plan');
    const services = createTestServices({ planStore: memoryPlanStore(snapshot) });
    await services.start();
    const before = services.domain.store.getState().snapshot;
    const [first] = snapshot.entries;
    if (first === undefined) throw new Error('the fixture has entries');
    const theirs: Entry = { ...first, id: '00000000-0000-4000-8000-000000009998' as Entry['id'] };
    const usd = exportBackup({ ...snapshot.plan, payCurrency: 'USD' }, [theirs], snapshot.plan.updatedAt);
    const outcome = await dataActions(services).importBackup(usd, 'add-missing');
    expect(outcome).toEqual({ kind: 'refused', refusal: { code: 'currency-mismatch', file: 'USD', plan: 'EUR' } });
    expect(services.domain.store.getState().snapshot).toStrictEqual(before);
    services.dispose();
  });
});

describe('dataActions.importPrototype (docs/DOMAIN.md §7)', () => {
  // The prototype's own export of the two-coins state: 18 purchases, kept ids, no adjustment needed.
  const prototype = twoCoins.state;
  const rules = async (code: string) => FIXTURE_RULES[code as FixtureCountry] ?? null;
  const started = async (snapshot: Snapshot) => {
    const services = createTestServices({ snapshot, rules });
    await services.start();
    return services;
  };
  const stored = (services: Services) => services.domain.store.getState().snapshot;

  it('with no plan, takes the plan in the confirmed country, with import-prototype entries, the prefs and the report', async () => {
    const services = await started({ ...EMPTY_SNAPSHOT, prefs: { ...EMPTY_SNAPSHOT.prefs, theme: 'dark' } });
    const outcome = await dataActions(services).importPrototype(prototype, 'replace', 'PT');
    expect(outcome).toMatchObject({ kind: 'imported', report: [], result: { added: 18 } });
    const { plan, entries, prefs } = stored(services);
    expect(plan).toMatchObject({ country: 'PT', countryRuleVersion: FIXTURE_RULES.PT.status.version });
    expect(entries).toHaveLength(18);
    expect(entries.every((entry) => entry.source === 'import-prototype' && entry.deletedAt === null)).toBe(true);
    expect(entries.map((entry) => entry.id)).toContain('p1001');
    expect(prefs).toMatchObject({ theme: 'system', chartRange: '30d', lastBackupAt: null });
    services.dispose();
  });

  it('over a plan, Replace keeps its country and id, and keeps what it removes as tombstones', async () => {
    const snapshot = fixtureSnapshot();
    if (snapshot.plan === null) throw new Error('the fixture has a plan');
    const services = await started(snapshot);
    const outcome = await dataActions(services).importPrototype(prototype, 'replace', 'DE');
    expect(outcome.kind).toBe('replaced');
    const { plan, entries } = stored(services);
    expect(plan).toMatchObject({ id: snapshot.plan.id, country: 'PT' });
    for (const entry of snapshot.entries) {
      expect(entries.find((row) => row.id === entry.id)?.deletedAt).not.toBeNull();
    }
    expect(entries.filter((entry) => entry.deletedAt === null)).toHaveLength(18);
    services.dispose();
  });

  it('over a plan, Add missing counts by id and keeps the plan and the preferences', async () => {
    const services = await started({ ...EMPTY_SNAPSHOT, prefs: { ...EMPTY_SNAPSHOT.prefs, theme: 'dark' } });
    const actions = dataActions(services);
    await actions.importPrototype(prototype, 'replace', 'PT');
    const before = stored(services);
    const lighter = { ...prototype, meta: { ...prototype.meta, theme: 'light' } };
    const outcome = await actions.importPrototype(lighter, 'add-missing', null);
    expect(outcome).toMatchObject({ kind: 'added', result: { added: 0, skipped: 18 } });
    expect(stored(services)).toStrictEqual(before);
    await services.domain.write({ prefs: { ...before.prefs, theme: 'dark' } });
    const fewer = { ...lighter, purchases: prototype.purchases.slice(0, 2) };
    await actions.importPrototype(fewer, 'replace', null);
    expect(stored(services).prefs.theme).toBe('light');
    services.dispose();
  });

  it('on Add missing, reports only what was stored: no note of the file’s plan, the purchases of a coin it lacks', async () => {
    const services = await started(EMPTY_SNAPSHOT);
    const actions = dataActions(services);
    await actions.importPrototype(prototype, 'replace', 'PT');
    const xrp = {
      id: 'p9001',
      kind: 'extra',
      date: '2026-03-10',
      coin: 'XRP',
      eur: 50,
      units: 100,
      fee: null,
      note: '',
    };
    const file = {
      ...prototype,
      settings: { ...prototype.settings, dcaDay: 31 },
      purchases: [...prototype.purchases, xrp],
    };
    const outcome = await actions.importPrototype(file, 'add-missing', null);
    expect(outcome).toMatchObject({ kind: 'added', result: { added: 1, skipped: 18 } });
    if (outcome.kind === 'invalid') throw new Error('the file is valid');
    expect(outcome.report).toEqual([{ code: 'coin-not-in-plan', coin: 'XRP', count: 1 }]);
    const { plan, entries } = stored(services);
    expect(plan).toMatchObject({ buyDay: 1, coins: [{ id: 'BTC' }, { id: 'ETH' }] });
    expect(entries.find((entry) => entry.id === 'p9001')).toMatchObject({ coin: 'XRP', deletedAt: null });
    services.dispose();
  });

  it('on Add missing, a file with settings.base USD onto an EUR plan writes nothing and gives the refusal', async () => {
    const services = await started(EMPTY_SNAPSHOT);
    const actions = dataActions(services);
    await actions.importPrototype({ ...prototype, purchases: prototype.purchases.slice(0, 2) }, 'replace', 'PT');
    const before = stored(services);
    const usd = { ...prototype, settings: { ...prototype.settings, base: 'USD' } };
    const outcome = await actions.importPrototype(usd, 'add-missing', null);
    expect(outcome).toEqual({
      kind: 'refused',
      refusal: { code: 'currency-mismatch', file: 'USD', plan: 'EUR' },
      report: [],
    });
    expect(stored(services)).toStrictEqual(before);
    services.dispose();
  });

  it('words the defaulted last buy and the clamped buy day with the values of the plan taken', async () => {
    const services = await started(EMPTY_SNAPSHOT);
    const settings = { ...prototype.settings, dcaDay: 31, lastBuy: '' };
    const outcome = await dataActions(services).importPrototype({ ...prototype, settings }, 'replace', 'PT');
    if (outcome.kind === 'invalid') throw new Error('the file is valid');
    const { plan } = stored(services);
    expect(outcome.report).toEqual(
      expect.arrayContaining([
        { code: 'last-buy-defaulted', date: plan?.lastBuy },
        { code: 'buy-day-clamped', day: plan?.buyDay },
      ]),
    );
    services.dispose();
  });

  it('writes nothing for a file whose plan is not valid, and gives its issues', async () => {
    const services = await started(EMPTY_SNAPSHOT);
    const invalid = { ...prototype, settings: { ...prototype.settings, monthly: 0, initial: 0 } };
    const outcome = await dataActions(services).importPrototype(invalid, 'replace', 'PT');
    expect(outcome).toEqual({ kind: 'invalid', issues: expect.arrayContaining([expect.stringMatching(/no-amount/)]) });
    expect(stored(services)).toStrictEqual(EMPTY_SNAPSHOT);
    services.dispose();
  });
});

describe('savePlan', () => {
  const started = async (snapshot = fixtureSnapshot()) => {
    const services = createTestServices({ snapshot });
    await services.start();
    return services;
  };
  const stored = (services: Awaited<ReturnType<typeof started>>) => services.domain.store.getState().snapshot.plan;

  // DOMAIN §6 "Edit the plan": the fields go onto the plan as stored in the save's turn, so a change
  // another tab wrote meanwhile to the other fields is kept.
  it('writes the fields onto the plan of its turn and stamps updatedAt', async () => {
    const services = await started();
    const other = services.domain.write(({ plan }) => ({ plan: { ...(plan as Plan), why: 'From another tab.' } }));
    const result = await savePlan(services, { monthlyAmount: '250' as Money });
    await other;
    expect(result.ok).toBe(true);
    const plan = stored(services);
    expect(plan?.monthlyAmount).toBe('250');
    expect(plan?.why).toBe('From another tab.');
    expect(plan?.updatedAt).not.toBe(fixtureSnapshot().plan?.updatedAt);
    expect(result.ok && result.value).toEqual(plan);
    services.dispose();
  });

  it.each([
    ['no-amount', { monthlyAmount: '0' as Money, startingAmount: '0' as Money }, ['monthlyAmount']],
    ['split-sum', { split: { BTC: '70', ETH: '20' } as Plan['split'] }, ['split']],
    ['last-buy-before-first-buy', { lastBuy: '2026-01-05' as CalendarDate }, ['lastBuy']],
    ['plan-too-long', { lastBuy: '2047-01-05' as CalendarDate }, ['lastBuy']],
  ] as const)('refuses %s with planIssues and writes nothing', async (code, fields, path) => {
    const services = await started();
    const before = stored(services);
    const result = await savePlan(services, fields);
    expect(result.ok ? [] : result.error).toContainEqual({ code, path });
    expect(stored(services)).toBe(before);
    services.dispose();
  });

  it('writes nothing when no field changed, and gives the plan of its turn', async () => {
    const services = await started();
    const before = stored(services);
    expect(await savePlan(services, {})).toEqual({ ok: true, value: before });
    expect(stored(services)).toBe(before);
    services.dispose();
  });

  it('saves nothing and gives no issue once the plan is gone', async () => {
    const services = await started({ ...fixtureSnapshot(), plan: null });
    expect(await savePlan(services, { monthlyAmount: '250' as Money })).toEqual({ ok: false, error: [] });
    expect(stored(services)).toBeNull();
    services.dispose();
  });

  // DOMAIN §2 and §6 "Edit the plan": a plan whose buying was ended has its last buy on the end day; an edit
  // that moves the last buy day clears the end, so buying runs to the new day, and any other edit keeps it.
  describe('on a plan whose buying was ended', () => {
    const ENDED_ON = '2026-10-20' as CalendarDate;
    const ended = () => {
      const snapshot = fixtureSnapshot();
      const result = endBuying(snapshot.plan as Plan, ENDED_ON, '2026-10-20T09:00:00.000Z' as Instant);
      if (!result.ok) throw new Error(result.error.code);
      return started({ ...snapshot, plan: result.value });
    };

    it.each([
      ['a later', '2027-03-05'],
      ['an earlier', '2026-09-05'],
    ] as const)('clears the end when the edit sets %s last buy day', async (_, lastBuy) => {
      const services = await ended();
      const result = await savePlan(services, { lastBuy: lastBuy as CalendarDate }, stored(services) as Plan);
      expect(result.ok).toBe(true);
      expect(stored(services)).toMatchObject({ lastBuy, endedBuyingOn: null });
      services.dispose();
    });

    it.each([
      ['only another field', { monthlyAmount: '250' as Money }],
      ['the same last buy day', { lastBuy: ENDED_ON, monthlyAmount: '250' as Money }],
    ] as const)('keeps the end when the edit changes %s', async (_, fields) => {
      const services = await ended();
      expect((await savePlan(services, fields, stored(services) as Plan)).ok).toBe(true);
      expect(stored(services)).toMatchObject({ monthlyAmount: '250', lastBuy: ENDED_ON, endedBuyingOn: ENDED_ON });
      services.dispose();
    });
  });
});

// #124 (B): two tabs over one store and the cross-tab channel. A tab's save sends the fields it changed with the
// plan as the tab opened it; a field another tab changed since refuses the save, so that change is never undone.
describe('savePlan with the plan as the tab opened it', () => {
  const tabs = async () => {
    const shared = memoryPlanStore(fixtureSnapshot());
    const open = async () => {
      const channel = crossTabChannel({ name: 'plan-save-test', tabId: crypto.randomUUID() });
      const services = createTestServices({ planStore: shared, channel });
      await services.start();
      return services;
    };
    const [a, b] = [await open(), await open()];
    return {
      shared,
      a,
      b,
      dispose: () => {
        a.dispose();
        b.dispose();
      },
    };
  };
  const planOf = (services: Awaited<ReturnType<typeof tabs>>['a']) =>
    services.domain.store.getState().snapshot.plan as Plan;
  const SOL = { id: 'SOL' as CoinId, name: 'Solana', geckoId: 'solana', decimals: 4 };

  it('refuses plan-changed when another tab changed a field it sends, writing nothing', async () => {
    const { shared, a, b, dispose } = await tabs();
    const opened = planOf(a);
    const added = { coins: [...opened.coins, SOL], split: { BTC: '50', ETH: '30', SOL: '20' } as Plan['split'] };
    expect((await savePlan(b, added, planOf(b))).ok).toBe(true);
    await vi.waitFor(() => expect(planOf(a).coins).toHaveLength(3));
    const result = await savePlan(a, { coins: opened.coins, split: { BTC: '60', ETH: '40' } as Plan['split'] }, opened);
    expect(result).toEqual({ ok: false, error: { code: 'plan-changed', plan: planOf(b) } });
    expect(shared.current().plan?.coins.map((coin) => coin.id)).toEqual(['BTC', 'ETH', 'SOL']);
    expect(shared.current().plan?.split).toEqual(added.split);
    dispose();
  });

  it('still saves when another tab changed only fields it does not send', async () => {
    const { shared, a, b, dispose } = await tabs();
    const opened = planOf(a);
    expect((await savePlan(b, { monthlyAmount: '300' as Money }, planOf(b))).ok).toBe(true);
    await vi.waitFor(() => expect(planOf(a).monthlyAmount).toBe('300'));
    expect((await savePlan(a, { split: { BTC: '60', ETH: '40' } as Plan['split'] }, opened)).ok).toBe(true);
    expect(shared.current().plan).toMatchObject({ monthlyAmount: '300', split: { BTC: '60', ETH: '40' } });
    dispose();
  });
});

describe('changeCountryOf (docs/DOMAIN.md §6 "Change country")', () => {
  const started = async (fields: Partial<Plan> = {}) => {
    const snapshot = fixtureSnapshot();
    const plan = { ...(snapshot.plan as Plan), ...fields };
    const services = createTestServices({ snapshot: { ...snapshot, plan } });
    await services.start();
    return services;
  };
  const stored = (services: Awaited<ReturnType<typeof started>>) => services.domain.store.getState().snapshot.plan;
  // Opens a day after the last buy (5 Mar 2027) passes Portugal's 365 days (4 Mar 2028), before Germany's year.
  const early = { opens: '2028-03-05', closes: '2028-08-31', exitBy: '2028-12-31' } as NonNullable<Plan['sellWindow']>;

  it('stores the plan re-derived for the country on the plan as stored, its entries untouched', async () => {
    const services = await started();
    const opened = stored(services) as Plan;
    const before = services.domain.store.getState().snapshot.entries;
    expect(await changeCountryOf(services, FIXTURE_RULES.DE, opened, false, null)).toEqual({
      ok: true,
      value: { written: true },
    });
    expect(stored(services)).toMatchObject({ country: 'DE', holdingRule: FIXTURE_RULES.DE.holdingRule });
    expect(services.domain.store.getState().snapshot.entries).toBe(before);
  });

  it('refuses plan-changed when the country, the rule, the window or the last buy moved since it opened', async () => {
    const moves: Partial<Plan>[] = [
      { lastBuy: '2028-09-01' as Plan['lastBuy'] },
      { country: 'XX' as Plan['country'] },
      { holdingRule: { kind: 'none' } },
      { sellWindow: null },
      { payCurrency: 'USD' },
    ];
    for (const moved of moves) {
      const services = await started();
      const opened = stored(services) as Plan;
      await services.domain.write(({ plan }) => ({ plan: { ...(plan as Plan), ...moved } }));
      const current = stored(services);
      const result = await changeCountryOf(services, FIXTURE_RULES.DE, opened, false, null);
      expect(result).toEqual({ ok: false, error: { code: 'plan-changed', plan: current } });
      expect(stored(services)).toBe(current);
    }
  });

  it('refuses a window the new rule makes early until accepted, then stores the acceptance', async () => {
    const services = await started({ sellWindow: early });
    const opened = stored(services) as Plan;
    const refused = await changeCountryOf(services, FIXTURE_RULES.DE, opened, false, null);
    expect(refused.ok ? [] : refused.error).toEqual([
      { code: 'sell-window-before-eligibility', path: ['sellWindow', 'opens'] },
    ]);
    expect(stored(services)).toBe(opened);
    expect((await changeCountryOf(services, FIXTURE_RULES.DE, opened, true, null)).ok).toBe(true);
    expect(stored(services)?.sellWindow).toEqual({ ...early, acceptedEarlyOpen: true });
  });

  it('records no acceptance on a window that opens in time, and writes nothing when nothing changes', async () => {
    const services = await started();
    const opened = stored(services) as Plan;
    expect(await changeCountryOf(services, FIXTURE_RULES.PT, opened, true, null)).toEqual({
      ok: true,
      value: { written: false },
    });
    expect(stored(services)).toBe(opened);
    await changeCountryOf(services, FIXTURE_RULES.DE, opened, true, null);
    expect(stored(services)?.sellWindow).toEqual(opened.sellWindow);
  });

  describe('the currency question (ADR-0053)', () => {
    const uk = { ...FIXTURE_RULES.DE, code: 'GB' as Plan['country'], currency: 'GBP' as const };
    const withEntries = async (entries: readonly Entry[]) => {
      const snapshot = fixtureSnapshot();
      const services = createTestServices({ snapshot: { ...snapshot, entries } });
      await services.start();
      return services;
    };
    const [logged] = fixtureSnapshot().entries;

    it('refuses plan-changed when another tab logs an amount the screen asked nothing about', async () => {
      const services = await withEntries([]);
      const opened = stored(services) as Plan;
      await services.domain.write({ entries: [logged as Entry] });
      const current = stored(services);
      expect(await changeCountryOf(services, uk, opened, false, null)).toEqual({
        ok: false,
        error: { code: 'plan-changed', plan: current },
      });
      expect(stored(services)).toBe(current);
    });

    it('keeps the currencies on keep, follows the country without entries, and takes them on country', async () => {
      const kept = await withEntries([logged as Entry]);
      await changeCountryOf(kept, uk, stored(kept) as Plan, false, 'keep');
      expect(stored(kept)).toMatchObject({ country: 'GB', payCurrency: 'EUR', displayCurrency: 'EUR' });
      const empty = await withEntries([]);
      await changeCountryOf(empty, uk, stored(empty) as Plan, false, null);
      expect(stored(empty)).toMatchObject({ country: 'GB', payCurrency: 'GBP', displayCurrency: 'GBP' });
      const corrected = await withEntries([logged as Entry]);
      await changeCountryOf(corrected, uk, stored(corrected) as Plan, false, 'country');
      expect(stored(corrected)).toMatchObject({ country: 'GB', payCurrency: 'GBP', displayCurrency: 'GBP' });
    });

    it('keeps the answer when another tab deleted the entries it was given for', async () => {
      const services = await withEntries([logged as Entry]);
      const opened = stored(services) as Plan;
      await services.domain.write({ entries: [{ ...(logged as Entry), deletedAt: opened.updatedAt }] });
      await changeCountryOf(services, uk, opened, false, 'keep');
      expect(stored(services)).toMatchObject({ country: 'GB', payCurrency: 'EUR', displayCurrency: 'EUR' });
    });
  });

  it('saves nothing once the plan is gone', async () => {
    const services = await started();
    const opened = stored(services) as Plan;
    await services.domain.write({ plan: null });
    expect(await changeCountryOf(services, FIXTURE_RULES.DE, opened, false, null)).toEqual({ ok: false, error: [] });
  });
});

// A plan holds at most MAX_ENTRIES live entries (docs/DOMAIN.md §9), so that its next export reads back (§3.13). The
// forward read: what an accepted import leaves exports a file that readBackup takes. The rollback read: a refused
// import leaves the store as it was, and that store still exports a file that reads back.
describe('dataActions, the entry cap (docs/DOMAIN.md §3.13)', () => {
  const rules = async (code: string) => FIXTURE_RULES[code as FixtureCountry] ?? null;
  const exportedAt = '2026-10-20T10:00:00.000Z' as Instant;
  const snapshot = fixtureSnapshot();
  const { plan } = snapshot;
  const [base] = snapshot.entries;
  if (plan === null || base === undefined) throw new Error('the fixture has a plan and entries');
  const here = snapshot.entries.filter((entry) => entry.deletedAt === null).length;
  /** `count` extra buys under ids of their own, from `from` on, so that two batches never share one. */
  const extras = (count: number, from: number): Entry[] =>
    Array.from({ length: count }, (_, index) => ({
      ...base,
      id: `10000000-0000-4000-8000-${String(from + index).padStart(12, '0')}` as Entry['id'],
      kind: 'extra',
      slot: null,
      deletedAt: null,
    }));
  const mine = [...snapshot.entries, ...extras(6_000 - here, 0)];
  const started = async (entries: readonly Entry[]) => {
    const platform = recordingPlatform();
    const services = createTestServices({ snapshot: { ...snapshot, entries }, rules, platform });
    await services.start();
    return { services, platform };
  };
  /** The store's next JSON export, read back as an import reads it. */
  const nextExport = async (services: Services, platform: ReturnType<typeof recordingPlatform>) => {
    expect(await dataActions(services).exportJson()).toBe('saved');
    const download = platform.calls.downloads.at(-1);
    if (download === undefined) throw new Error('the backup was downloaded');
    return readBackup(JSON.parse(download.content));
  };

  it('Add missing up to exactly 10,000 live entries imports, and the next export reads back', async () => {
    const { services, platform } = await started(mine);
    const file = exportBackup(plan, extras(4_000, 100_000), exportedAt);
    const outcome = await dataActions(services).importBackup(file, 'add-missing');
    expect(outcome).toMatchObject({ kind: 'added', result: { added: 4_000, refused: null } });
    const read = await nextExport(services, platform);
    expect(read.ok && read.value.entries.length).toBe(10_000);
    services.dispose();
  });

  it('Add missing past 10,000 is refused; the store stays as it was and still exports a file that reads back', async () => {
    const { services, platform } = await started(mine);
    const before = services.domain.store.getState().snapshot;
    const file = exportBackup(plan, extras(6_000, 100_000), exportedAt);
    const outcome = await dataActions(services).importBackup(file, 'add-missing');
    const refusal = { code: 'too-many-entries', entries: 12_000, file: 6_000, max: 10_000 };
    expect(outcome).toEqual({ kind: 'refused', refusal });
    expect(services.domain.store.getState().snapshot).toStrictEqual(before);
    expect((await nextExport(services, platform)).ok).toBe(true);
    services.dispose();
  });

  it('a DCA plan page file of 10,001 purchases is refused over a plan and with none, and nothing is written', async () => {
    const [purchase] = twoCoins.state.purchases;
    const many = { ...twoCoins.state, purchases: Array.from({ length: 10_001 }, () => ({ ...purchase })) };
    const refused = {
      kind: 'refused',
      refusal: { code: 'too-many-entries', entries: 10_001, file: 10_001, max: 10_000 },
    };
    const { services } = await started(snapshot.entries);
    const before = services.domain.store.getState().snapshot;
    expect(await dataActions(services).importPrototype(many, 'replace', null)).toEqual({ ...refused, report: [] });
    expect(services.domain.store.getState().snapshot).toStrictEqual(before);
    services.dispose();

    const empty = createTestServices({ snapshot: EMPTY_SNAPSHOT, rules });
    await empty.start();
    const nothing = empty.domain.store.getState().snapshot;
    expect(await dataActions(empty).importPrototype(many, 'replace', 'PT')).toEqual({ ...refused, report: [] });
    expect(empty.domain.store.getState().snapshot).toStrictEqual(nothing);
    empty.dispose();
  });
});

type StoredRow = { readonly id: string };
type Rewrite = (db: IDBPDatabase, plan: StoredRow, entry: StoredRow) => Promise<void>;

// Decided 2026-10-30 (docs/DOMAIN.md §3.13): over the real store, since the rows a newer build wrote exist only there.
describe('dataActions beside rows from a newer version (docs/DOMAIN.md §3.13)', () => {
  const NOW = '2026-10-30T09:00:00.000Z' as Instant;
  const BACKED_UP = '2026-09-01T09:00:00.000Z' as Instant;
  const OTHER_PLAN = '00000000-0000-4000-8000-000000009997' as EntityId;
  const rules = async (code: string) => FIXTURE_RULES[code as FixtureCountry] ?? null;
  const refused = { kind: 'refused', refusal: { code: 'newer-rows' } };
  let opened: IdbPlanStore | null = null;
  let closing: (() => void) | null = null;

  afterEach(async () => {
    closing?.();
    await opened?.close();
  });

  /** The synced stores as stored; the prices the services fetch at the start are not what these tests watch. */
  async function synced() {
    const db = await openDB(DATABASE_NAME);
    try {
      const [plans, entries, outbox] = await Promise.all(['plans', 'entries', 'outbox'].map((name) => db.getAll(name)));
      return { plans, entries, outbox };
    } finally {
      db.close();
    }
  }

  const unknown = { payload: { shape: 'unknown here' } };
  const deleted = { deletedAt: BACKED_UP, updatedAt: BACKED_UP };

  /** As a newer build stored it: the first entry's row, or what a test's `rewrite` does to the stored rows. */
  const newerEntry: Rewrite = async (db, _plan, entry) => {
    await db.put('entries', { ...entry, ...unknown, schemaVersion: 4 });
  };

  /** A tombstone of a newer build at OTHER_PLAN, the id of the plan in a test's file. */
  const newerPlanTombstone: Rewrite = async (db, plan) => {
    await db.put('plans', { ...plan, ...unknown, ...deleted, id: OTHER_PLAN, schemaVersion: 4 });
  };

  /** The fixture's plan and entries in the idb store, then the rows a newer build left. */
  async function started(rewrite: Rewrite = newerEntry) {
    globalThis.indexedDB = new IDBFactory();
    const snapshot = fixtureSnapshot();
    const { plan, entries } = snapshot;
    const [newer, kept] = entries;
    if (plan === null || newer === undefined || kept === undefined) throw new Error('the fixture has a plan');
    const planStore = idbPlanStore({ clock: { now: () => NOW } });
    opened = planStore;
    await planStore.write({ plan, entries, prefs: { ...snapshot.prefs, lastBackupAt: BACKED_UP } });
    const db = await openDB(DATABASE_NAME);
    await rewrite(db, await db.get('plans', plan.id), await db.get('entries', newer.id));
    db.close();
    const platform = recordingPlatform();
    const services = createTestServices({ planStore, platform, rules });
    closing = services.dispose;
    await services.start();
    const before = await synced();
    return { services, platform, planStore, plan, newer, kept, before };
  }

  it('add-missing over a newer entry of the same id is refused and writes nothing', async () => {
    const { services, plan, newer, before } = await started();
    const file = exportBackup(plan, [newer], NOW);
    expect(await dataActions(services).importBackup(file, 'add-missing')).toEqual(refused);
    expect(await synced()).toStrictEqual(before);
  });

  it('replace over a newer entry of the same id is refused', async () => {
    const { services, plan, newer, before } = await started();
    const file = exportBackup({ ...plan, id: OTHER_PLAN }, [newer], NOW);
    expect(await dataActions(services).importBackup(file, 'replace')).toEqual(refused);
    expect(await synced()).toStrictEqual(before);
  });

  it('replace beside a newer entry of the replaced plan is refused', async () => {
    const { services, plan, kept, before } = await started();
    const file = exportBackup({ ...plan, id: OTHER_PLAN }, [kept], NOW);
    expect(await dataActions(services).importBackup(file, 'replace')).toEqual(refused);
    expect(await synced()).toStrictEqual(before);
  });

  it('a DCA plan page import beside a newer entry is refused', async () => {
    const { services, before } = await started();
    for (const mode of ['replace', 'add-missing'] as const) {
      const outcome = await dataActions(services).importPrototype(twoCoins.state, mode, null);
      expect(outcome).toEqual({ ...refused, report: [] });
    }
    expect(await synced()).toStrictEqual(before);
  });

  it('replace beside a newer plan tombstone of the same id is refused and writes nothing', async () => {
    const { services, plan, kept, before } = await started(newerPlanTombstone);
    const file = exportBackup({ ...plan, id: OTHER_PLAN }, [kept], NOW);
    const shown = services.domain.store.getState().snapshot;
    expect(await dataActions(services).importBackup(file, 'replace')).toEqual(refused);
    expect(await synced()).toStrictEqual(before);
    expect(services.domain.store.getState().snapshot.plan).toStrictEqual(shown.plan);
    expect(services.domain.store.getState().snapshot.entries).toStrictEqual(shown.entries);
  });

  it('an import with no readable plan beside a newer plan tombstone is refused', async () => {
    const { services, plan, kept, before } = await started(async (db, row, entry) => {
      await newerPlanTombstone(db, row, entry);
      await db.delete('plans', row.id);
      await db.clear('entries');
    });
    const file = exportBackup({ ...plan, id: OTHER_PLAN }, [kept], NOW);
    expect(await dataActions(services).importBackup(file, 'replace')).toEqual(refused);
    expect(await synced()).toStrictEqual(before);
    expect(services.domain.store.getState().snapshot.plan).toBeNull();
  });

  it('add-missing beside a newer entry tombstone is refused and writes nothing', async () => {
    const { services, plan, newer, before } = await started(async (db, _plan, entry) => {
      await db.put('entries', { ...entry, ...unknown, ...deleted, schemaVersion: 4 });
    });
    const file = exportBackup(plan, [newer], NOW);
    expect(await dataActions(services).importBackup(file, 'add-missing')).toEqual(refused);
    expect(await synced()).toStrictEqual(before);
    expect(services.domain.store.getState().snapshot.entries.map(({ id }) => id)).not.toContain(newer.id);
  });

  it('a newer plan alone refuses an import as newer entries do', async () => {
    const snapshot = fixtureSnapshot();
    if (snapshot.plan === null) throw new Error('the fixture has a plan');
    const services = createTestServices({ snapshot: { ...snapshot, newer: { plans: 1, entries: 0 } } });
    await services.start();
    const file = exportBackup(snapshot.plan, snapshot.entries, NOW);
    expect(await dataActions(services).importBackup(file, 'replace')).toEqual(refused);
    services.dispose();
  });

  it('an export with newer entries leaves lastBackupAt as it was', async () => {
    const { services, platform, planStore, newer } = await started();
    expect(await dataActions(services).exportJson()).toBe('saved');
    const [download] = platform.calls.downloads;
    if (download === undefined) throw new Error('the backup was downloaded');
    const backup = JSON.parse(download.content) as { entries: { id: string }[] };
    expect(backup.entries.map(({ id }) => id)).not.toContain(newer.id);
    expect((await planStore.load()).prefs.lastBackupAt).toBe(BACKED_UP);
    expect(services.domain.store.getState().snapshot.prefs.lastBackupAt).toBe(BACKED_UP);
  });

  it('an export beside newer tombstones alone stamps lastBackupAt', async () => {
    const { services, planStore } = await started(async (db, row, entry) => {
      await newerPlanTombstone(db, row, entry);
      await db.put('entries', { ...entry, ...unknown, ...deleted, schemaVersion: 4 });
    });
    expect(await dataActions(services).exportJson()).toBe('saved');
    const stamped = (await planStore.load()).prefs.lastBackupAt;
    expect(stamped).not.toBe(BACKED_UP);
    expect(services.domain.store.getState().snapshot.prefs.lastBackupAt).toBe(stamped);
  });
});
