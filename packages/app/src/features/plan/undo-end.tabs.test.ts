// @vitest-environment node
import { type CalendarDate, type MonthKey, type Plan, skipMonth, stampAfter } from '@proofofcalm/core';
import { afterEach, describe, expect, it } from 'vitest';
import { memoryPlanStore } from '../../lib/adapters/memory-store';
import type { PlanStore } from '../../lib/ports';
import { fixtureNowMs, fixtureSnapshot } from '../../lib/services/fixtures';
import { createTestServices } from '../../lib/services/testing';
import { planActions } from './actions';

// The Undo of "End buying today" across two tabs on one plan store (docs/DOMAIN.md §6): it restores only a plan
// that no tab but this one has written since the end, so another tab's end over its own edit of the last buy day
// is never taken back by this tab's toast; this tab's own writes since (a skipped month) keep the undo.

const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
});

async function tab(planStore: PlanStore) {
  const services = createTestServices({ planStore, nowMs: fixtureNowMs('buy') });
  await services.start();
  disposers.push(() => services.dispose());
  return { services, actions: planActions(services) };
}

async function ended(actions: Awaited<ReturnType<typeof tab>>['actions']) {
  const result = await actions.endBuying();
  if (!result.ok || result.value === null) throw new Error('not ended');
  return result.value;
}

describe('the Undo of End buying, with two tabs on one plan', () => {
  it("refuses once another tab edited the last buy day and ended again, and keeps that tab's plan", async () => {
    const planStore = memoryPlanStore(fixtureSnapshot());
    const a = await tab(planStore);
    const before = await ended(a.actions);
    const b = await tab(planStore);
    const edited = '2027-01-05' as CalendarDate;
    await b.services.domain.write(({ plan }) => ({
      plan: {
        ...(plan as Plan),
        lastBuy: edited,
        endedBuyingOn: null,
        updatedAt: stampAfter(b.services.clock.now(), (plan as Plan).updatedAt),
      },
    }));
    const theirs = await ended(b.actions);
    const stored = planStore.current().plan;
    expect(await a.actions.undoEndBuying(before)).toEqual({ ok: false, error: { code: 'plan-changed' } });
    expect(planStore.current().plan).toEqual(stored);
    expect(await b.actions.undoEndBuying(theirs)).toEqual({ ok: true, value: undefined });
    expect(planStore.current().plan).toMatchObject({ lastBuy: edited, endedBuyingOn: null });
  });

  it('a pause pressed after another tab ended buying writes nothing, and that tab can still undo', async () => {
    const planStore = memoryPlanStore(fixtureSnapshot());
    const a = await tab(planStore);
    const b = await tab(planStore);
    const before = await ended(b.actions);
    const stored = planStore.current().plan;
    expect(await a.actions.pause()).toEqual({ ok: true, value: undefined });
    expect(planStore.current().plan).toEqual(stored);
    expect(a.services.domain.store.getState().snapshot.plan).toEqual(stored);
    expect(await b.actions.undoEndBuying(before)).toEqual({ ok: true, value: undefined });
    expect(planStore.current().plan).toMatchObject({ lastBuy: '2027-03-05', endedBuyingOn: null, pauses: [] });
  });

  it("restores after this tab's own write since the end (a skipped month)", async () => {
    const planStore = memoryPlanStore(fixtureSnapshot());
    const a = await tab(planStore);
    const before = await ended(a.actions);
    await a.services.domain.write(({ plan, entries }) => {
      const skipped = skipMonth(plan as Plan, entries, {
        slot: '2026-10' as MonthKey,
        note: '',
        id: crypto.randomUUID() as Plan['id'],
        now: a.services.clock.now(),
      });
      if (!skipped.ok) throw new Error(skipped.error.code);
      return { plan: skipped.value };
    });
    expect(await a.actions.undoEndBuying(before)).toEqual({ ok: true, value: undefined });
    expect(planStore.current().plan).toMatchObject({ lastBuy: '2027-03-05', endedBuyingOn: null });
  });

  it("forgets this tab's writes once everything is deleted and put back", async () => {
    const planStore = memoryPlanStore(fixtureSnapshot());
    const { services, actions } = await tab(planStore);
    const before = await ended(actions);
    await services.domain.write(({ plan }) => ({
      plan: { ...(plan as Plan), updatedAt: stampAfter(services.clock.now(), (plan as Plan).updatedAt) },
    }));
    const latest = planStore.current().plan as Plan;
    const { id, lastBuy, endedBuyingOn, updatedAt } = latest;
    expect(services.domain.ownPlanWrites(before.endedAt, updatedAt)).toEqual([
      { id, lastBuy, endedBuyingOn, updatedAt },
    ]);
    const rows = await services.domain.wipe();
    if (rows === null) throw new Error('nothing wiped');
    expect(await services.domain.restore(rows)).toBe(true);
    expect(services.domain.ownPlanWrites(before.endedAt, updatedAt)).toBeNull();
    expect(services.domain.ownPlanWrites(updatedAt, updatedAt)).toEqual([]);
  });
});
