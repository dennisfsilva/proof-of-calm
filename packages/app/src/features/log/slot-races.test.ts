// @vitest-environment node
import {
  actionsNow,
  applyImport,
  type CoinId,
  type EntityId,
  EntityIdSchema,
  exportBackup,
  isOpen,
  liveEntries,
  oneTapEntries,
  type TransactionDraft,
} from '@proofofcalm/core';
import { date, money, month, units } from '@proofofcalm/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryPlanStore } from '../../lib/adapters/memory-store';
import { createNumberInput } from '../../lib/format';
import type { Snapshot } from '../../lib/ports';
import type { Services } from '../../lib/services';
import { fixtureNowMs, fixtureSnapshot } from '../../lib/services/fixtures';
import { createTestServices, FIXTURE_PRICES } from '../../lib/services/testing';
import { crossTabChannel } from '../../lib/store/channel';
import { logActions } from './actions';
import { initialState, saveOn } from './lib/form';

// The refuter's cases of session 12 (#111, docs/DOMAIN.md §6 "Save an entry" and "Delete entry") over the fixture
// plan on 20 October 2026, whose October buy is open (late), with the real services, one memory store and the
// cross-tab channel: a monthly buy saved from the entry form (A1 to A3) and the Log's delete Undo (B a, B b)
// refuse a month skipped or recorded since, so October is never recorded twice or both recorded and skipped.

const OCTOBER = month('2026-10');
const TODAY = date('2026-10-20');
const NOW = fixtureNowMs('buy');
const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
});

const sharedStore = () => memoryPlanStore({ ...fixtureSnapshot(), prices: FIXTURE_PRICES });

async function tab(shared: ReturnType<typeof memoryPlanStore>, nowMs = NOW) {
  const channel = crossTabChannel({ name: 'slot-races-test', tabId: crypto.randomUUID() });
  const services = createTestServices({ planStore: shared, nowMs, channel });
  await services.start();
  disposers.push(() => services.dispose());
  return { services, actions: logActions(services) };
}

const snapshotOf = (services: Services) => services.domain.store.getState().snapshot;
const october = (snapshot: Snapshot) => ({
  buys: liveEntries(snapshot.entries).filter((entry) => entry.kind === 'dca' && entry.slot === OCTOBER),
  skipped: snapshot.plan?.skips.some((skip) => skip.slot === OCTOBER) ?? false,
});

/** Thrown inside the write, so a refused save writes nothing (as entry-form.tsx). */
const REFUSED = Symbol('refused');

/** The entry form opened on October's monthly buy; the save it returns writes as entry-form.tsx does. */
function openForm(services: Services) {
  const { plan, entries, prices } = snapshotOf(services);
  if (plan === null) throw new Error('no plan');
  const numberInput = createNumberInput('en-GB');
  const context = { plan, entries, today: TODAY, prices: prices?.snapshot ?? null, numberInput };
  const state = initialState('dca', [], OCTOBER, context);
  const rows = [{ coin: 'BTC' as CoinId, amount: money('100'), units: units('0.0016') }];
  const draft: TransactionDraft = { kind: 'dca', date: TODAY, slot: OCTOBER, fee: null, note: '', venue: null, rows };
  return async () => {
    const box: { result?: ReturnType<typeof saveOn> } = {};
    try {
      await services.domain.write((snapshot) => {
        const save = { plan: snapshot.plan ?? plan, editing: [], ids: [EntityIdSchema.parse(crypto.randomUUID())] };
        const result = saveOn(snapshot.entries, draft, {
          ...save,
          now: services.clock.now(),
          source: 'manual',
          initial: state,
          current: state,
        });
        box.result = result;
        if (result === null || !result.ok) throw REFUSED;
        return { entries: result.value };
      });
    } catch (error) {
      if (error !== REFUSED) throw error;
    }
    return box.result;
  };
}

/** "Bought as planned" on October as Today records it: in the write queue's turn, while October is open. */
function tap(services: Services) {
  return services.domain.write(({ plan, entries, prices }) => {
    const open = (plan === null ? [] : actionsNow(plan, entries, TODAY)).find(
      (action) => action.kind === 'dca' && action.slot === OCTOBER && isOpen(action.status),
    );
    if (plan === null || open === undefined) return {};
    const drafts = oneTapEntries({
      plan,
      action: open,
      prices: prices?.snapshot ?? null,
      today: TODAY,
      fee: null,
      ids: plan.coins.map(() => EntityIdSchema.parse(crypto.randomUUID())),
      now: services.clock.now(),
      venue: null,
    });
    return { entries: drafts.flatMap(({ units, ...draft }) => (units === null ? [] : [{ ...draft, units }])) };
  });
}

