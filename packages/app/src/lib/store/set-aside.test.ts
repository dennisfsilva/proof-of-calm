import { anEntry, instant } from '@proofofcalm/core/testing';
import { describe, expect, it } from 'vitest';
import { missingEntries, setAsideKey, withSetAsideKey } from './set-aside';

const EARLY = instant('2026-10-01T08:00:00.000Z');
const LATE = instant('2026-10-17T09:00:00.000Z');

describe('missingEntries', () => {
  it('is none while nothing is set aside', () => {
    expect(missingEntries([], [anEntry()], [])).toStrictEqual({ count: 0, since: null });
  });

  it('counts the set-aside entries no stored entry holds, since the earliest of them', () => {
    const back = anEntry();
    const rows = [
      { id: 'a', at: LATE },
      { id: back.id, at: instant('2026-09-01T08:00:00.000Z') },
      { id: 'b', at: EARLY },
    ];
    expect(missingEntries(rows, [back], [])).toStrictEqual({ count: 2, since: EARLY });
  });

  it('counts an entry as back when its id is stored, deleted or not', () => {
    const deleted = anEntry({ deletedAt: LATE });
    expect(missingEntries([{ id: deleted.id, at: EARLY }], [deleted], [])).toStrictEqual({ count: 0, since: null });
  });

  it('is none while the key for this many set-aside rows is hidden, and shows again when one more is set aside', () => {
    const rows = [{ id: 'a', at: EARLY }];
    expect(missingEntries(rows, [], [setAsideKey(1)])).toStrictEqual({ count: 0, since: null });
    expect(missingEntries([...rows, { id: 'b', at: LATE }], [], [setAsideKey(1)])).toStrictEqual({
      count: 2,
      since: EARLY,
    });
  });
});

describe('withSetAsideKey', () => {
  it('drops the older set-aside keys and keeps the other banner keys', () => {
    expect(withSetAsideKey(['red-day:2026-10', 'set-aside:1'], 3)).toStrictEqual(['red-day:2026-10', 'set-aside:3']);
  });
});
