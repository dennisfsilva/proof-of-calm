// @vitest-environment node
import type { CalendarDate, EntityId, Instant, Pause, Plan } from '@proofofcalm/core';
import { afterEach, describe, expect, it } from 'vitest';
import { memoryPlanStore } from '../../lib/adapters/memory-store';
import type { PlanStore, Snapshot } from '../../lib/ports';
import { fixtureNowMs, fixtureSnapshot } from '../../lib/services/fixtures';
import { createTestServices } from '../../lib/services/testing';
import { planActions } from './actions';

// Pause, Resume and End buying today (docs/DOMAIN.md §6) from the Plan screen, over the fixture plan on 20
// October 2026: an open pause from today, or its end, written on the plan as stored in the write's turn; when
// it writes nothing, the tab reloads the plan as stored before the action ends.

const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
});

async function tab(snapshot: Snapshot = fixtureSnapshot(), planStore: PlanStore = memoryPlanStore(snapshot)) {
  const services = createTestServices({ planStore, nowMs: fixtureNowMs('buy') });
  await services.start();
  disposers.push(() => services.dispose());
  return { services, actions: planActions(services) };
}

const stored = (services: Awaited<ReturnType<typeof tab>>['services']) =>
  services.domain.store.getState().snapshot.plan;

const today: Pause = {
  id: '00000000-0000-4000-8000-000000003001' as EntityId,
  from: '2026-10-20' as CalendarDate,
  until: null,
  note: '',
};

describe('planActions.pause', () => {
  it('writes an open pause from today, with no note', async () => {
    const { services, actions } = await tab();
    expect(await actions.pause()).toEqual({ ok: true, value: undefined });
    const pauses = stored(services)?.pauses ?? [];
    expect(pauses).toHaveLength(1);
    expect(pauses[0]).toMatchObject({ from: '2026-10-20', until: null, note: '' });
  });

  it('refuses a pause that overlaps another (an imported pause still to come), and writes nothing', async () => {
    const snapshot = fixtureSnapshot();
    const later: Pause = {
      id: '00000000-0000-4000-8000-000000003000' as EntityId,
      from: '2026-12-01' as CalendarDate,
      until: null,
      note: '',
    };
    const plan = snapshot.plan === null ? null : { ...snapshot.plan, pauses: [later] };
    const { services, actions } = await tab({ ...snapshot, plan });
    const before = stored(services);
    expect(await actions.pause()).toEqual({ ok: false, error: { code: 'pauses-overlap' } });
    expect(stored(services)).toBe(before);
  });

  it('on a plan another tab already paused today, writes nothing and returns ok', async () => {
    const snapshot = fixtureSnapshot();
    const earlier: Pause = {
      id: '00000000-0000-4000-8000-000000003000' as EntityId,
      from: '2026-10-20' as CalendarDate,
      until: null,
      note: '',
    };
    const plan = snapshot.plan === null ? null : { ...snapshot.plan, pauses: [earlier] };
    const { services, actions } = await tab({ ...snapshot, plan });
    const before = stored(services);
    expect(await actions.pause()).toEqual({ ok: true, value: undefined });
    expect(stored(services)).toBe(before);
    expect(stored(services)?.updatedAt).toBe(before?.updatedAt);
  });

  it('with no plan left (deleted in another tab), writes nothing', async () => {
    const { services, actions } = await tab({ ...fixtureSnapshot(), plan: null, entries: [] });
    expect((await actions.pause()).ok).toBe(true);
    expect(stored(services)).toBeNull();
  });

  it('on a plan another tab paused before this tab reloaded, shows the plan as stored when it returns', async () => {
    const planStore = memoryPlanStore(fixtureSnapshot());
    const { services, actions } = await tab(fixtureSnapshot(), planStore);
    await planStore.write({ plan: { ...(planStore.current().plan as Plan), pauses: [today] } });
    expect(stored(services)?.pauses).toEqual([]);
    expect(await actions.pause()).toEqual({ ok: true, value: undefined });
    expect(stored(services)?.pauses).toEqual([today]);
  });

  it('a reload that fails after it wrote nothing still returns ok; the store keeps the failure', async () => {
    const store = memoryPlanStore(fixtureSnapshot());
    let failing = false;
    const planStore: PlanStore = {
      ...store,
      load: async () => {
        if (failing) throw new Error('UnknownError');
        return store.load();
      },
    };
    const { services, actions } = await tab(fixtureSnapshot(), planStore);
    await store.write({ plan: { ...(store.current().plan as Plan), pauses: [today] } });
    failing = true;
    expect(await actions.pause()).toEqual({ ok: true, value: undefined });
    expect(services.domain.store.getState().status).toBe('failed');
  });
});