/** "Replace everything" with a backup of the plan and its live entries but `without`, as Settings writes it. */
function replaceWithout(services: Services, without: readonly EntityId[]) {
  return services.domain.write((snapshot) => {
    const { plan, entries } = snapshot;
    if (plan === null) return {};
    const kept = liveEntries(entries).filter((entry) => !without.includes(entry.id));
    const result = applyImport(
      snapshot,
      exportBackup(plan, kept, services.clock.now()),
      'replace',
      services.clock.now(),
    );
    return { plan: result.plan, entries: result.entries };
  });
}

/** Deletes a transaction as the Log does: a soft delete written in the store's turn, noting the month for the Undo. */
const remove = async (services: Services, ids: readonly EntityId[]) => {
  const deleted = await logActions(services).deleteTransaction(ids);
  if (!deleted.ok) throw new Error(`the delete was refused: ${deleted.error.code}`);
  return deleted.value;
};

describe('a monthly buy saved from the entry form', () => {
  it('A1: is refused when another tab skipped the month while the form was open', async () => {
    const shared = sharedStore();
    const [a, b] = [await tab(shared), await tab(shared)];
    const save = openForm(a.services);
    expect((await b.actions.skipMonthAction(OCTOBER, '')).ok).toBe(true);
    await vi.waitFor(() => expect(october(snapshotOf(a.services)).skipped).toBe(true));
    expect(await save()).toEqual({ ok: false, error: { code: 'slot-skipped', slot: OCTOBER } });
    expect(october(shared.current())).toEqual({ buys: [], skipped: true });
  });

  it('A2: is refused when another tab tapped "Bought as planned" while the form was open', async () => {
    const shared = sharedStore();
    const [a, b] = [await tab(shared), await tab(shared)];
    const save = openForm(a.services);
    await tap(b.services);
    await vi.waitFor(() => expect(october(snapshotOf(a.services)).buys).toHaveLength(2));
    expect(await save()).toEqual({ ok: false, error: { code: 'slot-done', slot: OCTOBER } });
    const { buys, skipped } = october(shared.current());
    expect(buys.map((entry) => entry.source)).toEqual(['one-tap', 'one-tap']);
    expect(skipped).toBe(false);
  });

  it("A3: is refused in the same tab when the tap's write is still pending", async () => {
    const shared = sharedStore();
    const { services } = await tab(shared);
    const save = openForm(services);
    const [, saved] = await Promise.all([tap(services), save()]);
    expect(saved).toEqual({ ok: false, error: { code: 'slot-done', slot: OCTOBER } });
    expect(october(shared.current()).buys.map((entry) => entry.source)).toEqual(['one-tap', 'one-tap']);
  });

  it('is saved while the month is open', async () => {
    const shared = sharedStore();
    const { services } = await tab(shared);
    expect((await openForm(services)())?.ok).toBe(true);
    expect(october(shared.current()).buys).toHaveLength(1);
  });
});

