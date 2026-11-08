import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, BTC, date, ETH, id, instant, money, units } from '../../test/builders';
import { MAX_ENTRIES } from '../constants';
import type { Entry } from '../schema/entry';
import { overCap } from './cap';
import { deleteEntries, restoreEntries, type SaveContext, saveTransaction, slotsAtDelete } from './entries';

// A plan holds at most MAX_ENTRIES live entries, the most its backup restores (docs/DOMAIN.md §6, §9).
const plan = aPlan();
const now = instant('2026-03-02T10:00:00Z');
const extra = () => anEntry({ kind: 'extra', slot: null, amount: money('10'), units: units('0.0001') });
const extras = (count: number) => Array.from({ length: count }, extra);
const tombstone = (entry: Entry) => ({ ...entry, deletedAt: now, updatedAt: now });
const context = (entries: readonly Entry[], editing: readonly Entry[] = []): SaveContext => ({
  plan,
  entries,
  editing,
  ids: [id()],
  now,
  source: 'manual',
});
const buy = {
  kind: 'extra',
  date: date('2026-03-01'),
  slot: null,
  fee: null,
  note: '',
  venue: null,
  rows: [{ coin: BTC.id, amount: money('20'), units: units('0.0002') }],
} as const;
const twoRows = {
  ...buy,
  rows: [...buy.rows, { coin: ETH.id, amount: money('10'), units: units('0.003') }],
} as const;
const refusal = { code: 'too-many-entries', max: 10_000 };

describe('overCap', () => {
  it('refuses a write that leaves more live entries than the cap and more than before', () => {
    const full = extras(MAX_ENTRIES);
    expect(overCap(full, [...full, extra()])).toEqual(refusal);
    expect(overCap(full.slice(1), full)).toBeNull();
  });

  it('never refuses an edit, a delete or a tombstone, even over the cap', () => {
    const over = extras(MAX_ENTRIES + 2);
    expect(overCap(over, over)).toBeNull();
    expect(overCap(over, over.slice(1))).toBeNull();
    expect(overCap(over, [...over.slice(1), tombstone(over[0] as Entry)])).toBeNull();
    expect(overCap(over, [...over, tombstone(extra())])).toBeNull();
    expect(overCap(over, [...over, extra()])).toEqual(refusal);
  });
});

describe('saveTransaction at the cap', () => {
  const full = extras(MAX_ENTRIES);

  it('refuses a new buy once the plan holds 10,000 live entries', () => {
    expect(saveTransaction(buy, context(full))).toEqual({ ok: false, error: refusal });
  });

  it('saves an edit of an entry at the cap', () => {
    const edited = full[0] as Entry;
    const saved = saveTransaction(buy, context(full, [edited]));
    expect(saved.ok && saved.value.map((entry) => entry.id)).toEqual([edited.id]);
  });

  it('refuses an edit at the cap that fills a new coin row, and saves one that keeps one row', () => {
    const edited = full[0] as Entry;
    expect(saveTransaction(twoRows, context(full, [edited]))).toEqual({ ok: false, error: refusal });
    expect(saveTransaction(buy, context(full, [edited])).ok).toBe(true);
  });

  it('refuses a two-row buy beside 9,999 live entries and saves a one-row buy', () => {
    const entries = extras(MAX_ENTRIES - 1);
    const ids = { ids: [id(), id()] };
    expect(saveTransaction(twoRows, { ...context(entries), ...ids })).toEqual({ ok: false, error: refusal });
    expect(saveTransaction(buy, { ...context(entries), ...ids }).ok).toBe(true);
  });

  it('accepts a new buy beside 9,999 live entries and a tombstone', () => {
    const entries = [...extras(MAX_ENTRIES - 1), tombstone(extra())];
    expect(saveTransaction(buy, context(entries)).ok).toBe(true);
  });
});

describe('restoreEntries at the cap', () => {
  it('refuses an undo that would bring the plan above 10,000 live entries', () => {
    const deleted = extra();
    const before = slotsAtDelete(plan, [deleted], [deleted.id], now);
    const entries = [...extras(MAX_ENTRIES), ...deleteEntries([deleted], [deleted.id], before.at)];
    const later = instant('2026-03-02T10:00:05Z');
    expect(restoreEntries(plan, entries, [deleted.id], before, later)).toEqual({ ok: false, error: refusal });
  });

  it('refuses the undo of a three-row delete at 9,998 live entries', () => {
    const deleted = extras(3);
    const ids = deleted.map((entry) => entry.id);
    const before = slotsAtDelete(plan, deleted, ids, now);
    const entries = [...extras(MAX_ENTRIES - 2), ...deleteEntries(deleted, ids, before.at)];
    const later = instant('2026-03-02T10:00:05Z');
    expect(restoreEntries(plan, entries, ids, before, later)).toEqual({ ok: false, error: refusal });
  });

  it('restores an undo that stays within the cap', () => {
    const deleted = extra();
    const before = slotsAtDelete(plan, [deleted], [deleted.id], now);
    const entries = [...extras(MAX_ENTRIES - 1), ...deleteEntries([deleted], [deleted.id], before.at)];
    const later = instant('2026-03-02T10:00:05Z');
    expect(restoreEntries(plan, entries, [deleted.id], before, later).ok).toBe(true);
  });
});
