// @vitest-environment jsdom
import { keptCurrencyQuestion, type Plan } from '@proofofcalm/core';
import { anEntry, date, instant, money } from '@proofofcalm/core/testing';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SNAPSHOT, memoryPlanStore } from '../../lib/adapters/memory-store';
import { NavigationProvider, usePathname } from '../../lib/navigation';
import type { Snapshot } from '../../lib/ports';
import { ServicesProvider } from '../../lib/services';
import { fixtureSnapshot } from '../../lib/services/fixtures';
import { createTestServices } from '../../lib/services/testing';
import { crossTabChannel } from '../../lib/store/channel';
import { type OnboardingActions, useOnboardingActions } from './actions';

// The onboarding's one write (docs/ARCHITECTURE.md "Inside packages/app"): the stored-plan check runs in
// the write's turn on the rows as stored, so a plan another tab wrote meanwhile is kept.

const disposers: (() => void)[] = [];
afterEach(() => {
  cleanup();
  for (const dispose of disposers.splice(0)) dispose();
});

const fixturePlan = fixtureSnapshot().plan;
if (fixturePlan === null) throw new Error('the fixture has a plan');
const mine: Plan = fixturePlan;
const theirs: Plan = { ...fixturePlan, why: 'From another tab.' };

async function tab(planStore = memoryPlanStore(EMPTY_SNAPSHOT), shared = false) {
  const count = vi.fn();
  const services = createTestServices({
    planStore,
    analytics: { count },
    ...(shared && { channel: crossTabChannel({ name: 'onboarding-actions-test', tabId: crypto.randomUUID() }) }),
  });
  await services.start();
  disposers.push(() => services.dispose());
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ServicesProvider services={services}>
      <NavigationProvider location="memory" initialPath="/onboarding">
        {children}
      </NavigationProvider>
    </ServicesProvider>
  );
  const { result } = renderHook(() => ({ actions: useOnboardingActions(), path: usePathname() }), { wrapper });
  return { services, count, result };
}

/** Start with no question shown: the plan's own currency is the next one. */
const NONE_SHOWN = { next: mine.payCurrency, shown: null };

async function tap(actions: OnboardingActions, ...plans: Plan[]) {
  return ask(actions, NONE_SHOWN, ...plans);
}

async function ask(
  actions: OnboardingActions,
  asked: Parameters<OnboardingActions['createPlan']>[1],
  ...plans: Plan[]
) {
  let outcomes: Awaited<ReturnType<OnboardingActions['createPlan']>>[] = [];
  await act(async () => {
    outcomes = await Promise.all(plans.map((plan) => actions.createPlan(plan, asked)));
  });
  return outcomes;
}

// Entries kept with no plan beside a set-aside plan row in EUR (ADR-0053): onboarding in the United Kingdom.
const keptEntries = [anEntry({ date: date('2026-09-20') }), anEntry({ date: date('2026-10-20'), fee: money('1') })];
const keptInEur: Snapshot = {
  ...EMPTY_SNAPSHOT,
  entries: keptEntries,
  quarantined: 1,
  setAside: { plans: [{ id: 'plan', at: instant('2026-10-17T09:00:00.000Z'), currency: 'EUR' }], entries: [] },
};
const inGbp: Plan = { ...mine, country: 'GB', payCurrency: 'GBP', displayCurrency: 'GBP' };
const shownInEur = keptCurrencyQuestion(keptEntries, 'EUR', 'GBP');

