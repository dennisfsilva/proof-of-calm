import { describe, expect, it } from 'vitest';
import { date, instant } from '../../test/builders';
import type { CalendarDate, Instant } from '../dates/calendar';
import type { EntityId } from '../schema/ids';
import { compareWrites, mergeRows, purgeTombstones, type SyncRow, supersedes, tombstoneExpired } from './rows';

const PHONE = '00000000-0000-4000-8000-00000000000a' as EntityId;
const LAPTOP = '00000000-0000-4000-8000-00000000000b' as EntityId;
const ENTRY = '00000000-0000-4000-8000-000000000001' as EntityId;
const OTHER = '00000000-0000-4000-8000-000000000002' as EntityId;

const row = (overrides: Partial<SyncRow<string>> = {}): SyncRow<string> => ({
  id: ENTRY,
  updatedAt: instant('2026-10-17T09:00:00Z'),
  deviceId: PHONE,
  deletedAt: null,
  payload: 'a',
  ...overrides,
});

describe('compareWrites (ADR-0021)', () => {
  it('orders writes by the moment they name, not by their text', () => {
    // 10:30 in Lisbon's summer time is 09:30Z, before 09:45Z, though it sorts after it as text.
    const lisbon = { updatedAt: instant('2026-10-17T10:30:00+01:00'), deviceId: PHONE };
    const utc = { updatedAt: instant('2026-10-17T09:45:00Z'), deviceId: PHONE };
    expect(compareWrites(lisbon, utc)).toBe(-1);
    expect(compareWrites(utc, lisbon)).toBe(1);
  });

  it('breaks a tie of moments by the device id and finds a write equal to itself', () => {
    const phone = { updatedAt: instant('2026-10-17T09:00:00Z'), deviceId: PHONE };
    const laptop = { updatedAt: instant('2026-10-17T10:00:00+01:00'), deviceId: LAPTOP };
    expect(compareWrites(laptop, phone)).toBe(1);
    expect(compareWrites(phone, laptop)).toBe(-1);
    expect(compareWrites(phone, { ...phone })).toBe(0);
  });
});

describe('supersedes', () => {
  it('lets only a strictly later write replace a stored row, and any write fill an empty place', () => {
    const stored = row();
    expect(supersedes(row({ updatedAt: instant('2026-10-17T09:00:01Z') }), stored)).toBe(true);
    expect(supersedes(row({ deviceId: LAPTOP }), stored)).toBe(true);
    expect(supersedes(row({ payload: 'b' }), stored)).toBe(false);
    expect(supersedes(row({ updatedAt: instant('2026-10-17T08:59:59Z') }), stored)).toBe(false);
    expect(supersedes(row(), null)).toBe(true);
  });
});

describe('mergeRows', () => {
  it('keeps the later write per id, tombstones included, sorted by id', () => {
    const edit = row({ id: OTHER, payload: 'edited', updatedAt: instant('2026-10-17T11:00:00+01:00') });
    const deletion = row({ deletedAt: instant('2026-10-17T12:00:00Z'), updatedAt: instant('2026-10-17T12:00:00Z') });
    const local = [row({ id: OTHER }), row()];
    const remote = [deletion, edit];
    expect(mergeRows(local, remote)).toEqual([deletion, edit]);
    expect(mergeRows(remote, local)).toEqual([deletion, edit]);
  });

  it('lets a restore after a deletion win, as any later write does', () => {
    const deletion = row({ deletedAt: instant('2026-10-17T12:00:00Z'), updatedAt: instant('2026-10-17T12:00:00Z') });
    const restore = row({ updatedAt: instant('2026-10-17T12:00:05Z'), deviceId: LAPTOP });
    expect(mergeRows([deletion], [restore])).toEqual([restore]);
  });

  it('settles two different rows with the same stamp the same way whichever side they come from', () => {
    const [a, b] = [row({ payload: 'a' }), row({ payload: 'b' })];
    expect(mergeRows([a], [b])).toEqual([b]);
    expect(mergeRows([b], [a])).toEqual([b]);
    expect(mergeRows([a], [a])).toEqual([a]);
  });
});

describe('tombstones', () => {
  it('expire 90 days after the day of the deletion', () => {
    expect(tombstoneExpired(date('2026-01-01'), date('2026-03-31'))).toBe(false);
    expect(tombstoneExpired(date('2026-01-01'), date('2026-04-01'))).toBe(true);
  });

  it('are purged by the day the shell names for each deletion, live rows kept', () => {
    // The shell's day of an instant, here the UTC date.
    const dayOf = (value: Instant) => value.slice(0, 10) as CalendarDate;
    const live = row({ id: OTHER });
    const old = row({ deletedAt: instant('2026-01-01T23:30:00Z') });
    const recent = row({ deletedAt: instant('2026-01-02T00:30:00Z') });
    expect(purgeTombstones([live, old, recent], date('2026-04-01'), dayOf)).toEqual([live, recent]);
  });
});
