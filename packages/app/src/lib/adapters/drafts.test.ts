import { CalendarDateSchema, isRecord } from '@proofofcalm/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sessionDrafts } from './drafts';
import type { Schema } from './schema';

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    items,
    get length() {
      return items.size;
    },
    key: (index: number) => [...items.keys()][index] ?? null,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    removeItem: (key: string) => {
      items.delete(key);
    },
  };
}

type EntryDraft = { readonly amount: string; readonly note: string };
// What a form's draft schema does: accept exactly the shape the form writes.
const EntryDraftSchema: Schema<EntryDraft> = {
  safeParse: (input) =>
    isRecord(input) && typeof input.amount === 'string' && typeof input.note === 'string'
      ? { success: true, data: { amount: input.amount, note: input.note } }
      : { success: false },
};

const failing = (message: string) => () => {
  throw new DOMException(message, 'QuotaExceededError');
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sessionDrafts (ADR-0020, ADR-0034)', () => {
  it('keeps a draft per form and entity, as JSON, until it is cleared', () => {
    const storage = memoryStorage();
    const drafts = sessionDrafts(() => storage);
    drafts.write('log-entry', 'new', { amount: '1 234,56', note: 'Kraken' });
    drafts.write('log-entry', 'entry-1', { amount: '50', note: '' });
    expect(storage.items.get('proof-of-calm:draft:log-entry:new')).toBe('{"amount":"1 234,56","note":"Kraken"}');
    expect(drafts.read('log-entry', 'new', EntryDraftSchema)).toEqual({ amount: '1 234,56', note: 'Kraken' });
    expect(drafts.read('log-entry', 'entry-1', EntryDraftSchema)).toEqual({ amount: '50', note: '' });
    drafts.clear('log-entry', 'new');
    expect(drafts.read('log-entry', 'new', EntryDraftSchema)).toBeNull();
    expect(drafts.read('log-entry', 'entry-1', EntryDraftSchema)).not.toBeNull();
  });

  it('clears every draft at once for "Delete everything", and nothing else in the tab’s storage', () => {
    const storage = memoryStorage();
    const drafts = sessionDrafts(() => storage);
    drafts.write('log-entry', 'new', { amount: '1 234,56', note: 'Kraken' });
    drafts.write('log-entry', 'entry-1', { amount: '50', note: '' });
    drafts.write('onboarding-dates', 'new', '2026-11-01');
    drafts.write('onboarding', 'new', { step: 'dates', draft: { monthly: '100' } });
    storage.setItem('proof-of-calm:theme', 'dark');
    storage.setItem('other-app', '1');
    drafts.clearAll();
    expect([...storage.items.keys()]).toEqual(['proof-of-calm:theme', 'other-app']);
    storage.key = failing('denied');
    expect(() => drafts.clearAll()).not.toThrow();
  });

  it('reads through a zod/mini schema from the core as well', () => {
    const storage = memoryStorage();
    const drafts = sessionDrafts(() => storage);
    drafts.write('onboarding-dates', 'new', '2026-11-01');
    expect(drafts.read('onboarding-dates', 'new', CalendarDateSchema)).toBe('2026-11-01');
    drafts.write('onboarding-dates', 'new', '2026-02-30');
    expect(drafts.read('onboarding-dates', 'new', CalendarDateSchema)).toBeNull();
  });

  it('discards a stale or foreign draft, and a value that is not JSON', () => {
    const storage = memoryStorage();
    const drafts = sessionDrafts(() => storage);
    storage.setItem('proof-of-calm:draft:log-entry:new', '{"amount":12}');
    expect(drafts.read('log-entry', 'new', EntryDraftSchema)).toBeNull();
    expect(storage.items.size).toBe(0);
    storage.setItem('proof-of-calm:draft:log-entry:new', '{not json');
    expect(drafts.read('log-entry', 'new', EntryDraftSchema)).toBeNull();
    expect(storage.items.size).toBe(0);
  });

  it('leaves the form without a draft when storage throws, and never keeps an older draft after a failed write', () => {
    const storage = memoryStorage();
    const drafts = sessionDrafts(() => storage);
    drafts.write('log-entry', 'new', { amount: '10', note: '' });
    storage.setItem = failing('quota');
    expect(() => drafts.write('log-entry', 'new', { amount: '20', note: '' })).not.toThrow();
    expect(drafts.read('log-entry', 'new', EntryDraftSchema)).toBeNull();
    storage.getItem = failing('denied');
    storage.removeItem = failing('denied');
    expect(drafts.read('log-entry', 'new', EntryDraftSchema)).toBeNull();
    expect(() => drafts.clear('log-entry', 'new')).not.toThrow();
  });

  it('writes nothing for a value JSON cannot hold', () => {
    const storage = memoryStorage();
    const drafts = sessionDrafts(() => storage);
    drafts.write('log-entry', 'new', { amount: '10', note: '' });
    drafts.write('log-entry', 'new', undefined);
    expect(storage.items.size).toBe(0);
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => drafts.write('log-entry', 'new', cyclic)).not.toThrow();
    expect(storage.items.size).toBe(0);
  });

  it('uses the browser’s sessionStorage by default, and none in a server render', () => {
    const storage = memoryStorage();
    vi.stubGlobal('sessionStorage', storage);
    sessionDrafts().write('settings-plan', 'plan-1', { amount: '100', note: '' });
    expect(storage.items.has('proof-of-calm:draft:settings-plan:plan-1')).toBe(true);
    vi.stubGlobal('sessionStorage', undefined);
    expect(sessionDrafts().read('settings-plan', 'plan-1', EntryDraftSchema)).toBeNull();
  });

  it('works without drafts where touching sessionStorage throws (blocked site data)', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get: failing('blocked') });
    try {
      expect(sessionDrafts().read('settings-plan', 'plan-1', EntryDraftSchema)).toBeNull();
      expect(() => sessionDrafts().write('settings-plan', 'plan-1', { amount: '1', note: '' })).not.toThrow();
    } finally {
      if (original === undefined) Reflect.deleteProperty(globalThis, 'sessionStorage');
      else Object.defineProperty(globalThis, 'sessionStorage', original);
    }
  });
});
