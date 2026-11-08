// @vitest-environment node
import { applyImport, type CalendarDate, exportBackup, type Plan, stampAfter } from '@proofofcalm/core';
import { anEntry } from '@proofofcalm/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { memoryPlanStore } from '../../lib/adapters/memory-store';
import { FIXTURE_DATES, fixtureNowMs, fixtureSnapshot } from '../../lib/services/fixtures';
import { createTestServices } from '../../lib/services/testing';
import { planActions } from './actions';

// The Undo of "End buying today" in one tab (docs/DOMAIN.md §6): it restores only the latest end, on the plan it
// ended. A write of this tab's own since the end that changed the last buy day or the end (a Settings save of a
// later last buy, then a second end), or replaced the plan (an import), refuses the earlier toast's Undo; one that
// kept both (a new monthly amount, an Add missing import that adds only entries) does not.

const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
});

async function tab() {
  const planStore = memoryPlanStore(fixtureSnapshot());
  const services = createTestServices({ planStore, nowMs: fixtureNowMs('buy') });
  await services.start();
  disposers.push(() => services.dispose());
  return { planStore, services, actions: planActions(services) };
}

async function ended(actions: Awaited<ReturnType<typeof tab>>['actions']) {
  const result = await actions.endBuying();
  if (!result.ok || result.value === null) throw new Error('not ended');
  return result.value;
}

const today = FIXTURE_DATES.buy as CalendarDate;
const refused = { ok: false, error: { code: 'plan-changed' } };

describe('the Undo of End buying, in one tab', () => {
  it('refuses the first toast once a later last buy cleared the end and buying ended again', async () => {
    const { planStore, services, actions } = await tab();
    const first = await ended(actions);
    // Settings › Plan saves a later last buy, which clears the end (docs/DOMAIN.md §6 "Edit the plan").
    const later = '2027-06-05' as CalendarDate;
    await services.domain.write(({ plan }) => ({
      plan: {
        ...(plan as Plan),
        lastBuy: later,
        endedBuyingOn: null,
        updatedAt: stampAfter(services.clock.now(), (plan as Plan).updatedAt),
      },
    }));
    const second = await ended(actions);
    const stored = planStore.current().plan;
    expect(stored).toMatchObject({ lastBuy: today, endedBuyingOn: today });
    expect(await actions.undoEndBuying(first)).toEqual(refused);
    expect(planStore.current().plan).toEqual(stored);
    expect(await actions.undoEndBuying(second)).toEqual({ ok: true, value: undefined });
    expect(planStore.current().plan).toMatchObject({ lastBuy: later, endedBuyingOn: null });
  });

  it('refuses once a backup of another plan, also ended today, replaced the ended plan', async () => {
    const { planStore, services, actions } = await tab();
    const before = await ended(actions);
    const fixture = fixtureSnapshot();
    const other: Plan = {
      ...(fixture.plan as Plan),
      id: crypto.randomUUID() as Plan['id'],
      lastBuy: today,
      endedBuyingOn: today,
    };
    const file = exportBackup(other, fixture.entries, services.clock.now());
    // The write of the Data section's "Replace" (features/settings/actions.ts, importBackup).
    await services.domain.write((snapshot) => {
      const result = applyImport(snapshot, file, 'replace', services.clock.now());
      if (result.refused !== null) throw new Error(result.refused.code);
      return { plan: result.plan, entries: result.entries };
    });
    const imported = planStore.current().plan;
    expect(imported).toMatchObject({ id: other.id, lastBuy: today, endedBuyingOn: today });
    expect(await actions.undoEndBuying(before)).toEqual(refused);
    expect(planStore.current().plan).toEqual(imported);
  });

  it('restores after a save that keeps the end and an Add missing import that adds only an entry', async () => {
    const { planStore, services, actions } = await tab();
    const original = planStore.current().plan as Plan;
    const before = await ended(actions);
    // Settings › Plan saves a new monthly amount; the last buy day and the end stay as the end wrote them.
    await services.domain.write(({ plan }) => ({
      plan: {
        ...(plan as Plan),
        monthlyAmount: '150' as Plan['monthlyAmount'],
        updatedAt: stampAfter(services.clock.now(), (plan as Plan).updatedAt),
      },
    }));
    const saved = planStore.current().plan as Plan;
    const fixture = fixtureSnapshot();
    const extra = anEntry({
      id: crypto.randomUUID() as Plan['id'],
      kind: 'extra',
      slot: null,
      date: FIXTURE_DATES.buy as CalendarDate,
    });
    const file = exportBackup(saved, [...fixture.entries, extra], services.clock.now());
    // The write of the Data section's "Add missing" (features/settings/actions.ts, importBackup): the plan as stored.
    await services.domain.write((snapshot) => {
      const result = applyImport(snapshot, file, 'add-missing', services.clock.now());
      if (result.refused !== null || result.added !== 1) throw new Error('not added');
      return { plan: result.plan, entries: result.entries };
    });
    expect(planStore.current().plan).toEqual(saved);
    expect(await actions.undoEndBuying(before)).toEqual({ ok: true, value: undefined });
    expect(planStore.current().plan).toMatchObject({
      lastBuy: original.lastBuy,
      endedBuyingOn: null,
      monthlyAmount: '150',
    });
    expect(planStore.current().entries.map((entry) => entry.id)).toContain(extra.id);
  });

  it('refuses once everything is deleted with the toast open', async () => {
    const { planStore, services, actions } = await tab();
    const before = await ended(actions);
    expect(await services.domain.wipe()).not.toBeNull();
    expect(await actions.undoEndBuying(before)).toEqual(refused);
    expect(planStore.current().plan).toBeNull();
  });
});
