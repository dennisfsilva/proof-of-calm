import { describe, expect, it } from 'vitest';
import { aMove, anEntry, money, month, units } from '../../test/builders';
import {
  ENTRY_SCHEMA_VERSION,
  type Entry,
  EntrySchema,
  entryIssues,
  isEstimate,
  savedSource,
  writtenEntryVersion,
} from './entry';

const codes = (entry: Entry) => entryIssues(entry).map((issue) => issue.code);

describe('EntrySchema (docs/DOMAIN.md §2.2)', () => {
  it('accepts a valid entry unchanged', () => {
    const entry = anEntry({ fee: money('0.5'), venue: 'Kraken', note: 'first buy' });
    expect(EntrySchema.parse(entry)).toEqual(entry);
  });

  it('wants both the amount and the units above zero, as the prototype did', () => {
    expect(codes(anEntry({ amount: money('0') }))).toEqual(['amount-not-positive']);
    expect(codes(anEntry({ units: units('0') }))).toEqual(['units-not-positive']);
    expect(codes(anEntry({ amount: money('-1'), units: units('-0.1') }))).toEqual([
      'amount-not-positive',
      'units-not-positive',
    ]);
  });

  it('keeps units to ten decimals and fees non-negative', () => {
    expect(codes(anEntry({ units: units('0.12345678901') }))).toEqual(['units-precision']);
    expect(codes(anEntry({ units: units('0.1234567890') }))).toEqual([]);
    expect(codes(anEntry({ fee: money('-0.01') }))).toEqual(['fee-negative']);
    expect(codes(anEntry({ fee: money('0') }))).toEqual([]);
  });

  it('requires a slot for monthly buys and refuses one for anything else', () => {
    expect(codes(anEntry({ kind: 'dca', slot: null }))).toEqual(['slot-required']);
    expect(codes(anEntry({ kind: 'extra', slot: month('2026-01') }))).toEqual(['slot-not-allowed']);
    expect(codes(anEntry({ kind: 'sell', slot: null }))).toEqual([]);
    expect(codes(anEntry({ kind: 'lump', slot: null }))).toEqual([]);
  });

  it('takes a null or zero amount on coins held only, and never a fee on them', () => {
    const held = (overrides: Partial<Entry>) => anEntry({ kind: 'held', slot: null, fee: null, ...overrides });
    expect(codes(held({ amount: null }))).toEqual([]);
    expect(codes(held({ amount: money('0') }))).toEqual([]);
    expect(codes(held({ amount: money('120') }))).toEqual([]);
    expect(codes(held({ amount: money('-1') }))).toEqual(['amount-not-positive']);
    expect(codes(held({ units: units('0') }))).toEqual(['units-not-positive']);
    expect(codes(held({ fee: money('0') }))).toEqual(['fee-not-allowed']);
    expect(codes(held({ slot: month('2026-01') }))).toEqual(['slot-not-allowed']);
    for (const kind of ['dca', 'lump', 'extra', 'sell'] as const) {
      const slot = kind === 'dca' ? month('2026-01') : null;
      expect(codes(anEntry({ kind, slot, amount: null }))).toEqual(['amount-required']);
      expect(codes(anEntry({ kind, slot, amount: money('0') }))).toEqual(['amount-not-positive']);
    }
    const unknownCost = held({ amount: null });
    expect(EntrySchema.parse(unknownCost)).toEqual(unknownCost);
  });

  it('takes a move with no amount, fee or slot, its destination and its units received, 0 < received ≤ units', () => {
    const move = aMove();
    expect(EntrySchema.parse(move)).toEqual(move);
    expect(codes(aMove({ received: move.units }))).toEqual([]);
    expect(codes(aMove({ venue: null }))).toEqual([]);
    expect(codes(aMove({ amount: money('1') }))).toEqual(['amount-not-allowed']);
    expect(codes(aMove({ fee: money('0') }))).toEqual(['fee-not-allowed']);
    expect(codes(aMove({ slot: month('2026-01') }))).toEqual(['slot-not-allowed']);
    expect(codes(aMove({ received: units('0') }))).toEqual(['received-not-positive']);
    expect(codes(aMove({ received: units('0.011') }))).toEqual(['received-exceeds-units']);
    expect(codes(aMove({ received: units('0.00999999999') }))).toEqual(['units-precision']);
    expect(codes(aMove({ to: 'Kraken' }))).toEqual(['same-venue']);
  });

  it('requires both `to` and `received` on a move and refuses either key, even undefined, on any other kind', () => {
    const { to: _to, received: _received, ...bare } = aMove();
    expect(codes(bare)).toEqual(['move-required', 'move-required']);
    expect(codes({ ...bare, to: 'Ledger' })).toEqual(['move-required']);
    expect(entryIssues({ ...bare, received: units('0.01') })).toEqual([{ code: 'move-required', path: ['to'] }]);
    expect(entryIssues(anEntry({ to: 'Ledger' }))).toEqual([{ code: 'move-not-allowed', path: ['to'] }]);
    expect(entryIssues(anEntry({ received: units('0.001') }))).toEqual([
      { code: 'move-not-allowed', path: ['received'] },
    ]);
    expect(EntrySchema.safeParse({ ...anEntry(), to: undefined }).success).toBe(false);
  });

  it('writes an entry at the lowest version that holds it: 4 for a move, 3 for coins held, 2 for every other kind', () => {
    expect(ENTRY_SCHEMA_VERSION).toBe(4);
    expect(writtenEntryVersion(aMove())).toBe(4);
    expect(writtenEntryVersion(anEntry({ kind: 'held', slot: null, amount: null }))).toBe(3);
    expect(writtenEntryVersion(anEntry({ kind: 'dca', slot: month('2026-01') }))).toBe(2);
    for (const kind of ['lump', 'extra', 'sell'] as const) expect(writtenEntryVersion(anEntry({ kind }))).toBe(2);
  });

  it('reports invariants through the schema with their codes', () => {
    const result = EntrySchema.safeParse(anEntry({ kind: 'extra' }));
    expect(result.error?.issues).toEqual([expect.objectContaining({ message: 'slot-not-allowed', path: ['slot'] })]);
  });

  it('rejects malformed fields', () => {
    expect(EntrySchema.safeParse({ ...anEntry(), coin: 'btc' }).success).toBe(false);
    expect(EntrySchema.safeParse({ ...anEntry(), id: 'not-an-id' }).success).toBe(false);
    expect(EntrySchema.safeParse({ ...anEntry(), id: 'pk3j2xabcde' }).success).toBe(true);
    expect(EntrySchema.safeParse({ ...anEntry(), venue: '' }).success).toBe(false);
    expect(EntrySchema.safeParse({ ...anEntry(), source: 'api' }).success).toBe(false);
  });
});

describe('isEstimate and savedSource (ADR-0003; docs/DOMAIN.md §2.2)', () => {
  it('marks a one-tap entry as an estimate and nothing else', () => {
    expect(isEstimate({ source: 'one-tap' })).toBe(true);
    for (const source of ['manual', 'import-prototype', 'import-json', 'import-csv'] as const) {
      expect(isEstimate({ source })).toBe(false);
    }
  });

  it('turns an estimate manual only when its units change in value; any other entry keeps its source', () => {
    const tapped = anEntry({ source: 'one-tap', units: units('0.001') });
    expect(savedSource(tapped, units('0.0011'), 'manual')).toBe('manual');
    expect(savedSource(tapped, units('0.00100'), 'manual')).toBe('one-tap');
    expect(savedSource(anEntry({ source: 'import-csv' }), units('2'), 'manual')).toBe('import-csv');
    expect(savedSource(undefined, units('2'), 'one-tap')).toBe('one-tap');
  });
});
