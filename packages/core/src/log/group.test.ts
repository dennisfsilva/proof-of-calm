import { describe, expect, it } from 'vitest';
import { date, id, month } from '../../test/builders';
import { transactionKey } from './group';

const NO_ID = id();

describe('transactionKey (docs/DOMAIN.md §3.9)', () => {
  it('keys each move by its own id, so two moves of one day are two rows', () => {
    const [first, second] = [id(), id()];
    const move = { kind: 'move', date: date('2026-03-02'), slot: null } as const;
    expect(transactionKey({ ...move, id: first })).toBe(`move|2026-03-02|${first}`);
    expect(transactionKey({ ...move, id: second })).not.toBe(transactionKey({ ...move, id: first }));
  });

  it('groups by kind and date, and by slot for monthly buys only', () => {
    expect(transactionKey({ id: NO_ID, kind: 'dca', date: date('2026-03-02'), slot: month('2026-03') })).toBe(
      'dca|2026-03-02|2026-03',
    );
    expect(transactionKey({ id: NO_ID, kind: 'extra', date: date('2026-03-02'), slot: null })).toBe(
      'extra|2026-03-02|',
    );
    expect(transactionKey({ id: NO_ID, kind: 'sell', date: date('2026-03-02'), slot: month('2026-03') })).toBe(
      'sell|2026-03-02|',
    );
    // A monthly buy without a slot is invalid (the entry schema refuses it); it still gets a key.
    expect(transactionKey({ id: NO_ID, kind: 'dca', date: date('2026-03-02'), slot: null })).toBe('dca|2026-03-02|');
  });
});