const ended: Pause = {
  id: '00000000-0000-4000-8000-000000003000' as EntityId,
  from: '2026-10-01' as CalendarDate,
  until: null,
  note: '',
};

describe('planActions.resume', () => {
  it('ends the pause in effect yesterday', async () => {
    const snapshot = fixtureSnapshot();
    const plan = snapshot.plan === null ? null : { ...snapshot.plan, pauses: [ended] };
    const { services, actions } = await tab({ ...snapshot, plan });
    expect(await actions.resume()).toEqual({ ok: true, value: undefined });
    expect(stored(services)?.pauses).toMatchObject([{ from: '2026-10-01', until: '2026-10-19' }]);
  });

  it('on a plan another tab already resumed, writes nothing and returns ok', async () => {
    const snapshot = fixtureSnapshot();
    const resumed = { ...ended, until: '2026-10-19' as CalendarDate };
    const plan = snapshot.plan === null ? null : { ...snapshot.plan, pauses: [resumed] };
    const { services, actions } = await tab({ ...snapshot, plan });
    const before = stored(services);
    expect(await actions.resume()).toEqual({ ok: true, value: undefined });
    expect(stored(services)).toBe(before);
    expect(stored(services)?.updatedAt).toBe(before?.updatedAt);
  });

  it('with no plan left (deleted in another tab), writes nothing', async () => {
    const { services, actions } = await tab({ ...fixtureSnapshot(), plan: null, entries: [] });
    expect((await actions.resume()).ok).toBe(true);
    expect(stored(services)).toBeNull();
  });

  it('on a plan another tab resumed before this tab reloaded, shows the plan as stored when it returns', async () => {
    const snapshot = fixtureSnapshot();
    const plan = snapshot.plan === null ? null : { ...snapshot.plan, pauses: [ended] };
    const planStore = memoryPlanStore({ ...snapshot, plan });
    const { services, actions } = await tab({ ...snapshot, plan }, planStore);
    const resumed = { ...ended, until: '2026-10-19' as CalendarDate };
    await planStore.write({ plan: { ...(planStore.current().plan as Plan), pauses: [resumed] } });
    expect(await actions.resume()).toEqual({ ok: true, value: undefined });
    expect(stored(services)?.pauses).toEqual([resumed]);
  });
});

// End buying today on 20 October 2026, inside the fixture plan's buy phase (5 April 2026 to 5 March 2027).
const endedToday = { lastBuy: '2026-10-20' as CalendarDate, endedBuyingOn: '2026-10-20' as CalendarDate };

describe('planActions.endBuying', () => {
  it('makes today the last buy day and returns what it replaced', async () => {
    const { services, actions } = await tab();
    const result = await actions.endBuying();
    expect(stored(services)).toMatchObject(endedToday);
    const endedAt = stored(services)?.updatedAt;
    const planId = stored(services)?.id;
    expect(result).toEqual({ ok: true, value: { lastBuy: '2027-03-05', endedOn: '2026-10-20', endedAt, planId } });
  });

  it('on a plan another tab ended first, writes nothing, shows the stored end and returns null', async () => {
    const planStore = memoryPlanStore(fixtureSnapshot());
    const { services, actions } = await tab(fixtureSnapshot(), planStore);
    const theirs = { ...(planStore.current().plan as Plan), ...endedToday };
    await planStore.write({ plan: theirs });
    expect(stored(services)?.endedBuyingOn).toBeNull();
    expect(await actions.endBuying()).toEqual({ ok: true, value: null });
    expect(stored(services)).toEqual(theirs);
    expect(stored(services)?.updatedAt).toBe(theirs.updatedAt);
  });

  it('on a plan another tab moved to start after today, refuses, writes nothing and reloads', async () => {
    const planStore = memoryPlanStore(fixtureSnapshot());
    const { services, actions } = await tab(fixtureSnapshot(), planStore);
    const theirs = { ...(planStore.current().plan as Plan), firstBuy: '2026-11-05' as CalendarDate };
    await planStore.write({ plan: theirs });
    expect(await actions.endBuying()).toEqual({ ok: false, error: { code: 'before-first-buy' } });
    expect(stored(services)).toEqual(theirs);
  });

  it('with no plan left (deleted in another tab), writes nothing', async () => {
    const { services, actions } = await tab({ ...fixtureSnapshot(), plan: null, entries: [] });
    expect(await actions.endBuying()).toEqual({ ok: true, value: null });
    expect(stored(services)).toBeNull();
  });
});

