import { type CountryRules, err, instantFromEpochMs, ok } from '@proofofcalm/core';
import { anEntry, aPlan } from '@proofofcalm/core/testing';
import { describe, expect, it, vi } from 'vitest';
import * as z from 'zod/mini';
import { systemClock } from '../adapters/clock';
import { EMPTY_SNAPSHOT, memoryPlanStore } from '../adapters/memory-store';
import type { ApiFailure, PlanStore, PriceSource, Snapshot } from '../ports';
import type { CrossTabChannel } from '../store/channel';
import type { LoadedRules } from '../store/ui';
import { createTestServices, recordingPlatform, TEST_HISTORY, TEST_NOW_MS, TEST_PRICES } from './testing';

const plan = aPlan();
const withPlan: Snapshot = { ...EMPTY_SNAPSHOT, plan };
const rulesOf = (country: string) => ({ code: country }) as CountryRules;

/** A channel that only records what this tab tells the others. */
function silentChannel(): CrossTabChannel & { readonly post: ReturnType<typeof vi.fn<() => void>> } {
  return { post: vi.fn<() => void>(), subscribe: () => () => undefined, close: () => undefined };
}

/** The countries the UI store's rules slot went through, null included. */
function rulesSeen(ui: ReturnType<typeof createTestServices>['ui']): (string | null)[] {
  const seen: (string | null)[] = [];
  ui.subscribe((state, previous) => {
    if (state.rules !== previous.rules) seen.push(state.rules?.country ?? null);
  });
  return seen;
}

describe('createServices: start', () => {
  it('hydrates, reports ready and sets today from the clock', async () => {
    const services = createTestServices({ snapshot: withPlan });
    expect(services.domain.store.getState().status).toBe('loading');
    await services.start();
    expect(services.domain.store.getState().status).toBe('ready');
    expect(services.domain.store.getState().snapshot.plan).toEqual(plan);
    expect(services.ui.getState().today).toBe('2026-10-20');
    services.dispose();
  });

  it('loads the plan country’s rules after hydration, none without a plan', async () => {
    const rules = vi.fn(async (country: string) => rulesOf(country));
    const services = createTestServices({ snapshot: withPlan, rules });
    await services.start();
    expect(rules).toHaveBeenCalledExactlyOnceWith('PT');
    expect(services.ui.getState().rules).toEqual({ country: 'PT', rules: rulesOf('PT') });

    const planless = createTestServices({ rules });
    await planless.start();
    expect(rules).toHaveBeenCalledTimes(1);
    expect(planless.ui.getState().rules).toBeNull();
  });

  it('reloads the rules when a write changes the country, keeping the old ones until then', async () => {
    const rules = vi.fn(async (country: string) => rulesOf(country));
    const services = createTestServices({ snapshot: withPlan, rules });
    await services.start();
    const seen = rulesSeen(services.ui);
    await services.domain.write({ plan: { ...plan, country: 'DE' } });
    await vi.waitFor(() => expect(services.ui.getState().rules?.country).toBe('DE'));
    expect(seen).toEqual(['DE']);
    expect(rules).toHaveBeenCalledTimes(2);

    await services.domain.write({ plan: { ...plan, country: 'DE', why: 'unchanged country' } });
    await services.domain.write({ plan: null });
    expect(services.ui.getState().rules).toBeNull();
    expect(seen).toEqual(['DE', null]);
    expect(rules).toHaveBeenCalledTimes(2);
  });

  it('boots once: when ready with the rules of the plan’s country, or without a plan', async () => {
    let answer: (rules: LoadedRules['rules']) => void = () => undefined;
    const rules = vi.fn(
      (country: string) =>
        new Promise<LoadedRules['rules']>((resolve) => {
          answer = () => resolve(rulesOf(country));
        }),
    );
    const services = createTestServices({ snapshot: withPlan, rules });
    const started = services.start();
    await vi.waitFor(() => expect(services.domain.store.getState().status).toBe('ready'));
    expect(services.ui.getState().booted).toBe(false);
    answer(null);
    await started;
    expect(services.ui.getState().booted).toBe(true);
    const setBooted = vi.spyOn(services.ui.getState(), 'setBooted');
    await services.domain.write({ plan: { ...plan, country: 'DE' } });
    answer(null);
    await vi.waitFor(() => expect(services.ui.getState().rules?.country).toBe('DE'));
    expect(setBooted).not.toHaveBeenCalled();
    expect(services.ui.getState().booted).toBe(true);

    const planless = createTestServices();
    await planless.start();
    expect(planless.ui.getState().booted).toBe(true);
    const failing = createTestServices({
      planStore: { ...memoryPlanStore(), load: () => Promise.reject(new Error('no')) },
    });
    await failing.start();
    expect(failing.ui.getState().booted).toBe(false);
  });

  it('hands the clock to the domain store, which stamps changedAt on an entries write', async () => {
    const services = createTestServices({ snapshot: withPlan });
    await services.start();
    await services.domain.write({ entries: [anEntry()] });
    // The frozen test clock's first answer: a later now() is 1 ms on, never the same moment (ADR-0042).
    expect(services.domain.store.getState().snapshot.prefs.changedAt).toBe(instantFromEpochMs(TEST_NOW_MS));
  });

  it('keeps the rules of a country whose load is still pending out of the store', async () => {
    let answer: (rules: LoadedRules['rules']) => void = () => undefined;
    const pending = new Promise<LoadedRules['rules']>((resolve) => {
      answer = resolve;
    });
    const services = createTestServices({ snapshot: withPlan, rules: () => pending });
    const started = services.start();
    await vi.waitFor(() => expect(services.domain.store.getState().status).toBe('ready'));
    expect(services.ui.getState().rules).toBeNull();
    answer(rulesOf('PT'));
    await started;
    expect(services.ui.getState().rules).toEqual({ country: 'PT', rules: rulesOf('PT') });
  });
});

