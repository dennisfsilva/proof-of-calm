import { describe, expect, it } from 'vitest';
import { anEntry, instant, money, units } from '../../test/builders';
import type { Entry } from '../schema/entry';
import { type EditedFields, keepSources } from './rows';

// What an edit keeps of each row's source entry (docs/DOMAIN.md §6, Edit a transaction).

const NOTHING: EditedFields = { fee: false, venue: false, note: false };
const fields = (entries: readonly Entry[]) => entries.map((each) => [each.fee, each.venue, each.note]);

describe('keepSources', () => {
  const first = anEntry({ fee: money('1'), venue: 'Kraken', note: 'first' });
  const second = anEntry({ fee: money('3'), venue: 'Bitvavo', note: 'second' });
  // As the save writes them: the fee summed and split by amount, the first entry's venue and note on both.
  const saved = [first, second].map((each) => ({ ...each, fee: money('2'), venue: 'Kraken', note: 'first' }));

  it("gives each saved entry its source's fee, venue and note while the person changed none", () => {
    expect(fields(keepSources(saved, [first, second], NOTHING))).toEqual([
      ['1', 'Kraken', 'first'],
      ['3', 'Bitvavo', 'second'],
    ]);
  });

  it('keeps a field the person changed as the save set it on every entry', () => {
    const changed = { fee: true, venue: true, note: true };
    expect(fields(keepSources(saved, [first, second], changed))).toEqual(fields(saved));
  });

  it('gives a row without a source no fee while the fee is unchanged, and its venue and note as saved', () => {
    expect(fields(keepSources(saved, [first, undefined], NOTHING))).toEqual([
      ['1', 'Kraken', 'first'],
      [null, 'Kraken', 'first'],
    ]);
  });

  it('leaves the entries past the filled rows (the soft-deleted ones) as the save returned them', () => {
    const removed = { ...second, deletedAt: instant('2026-11-14T09:00:00+00:00') };
    expect(keepSources([saved[0] as Entry, removed], [first], NOTHING)).toEqual([
      { ...saved[0], fee: '1', venue: 'Kraken', note: 'first' },
      removed,
    ]);
  });

  it('keeps the stored text of an amount or units equal in value, and takes figures that differ', () => {
    const source = anEntry({ amount: money('70.50'), units: units('0.00100') });
    const equal = { ...source, amount: money('70.5'), units: units('0.001') };
    const [same] = keepSources([equal], [source], NOTHING) as [Entry];
    expect([same.amount, same.units]).toEqual(['70.50', '0.00100']);
    const other = { ...source, amount: money('71'), units: units('0.002') };
    const [moved] = keepSources([other], [source], NOTHING) as [Entry];
    expect([moved.amount, moved.units]).toEqual(['71', '0.002']);
  });

  it('keeps a held entry without a cost without one, and gives one typed over a source without a cost as saved', () => {
    const held = anEntry({ kind: 'held', amount: null });
    expect(keepSources([held], [held], NOTHING)[0]?.amount).toBeNull();
    const costed = { ...held, amount: money('0') };
    expect(keepSources([costed], [held], NOTHING)[0]?.amount).toBe('0');
  });
});