describe('planActions.undoEndBuying', () => {
  it('restores the last buy day the end replaced', async () => {
    const { services, actions } = await tab();
    const before = stored(services);
    const ended = await actions.endBuying();
    if (!ended.ok || ended.value === null) throw new Error('not ended');
    expect(await actions.undoEndBuying(ended.value)).toEqual({ ok: true, value: undefined });
    expect(stored(services)).toEqual({ ...before, updatedAt: stored(services)?.updatedAt });
  });

  it('refuses once another tab edited the last buy day, writing nothing and reloading', async () => {
    const planStore = memoryPlanStore(fixtureSnapshot());
    const { services, actions } = await tab(fixtureSnapshot(), planStore);
    const ended = await actions.endBuying();
    if (!ended.ok || ended.value === null) throw new Error('not ended');
    const theirs = { ...(planStore.current().plan as Plan), lastBuy: '2026-12-05' as CalendarDate };
    await planStore.write({ plan: theirs });
    expect(await actions.undoEndBuying(ended.value)).toEqual({ ok: false, error: { code: 'plan-changed' } });
    expect(stored(services)).toEqual(theirs);
  });

  it('with no plan left (deleted in another tab), refuses and writes nothing', async () => {
    const { services, actions } = await tab({ ...fixtureSnapshot(), plan: null, entries: [] });
    const before = {
      lastBuy: '2027-03-05' as CalendarDate,
      endedOn: '2026-10-20' as CalendarDate,
      endedAt: '2026-10-20T10:00:00.000Z' as Instant,
      planId: fixtureSnapshot().plan?.id as Plan['id'],
    };
    expect(await actions.undoEndBuying(before)).toEqual({ ok: false, error: { code: 'plan-changed' } });
    expect(stored(services)).toBeNull();
  });
});

describe('recordReview', () => {
  /** The plan the review page showed. */
  const shown = fixtureSnapshot().plan?.id as Plan['id'];

  it('writes the review in the prefs alone: the plan, the entries and changedAt stay as stored', async () => {
    const changedAt = '2026-10-01T10:00:00.000Z' as Instant;
    const seeded = { ...fixtureSnapshot(), prefs: { ...fixtureSnapshot().prefs, changedAt } };
    const planStore = memoryPlanStore(seeded);
    const { actions } = await tab(seeded, planStore);
    expect(await actions.recordReview(shown)).toEqual({ ok: true, value: undefined });
    const after = planStore.current();
    expect(after.prefs.reviewedAt).toMatch(/^2026-10-20T10:00:00/);
    expect(after.prefs).toEqual({ ...seeded.prefs, reviewedAt: after.prefs.reviewedAt });
    expect(after.plan).toEqual(seeded.plan);
    expect(after.entries).toEqual(seeded.entries);
  });

  it('on another plan stored meanwhile (another tab imported it), refuses, writes nothing and reloads', async () => {
    const planStore = memoryPlanStore(fixtureSnapshot());
    const { services, actions } = await tab(fixtureSnapshot(), planStore);
    const theirs = { ...(planStore.current().plan as Plan), id: '00000000-0000-4000-8000-000000009000' as EntityId };
    await planStore.write({ plan: theirs, prefs: { ...planStore.current().prefs, reviewedAt: null } });
    expect(await actions.recordReview(shown)).toEqual({ ok: false, error: { code: 'plan-changed' } });
    expect(planStore.current().prefs.reviewedAt).toBeNull();
    expect(stored(services)).toEqual(theirs);
  });

  it('with no plan left (wiped in another tab), refuses and writes nothing', async () => {
    const planStore = memoryPlanStore(fixtureSnapshot());
    const { services, actions } = await tab(fixtureSnapshot(), planStore);
    await planStore.wipe();
    expect(await actions.recordReview(shown)).toEqual({ ok: false, error: { code: 'plan-changed' } });
    expect(planStore.current().prefs.reviewedAt).toBeNull();
    expect(stored(services)).toBeNull();
  });
});