describe('createServices: storage persistence (ADR-0019)', () => {
  it('asks the platform once when the first entry is written, again after a wipe', async () => {
    const platform = recordingPlatform();
    const services = createTestServices({ snapshot: withPlan, platform });
    await services.start();
    expect(platform.calls.persist).toBe(0);
    await services.domain.write({ entries: [anEntry()] });
    expect(platform.calls.persist).toBe(1);
    await services.domain.write({ entries: [anEntry()] });
    expect(platform.calls.persist).toBe(1);
    await services.domain.wipe();
    expect(platform.calls.persist).toBe(1);
    await services.domain.write({ plan, entries: [anEntry()] });
    expect(platform.calls.persist).toBe(2);
  });

  it('asks neither on hydration with entries present nor for a plan-only write', async () => {
    const platform = recordingPlatform();
    const stored = createTestServices({ snapshot: { ...withPlan, entries: [anEntry()] }, platform });
    await stored.start();
    await stored.domain.write({ entries: [anEntry()] });
    expect(platform.calls.persist).toBe(0);

    const empty = createTestServices({ platform });
    await empty.start();
    await empty.domain.write({ plan });
    expect(platform.calls.persist).toBe(0);
  });
});

describe('createServices: prices.refresh', () => {
  it('fetches nothing without a plan', async () => {
    const latest = vi.fn(async () => ok(TEST_PRICES));
    const services = createTestServices({ priceSource: { latest } });
    await services.start();
    await services.prices.refresh();
    expect(latest).not.toHaveBeenCalled();
  });

  it('writes live prices without telling the other tabs, then waits for the client TTL', async () => {
    const latest = vi.fn(async () => ok(TEST_PRICES));
    const channel = silentChannel();
    let now = TEST_NOW_MS;
    const services = createTestServices({
      snapshot: withPlan,
      priceSource: { latest },
      channel,
      clock: systemClock('Europe/Lisbon', () => now),
    });
    await services.start();
    await services.prices.refresh();
    expect(latest).toHaveBeenCalledExactlyOnceWith('EUR');
    expect(services.domain.store.getState().snapshot.prices).toEqual(TEST_PRICES);
    expect(channel.post).not.toHaveBeenCalled();
    expect(services.ui.getState().pricesFailure).toBeNull();

    await services.prices.refresh();
    expect(latest).toHaveBeenCalledTimes(1);
    now += 61_000;
    await services.prices.refresh();
    expect(latest).toHaveBeenCalledTimes(2);
  });

  it('keeps a failure as a value and writes nothing, until a refresh succeeds', async () => {
    const failure: ApiFailure = { kind: 'http', status: 503 };
    const latest = vi.fn().mockResolvedValueOnce(err(failure)).mockResolvedValueOnce(ok(TEST_PRICES));
    const services = createTestServices({ snapshot: withPlan, priceSource: { latest } });
    await services.start();
    await services.prices.refresh();
    expect(services.ui.getState().pricesFailure).toEqual(failure);
    expect(services.domain.store.getState().snapshot.prices).toBeNull();
    await services.prices.refresh();
    expect(services.ui.getState().pricesFailure).toBeNull();
    expect(services.domain.store.getState().snapshot.prices).toEqual(TEST_PRICES);
  });

  it('holds a price source that throws as a local failure, writes nothing and never rejects', async () => {
    const latest = vi.fn().mockRejectedValueOnce(new Error('adapter bug')).mockResolvedValueOnce(ok(TEST_PRICES));
    const services = createTestServices({ snapshot: withPlan, priceSource: { latest } });
    await services.start();
    await expect(services.prices.refresh()).resolves.toBeUndefined();
    expect(services.ui.getState().pricesFailure).toEqual({ kind: 'local' });
    expect(services.domain.store.getState().snapshot.prices).toBeNull();
    await services.prices.refresh();
    expect(latest).toHaveBeenCalledTimes(2);
    expect(services.ui.getState().pricesFailure).toBeNull();
    expect(services.domain.store.getState().snapshot.prices).toEqual(TEST_PRICES);
  });

  it('holds a store that refuses the prices as a local failure, keeps the snapshot and tries again', async () => {
    const latest = vi.fn(async () => ok(TEST_PRICES));
    const inner = memoryPlanStore(withPlan);
    let refusals = 1;
    const planStore: PlanStore = {
      ...inner,
      write: (changes) => {
        if (changes.prices !== undefined && refusals-- > 0) return Promise.reject(new Error('quota'));
        return inner.write(changes);
      },
    };
    const services = createTestServices({ planStore, priceSource: { latest } });
    await services.start();
    await expect(services.prices.refresh()).resolves.toBeUndefined();
    expect(services.ui.getState().pricesFailure).toEqual({ kind: 'local' });
    expect(services.domain.store.getState().snapshot.prices).toBeNull();
    expect(inner.current().prices).toBeNull();
    await services.prices.refresh();
    expect(latest).toHaveBeenCalledTimes(2);
    expect(services.ui.getState().pricesFailure).toBeNull();
    expect(services.domain.store.getState().snapshot.prices).toEqual(TEST_PRICES);
  });

  it('runs one request at a time', async () => {
    let answer: (value: Awaited<ReturnType<PriceSource['latest']>>) => void = () => undefined;
    const latest = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<PriceSource['latest']>>>((resolve) => {
          answer = resolve;
        }),
    );
    const services = createTestServices({ snapshot: withPlan, priceSource: { latest } });
    await services.start();
    const first = services.prices.refresh();
    const second = services.prices.refresh();
    expect(latest).toHaveBeenCalledTimes(1);
    answer(ok(TEST_PRICES));
    await Promise.all([first, second]);
    expect(services.domain.store.getState().snapshot.prices).toEqual(TEST_PRICES);
  });
});

