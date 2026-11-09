import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, instant, money, units } from '../../test/builders';
import { deleteEntries, restoreEntries, slotsAtDelete } from './entries';

// An undo across a change of the plan's pay currency (docs/DOMAIN.md §6, Delete entry; ADR-0053's Corrections):
// amounts typed in the old currency never come back to read as the new one.
describe('restoreEntries after the pay currency moved', () => {
  const now = instant('2026-03-02T10:00:00Z');
  const later = instant('2026-03-02T10:00:05Z');
  const euros = aPlan();
  const pounds = aPlan({ payCurrency: 'GBP', displayCurrency: 'GBP' });
  const paid = anEntry({ kind: 'extra', slot: null, amount: money('70') });
  const feeOnly = anEntry({ kind: 'extra', slot: null, amount: null, fee: money('1') });
  const held = anEntry({ kind: 'held', slot: null, amount: null, units: units('0.5') });

  it('notes the pay currency at the delete, and none without a plan', () => {
    expect(slotsAtDelete(euros, [paid], [paid.id], now).currency).toBe('EUR');
    expect(slotsAtDelete(null, [paid], [paid.id], now).currency).toBeNull();
  });

  it('refuses, restoring nothing, when a restored entry holds an amount or a fee', () => {
    for (const entry of [paid, feeOnly]) {
      const before = slotsAtDelete(euros, [entry], [entry.id], now);
      const deleted = deleteEntries([entry], [entry.id], now);
      expect(restoreEntries(pounds, deleted, [entry.id], before, later)).toEqual({
        ok: false,
        error: { code: 'currency-changed', from: 'EUR', to: 'GBP' },
      });
    }
  });

  it('restores as before when the currency did not move, or no restored entry holds an amount or a fee', () => {
    const both = [paid, held];
    const before = slotsAtDelete(euros, both, [paid.id, held.id], now);
    const deleted = deleteEntries(both, [paid.id, held.id], now);
    const restored = restoreEntries(euros, deleted, [paid.id, held.id], before, later);
    expect(restored.ok && restored.value.map((entry) => entry.id)).toEqual([paid.id, held.id]);
    const heldOnly = slotsAtDelete(euros, [held], [held.id], now);
    const gone = deleteEntries([held], [held.id], now);
    expect(restoreEntries(pounds, gone, [held.id], heldOnly, later)).toEqual({
      ok: true,
      value: [{ ...held, deletedAt: null, updatedAt: later }],
    });
  });

  it('checks nothing against a delete that saw no plan', () => {
    const before = slotsAtDelete(null, [paid], [paid.id], now);
    const deleted = deleteEntries([paid], [paid.id], now);
    expect(restoreEntries(pounds, deleted, [paid.id], before, later).ok).toBe(true);
  });
});
