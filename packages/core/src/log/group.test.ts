import { describe, expect, it } from 'vitest';
import { date, month } from '../../test/builders';
import { transactionKey } from './group';

describe('transactionKey (docs/DOMAIN.md §3.9)', () => {
  it('groups by kind and date, and by slot for monthly buys only', () => {
    expect(transactionKey({ kind: 'dca', date: date('2026-03-02'), slot: month('2026-03') })).toBe(
      'dca|2026-03-02|2026-03',
    );
    expect(transactionKey({ kind: 'extra', date: date('2026-03-02'), slot: null })).toBe('extra|2026-03-02|');
    expect(transactionKey({ kind: 'sell', date: date('2026-03-02'), slot: month('2026-03') })).toBe('sell|2026-03-02|');
    // A monthly buy without a slot is invalid (the entry schema refuses it); it still gets a key.
    expect(transactionKey({ kind: 'dca', date: date('2026-03-02'), slot: null })).toBe('dca|2026-03-02|');
  });
});