describe('createServices: wipe and tick', () => {
  it('clears every draft with the store (the carry-over of ADR-0020)', async () => {
    const schema = z.object({ amount: z.string() });
    const services = createTestServices({ snapshot: withPlan });
    await services.start();
    services.drafts.write('entry', 'new', { amount: '12' });
    expect(services.drafts.read('entry', 'new', schema)).toEqual({ amount: '12' });
    await services.domain.wipe();
    expect(services.drafts.read('entry', 'new', schema)).toBeNull();
    expect(services.domain.store.getState().snapshot).toEqual(EMPTY_SNAPSHOT);
  });

  it('changes today only across a date change in the user’s zone', async () => {
    let now = Date.UTC(2026, 9, 20, 22, 30); // 23:30 in Lisbon (UTC+1 until 25 October)
    const services = createTestServices({ clock: systemClock('Europe/Lisbon', () => now) });
    await services.start();
    const changes = vi.fn();
    services.ui.subscribe(changes);
    services.tick();
    now += 20 * 60_000; // 23:50
    services.tick();
    expect(changes).not.toHaveBeenCalled();
    expect(services.ui.getState().today).toBe('2026-10-20');
    now += 20 * 60_000; // 00:10 the next day
    services.tick();
    expect(changes).toHaveBeenCalledTimes(1);
    expect(services.ui.getState().today).toBe('2026-10-21');
  });
});

describe('createServices: history', () => {
  it('hands the history source to the screens; the test services serve the fixture closes', async () => {
    const answer = await createTestServices().history.closes(TEST_HISTORY.coin, 'USD');
    expect(answer).toEqual({ ok: true, value: { ...TEST_HISTORY, currency: 'USD' } });
    const failing = createTestServices({ historySource: { closes: async () => err({ kind: 'network' }) } });
    expect(await failing.history.closes(TEST_HISTORY.coin, 'EUR')).toEqual({ ok: false, error: { kind: 'network' } });
  });
});