describe("the Log's delete Undo", () => {
  it('B(a): restores nothing when the month was skipped after the delete', async () => {
    const shared = sharedStore();
    const { services, actions } = await tab(shared);
    const saved = await openForm(services)();
    const ids = saved?.ok === true ? saved.value.map((entry) => entry.id) : [];
    const before = await remove(services, ids);
    expect((await actions.skipMonthAction(OCTOBER, '')).ok).toBe(true);
    expect(await actions.undoDelete(ids, before)).toEqual({
      ok: false,
      error: { code: 'slot-skipped', slot: OCTOBER },
    });
    expect(october(shared.current())).toEqual({ buys: [], skipped: true });
  });

  it('B(b): restores nothing when "Bought as planned" recorded the month again after the delete', async () => {
    const shared = sharedStore();
    const { services, actions } = await tab(shared);
    await tap(services);
    const ids = october(snapshotOf(services)).buys.map((entry) => entry.id);
    const before = await remove(services, ids);
    await tap(services);
    expect(await actions.undoDelete(ids, before)).toEqual({ ok: false, error: { code: 'slot-done', slot: OCTOBER } });
    const { buys } = october(shared.current());
    expect(buys).toHaveLength(2);
    expect(buys.some((entry) => ids.includes(entry.id))).toBe(false);
  });

  it('restores the deleted entries while the month is still open', async () => {
    const shared = sharedStore();
    const { services, actions } = await tab(shared);
    await tap(services);
    const ids = october(snapshotOf(services)).buys.map((entry) => entry.id);
    const before = await remove(services, ids);
    const restored = await actions.undoDelete(ids, before);
    expect(restored.ok && restored.value.map((entry) => entry.id).sort()).toEqual([...ids].sort());
    expect(october(shared.current()).buys).toHaveLength(2);
  });

  it('E: restores nothing when another tab replaced the data with a backup without the entry after the delete', async () => {
    const shared = sharedStore();
    const [a, b] = [await tab(shared), await tab(shared, NOW + 60_000)];
    await tap(a.services);
    const ids = october(snapshotOf(a.services)).buys.map((entry) => entry.id);
    const before = await remove(a.services, ids);
    const tombstones = (services: Services) =>
      snapshotOf(services).entries.filter((entry) => ids.includes(entry.id) && entry.deletedAt !== null);
    await vi.waitFor(() => expect(tombstones(b.services)).toHaveLength(ids.length));
    await replaceWithout(b.services, ids);
    await vi.waitFor(() => expect(snapshotOf(a.services).plan?.updatedAt).toBe(snapshotOf(b.services).plan?.updatedAt));
    expect(await a.actions.undoDelete(ids, before)).toEqual({ ok: false, error: { code: 'changed-since-delete' } });
    for (const snapshot of [shared.current(), snapshotOf(a.services), snapshotOf(b.services)]) {
      expect(october(snapshot).buys).toEqual([]);
    }
  });

  it("E2: restores nothing when the other tab's clock is 3 s behind and it replaced the data after the delete", async () => {
    const shared = sharedStore();
    const [a, b] = [await tab(shared), await tab(shared, NOW - 3_000)];
    await tap(a.services);
    const ids = october(snapshotOf(a.services)).buys.map((entry) => entry.id);
    const before = await remove(a.services, ids);
    const tombstones = (services: Services) =>
      snapshotOf(services).entries.filter((entry) => ids.includes(entry.id) && entry.deletedAt !== null);
    await vi.waitFor(() => expect(tombstones(b.services)).toHaveLength(ids.length));
    await replaceWithout(b.services, ids);
    await vi.waitFor(() => expect(snapshotOf(a.services).plan?.updatedAt).toBe(snapshotOf(b.services).plan?.updatedAt));
    expect(await a.actions.undoDelete(ids, before)).toEqual({ ok: false, error: { code: 'changed-since-delete' } });
    for (const snapshot of [shared.current(), snapshotOf(a.services), snapshotOf(b.services)]) {
      expect(october(snapshot).buys).toEqual([]);
    }
  });

  it('E3: restores nothing when the other tab, 3 s behind, replaced the data before it heard of the delete', async () => {
    const shared = sharedStore();
    const [a, b] = [await tab(shared), await tab(shared, NOW - 3_000)];
    await tap(a.services);
    const ids = october(snapshotOf(a.services)).buys.map((entry) => entry.id);
    await vi.waitFor(() => expect(october(snapshotOf(b.services)).buys).toHaveLength(ids.length));
    const before = await remove(a.services, ids);
    // The delete's message has not reached B yet: B replaces on its snapshot, where the entries are still live.
    expect(october(snapshotOf(b.services)).buys).toHaveLength(ids.length);
    await replaceWithout(b.services, ids);
    await vi.waitFor(() => expect(snapshotOf(a.services).plan?.updatedAt).toBe(snapshotOf(b.services).plan?.updatedAt));
    expect(await a.actions.undoDelete(ids, before)).toEqual({ ok: false, error: { code: 'changed-since-delete' } });
    for (const snapshot of [shared.current(), snapshotOf(a.services), snapshotOf(b.services)]) {
      expect(october(snapshot).buys).toEqual([]);
    }
  });

  it('restores a row whose month another row recorded before the delete', async () => {
    const shared = sharedStore();
    const { services, actions } = await tab(shared);
    await tap(services);
    const [first, second] = october(snapshotOf(services)).buys.map((entry) => entry.id);
    const ids = first === undefined ? [] : [first];
    const before = await remove(services, ids);
    expect(await actions.undoDelete(ids, before)).toMatchObject({ ok: true, value: [{ id: first }] });
    expect(october(shared.current()).buys.map((entry) => entry.id)).toEqual(expect.arrayContaining([first, second]));
  });
});
