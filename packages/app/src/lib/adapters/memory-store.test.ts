// The in-memory adapter keeps the IndexedDB adapter's semantics (ADR-0019), so tests and Storybook see
// what the app sees: refusals, id order, "Delete everything", the 24-hour history rule.
import { type CoinId, DEFAULT_PREFS, type Instant, type PriceHistory } from '@proofofcalm/core';
import { anEntry, aPlan, date, instant, money } from '@proofofcalm/core/testing';
import { describe, expect, it } from 'vitest';
import type { CachedHistory, PricesState } from '../ports';
import { issueCodes } from './checks';
import { CLOCK_SKEW_MS, HISTORY_TTL_MS, historyFresh, memoryHistoryCache } from './history';
import { applyChanges, EMPTY_SNAPSHOT, memoryPlanStore } from './memory-store';

const NOW = instant('2026-10-17T09:00:00.000Z');
const BTC = 'BTC' as CoinId;
const closes = [
  [date('2026-10-15'), '60000'],
  [date('2026-10-16'), '61000'],
] as PriceHistory;
const cached: CachedHistory = { coin: BTC, currency: 'EUR', closes, fetchedAt: NOW };
const later = (ms: number) => new Date(Date.parse(NOW) + ms).toISOString() as Instant;

describe('memory plan store', () => {
  it('refuses what the schemas reject and keeps the snapshot as it was', async () => {
    const store = memoryPlanStore();
    const broken = aPlan({ split: { BTC: '70', ETH: '20' } as never });
    await expect(store.write({ plan: broken })).rejects.toThrow(/invalid plan: split: split-sum/);
    await expect(store.write({ entries: [anEntry({ amount: 70.5 as never })] })).rejects.toThrow(
      /invalid entry: amount: invalid_type/,
    );
    await expect(store.write({ entries: [anEntry({ amount: money('0') })] })).rejects.toThrow(/amount-not-positive/);
    await expect(store.write({ prefs: { ...DEFAULT_PREFS, theme: 'sepia' as never } })).rejects.toThrow(TypeError);
    const prices = {
      snapshot: { at: NOW, prices: {} },
      currency: 'EUR',
      fetchedAt: 'yesterday',
      stale: false,
      source: 'live',
    } as unknown as PricesState;
    await expect(store.write({ prices })).rejects.toThrow(/invalid price snapshot: fetchedAt/);
    expect(store.current()).toEqual(EMPTY_SNAPSHOT);
  });

  it('removes the plan with null and keeps a seeded quarantine count through writes', async () => {
    const store = memoryPlanStore({ ...EMPTY_SNAPSHOT, plan: aPlan(), quarantined: 2 });
    await store.write({ plan: null, prefs: { ...DEFAULT_PREFS, logShowAll: true } });
    expect(store.current()).toEqual({
      ...EMPTY_SNAPSHOT,
      prefs: { ...DEFAULT_PREFS, logShowAll: true },
      quarantined: 2,
    });
    const unchanged = applyChanges(store.current(), {});
    expect(unchanged).toEqual(store.current());
  });

  it('stamps changedAt on the preferences it holds, after the preferences of the same write', async () => {
    const store = memoryPlanStore({ ...EMPTY_SNAPSHOT, prefs: { ...DEFAULT_PREFS, theme: 'dark' } });
    await store.write({ entries: [anEntry()], changedAt: NOW });
    expect(store.current().prefs).toEqual({ ...DEFAULT_PREFS, theme: 'dark', changedAt: NOW });
    await store.write({ plan: aPlan(), prefs: { ...DEFAULT_PREFS, logShowAll: true }, changedAt: later(1000) });
    expect(store.current().prefs).toEqual({ ...DEFAULT_PREFS, logShowAll: true, changedAt: later(1000) });
    await expect(store.write({ changedAt: 'yesterday' as Instant })).rejects.toThrow(/invalid change time/);
  });

  it('empties the snapshot and the history cache on "Delete everything"', async () => {
    const store = memoryPlanStore({ ...EMPTY_SNAPSHOT, plan: aPlan(), entries: [anEntry()], quarantined: 1 });
    await store.history.put(cached);
    await store.wipe();
    expect(await store.load()).toEqual(EMPTY_SNAPSHOT);
    expect(await store.history.get(BTC, 'EUR', NOW)).toBeNull();
  });

  it('keeps no closes that arrive after "Delete everything", as IndexedDB keeps none beside no plan', async () => {
    const store = memoryPlanStore({ ...EMPTY_SNAPSHOT, plan: aPlan(), entries: [anEntry()] });
    await store.wipe();
    await store.history.put(cached);
    expect(await store.history.get(BTC, 'EUR', NOW)).toBeNull();
    await store.write({ plan: aPlan() });
    await store.history.put(cached);
    expect(await store.history.get(BTC, 'EUR', NOW)).toEqual(cached);
  });

  it('puts the snapshot back on the undo, and refuses it once a plan or a live entry is stored', async () => {
    const before = { ...EMPTY_SNAPSHOT, plan: aPlan(), entries: [anEntry()], quarantined: 1 };
    const store = memoryPlanStore(before);
    expect(await store.restore(await store.wipe())).toBe(true);
    expect(await store.load()).toStrictEqual(before);
    const wiped = await store.wipe();
    await store.write({ entries: [anEntry()] });
    const after = await store.load();
    expect(await store.restore(wiped)).toBe(false);
    expect(await store.load()).toBe(after);
  });
});

describe('history cache (ADR-0036: at most 24 hours)', () => {
  it('serves closes for less than 24 hours, then deletes them', async () => {
    const cache = memoryHistoryCache();
    await cache.put(cached);
    expect(await cache.get(BTC, 'EUR', NOW)).toEqual(cached);
    expect(await cache.get(BTC, 'USD', NOW)).toBeNull();
    expect(await cache.get(BTC, 'EUR', later(HISTORY_TTL_MS - 1))).toEqual(cached);
    expect(await cache.get(BTC, 'EUR', later(HISTORY_TTL_MS))).toBeNull();
    // Gone, not stale: an earlier clock does not bring it back.
    expect(await cache.get(BTC, 'EUR', NOW)).toBeNull();
  });

  it('refuses closes that are not in ascending date order', async () => {
    const cache = memoryHistoryCache();
    const reversed = [...closes].reverse() as PriceHistory;
    await expect(cache.put({ ...cached, closes: reversed })).rejects.toThrow(/invalid price history: closes/);
  });

  it('allows a fetch time up to five minutes after now (a clock behind the server’s), no more', () => {
    expect(historyFresh(NOW, NOW)).toBe(true);
    expect(historyFresh(later(30_000), NOW)).toBe(true);
    expect(historyFresh(later(CLOCK_SKEW_MS), NOW)).toBe(true);
    expect(historyFresh(later(CLOCK_SKEW_MS + 1), NOW)).toBe(false);
    expect(historyFresh('not a time' as Instant, NOW)).toBe(false);
  });
});

describe('issue codes', () => {
  it('writes each issue as path and code, the core code or the sentence for a refinement', () => {
    const issues = [
      { code: 'invalid_type', path: [], message: 'Invalid input' },
      { code: 'custom', path: ['split'], message: 'split-sum' },
      { code: 'custom', path: ['amount', 0], message: 'Expected a plain decimal string for money' },
    ];
    expect(issueCodes(issues, null)).toEqual([
      'row: invalid_type',
      'split: split-sum',
      'amount.0: Expected a plain decimal string for money',
    ]);
    expect(issueCodes(issues.slice(0, 1), 'payload')).toEqual(['payload: invalid_type']);
  });
});