describe('useOnboardingActions: the kept-currency question in the write’s turn (ADR-0053)', () => {
  it('gives changed and writes nothing when the turn finds a question the screen did not show', async () => {
    const planStore = memoryPlanStore(keptInEur);
    const { count, result } = await tab(planStore);
    const before = JSON.stringify(planStore.current());
    expect(await ask(result.current.actions, { next: 'GBP', shown: null }, inGbp)).toEqual(['changed']);
    expect(JSON.stringify(planStore.current())).toBe(before);
    expect(count).not.toHaveBeenCalled();
    expect([result.current.path, result.current.actions.pending]).toEqual(['/onboarding', false]);
  });

  it('stores the EUR answer as EUR and EUR, with the entries byte-equal', async () => {
    const planStore = memoryPlanStore(keptInEur);
    const { result } = await tab(planStore);
    const entries = JSON.stringify(planStore.current().entries);
    const answered: Plan = { ...inGbp, payCurrency: 'EUR', displayCurrency: 'EUR' };
    expect(await ask(result.current.actions, { next: 'GBP', shown: shownInEur }, answered)).toEqual(['created']);
    expect(planStore.current().plan).toEqual(expect.objectContaining({ payCurrency: 'EUR', displayCurrency: 'EUR' }));
    expect(JSON.stringify(planStore.current().entries)).toBe(entries);
  });

  it('writes an answer no longer needed, as given', async () => {
    const planStore = memoryPlanStore({ ...keptInEur, entries: [] });
    const { result } = await tab(planStore);
    expect(await ask(result.current.actions, { next: 'GBP', shown: shownInEur }, inGbp)).toEqual(['created']);
    expect(planStore.current().plan).toEqual(inGbp);
  });

  it('keeps a newer plan row stored meanwhile and gives stored', async () => {
    const planStore = memoryPlanStore({ ...EMPTY_SNAPSHOT, newer: { plans: 1, entries: 0 } });
    const { count, result } = await tab(planStore);
    expect(await tap(result.current.actions, mine)).toEqual(['stored']);
    expect(planStore.current().plan).toBeNull();
    expect(count).not.toHaveBeenCalled();
  });
});

describe('useOnboardingActions', () => {
  it('writes the plan, counts plan_created and moves on to Today', async () => {
    const planStore = memoryPlanStore(EMPTY_SNAPSHOT);
    const { count, result } = await tab(planStore);
    expect(await tap(result.current.actions, mine)).toEqual(['created']);
    expect(planStore.current().plan).toEqual(mine);
    expect(count).toHaveBeenCalledExactlyOnceWith('plan_created');
    expect(result.current.path).toBe('/today');
  });

  it('keeps a plan another tab wrote between the tap and its turn, and gives stored', async () => {
    const shared = memoryPlanStore(EMPTY_SNAPSHOT);
    const [a, b] = [await tab(shared, true), await tab(shared, true)];
    await b.services.domain.write({ plan: theirs });
    // Tab a has not reloaded yet: its screen still shows no plan when the person taps Start.
    expect(a.services.domain.store.getState().snapshot.plan).toBeNull();
    expect(await tap(a.result.current.actions, mine)).toEqual(['stored']);
    expect(shared.current().plan).toEqual(theirs);
    expect(a.count).not.toHaveBeenCalled();
    expect([a.result.current.path, a.result.current.actions.pending]).toEqual(['/onboarding', false]);
  });

  it('two taps write one plan', async () => {
    const planStore = memoryPlanStore(EMPTY_SNAPSHOT);
    const { count, result } = await tab(planStore);
    const writes = vi.spyOn(planStore, 'write');
    const second: Plan = { ...mine, why: 'The second tap.' };
    expect(await tap(result.current.actions, mine, second)).toEqual(['created', 'created']);
    expect(writes).toHaveBeenCalledOnce();
    expect(planStore.current().plan).toEqual(mine);
    expect(count).toHaveBeenCalledOnce();
  });

  it('a failed write clears pending, counts nothing and stays, so Start can be tapped again', async () => {
    const planStore = memoryPlanStore(EMPTY_SNAPSHOT);
    const { count, result } = await tab(planStore);
    vi.spyOn(planStore, 'write').mockRejectedValueOnce(new Error('quota exceeded'));
    await act(async () => {
      await expect(result.current.actions.createPlan(mine, NONE_SHOWN)).rejects.toThrow('quota exceeded');
    });
    expect([result.current.actions.pending, result.current.path]).toEqual([false, '/onboarding']);
    expect(count).not.toHaveBeenCalled();
    expect(await tap(result.current.actions, mine)).toEqual(['created']);
    expect(planStore.current().plan).toEqual(mine);
  });
});
