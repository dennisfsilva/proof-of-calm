import { DEFAULT_HOLDING_CONTEXT, type DraftSale, type Entry, type HoldingContext } from '@proofofcalm/core';
import { anEntry, aPlan, BTC, date, instant, units } from '@proofofcalm/core/testing';
import { describe, expect, it } from 'vitest';
import { namedWarnings } from './warning';

// DOMAIN §3.7: the entry form's holding warning reads the draft's sales together, as the save stores them.

const plan = aPlan();
const perVenue: HoldingContext = { ...DEFAULT_HOLDING_CONTEXT, lotScope: 'per-venue' };
const day = date('2026-04-01');
const bought = (on: string, venue: string) =>
  anEntry({ kind: 'extra', date: date(on), slot: null, units: units('1'), venue });
const sold = (venue: string, moment: string) =>
  anEntry({ kind: 'sell', date: day, slot: null, units: units('1'), venue, createdAt: instant(moment) });
const draftOf = (sales: readonly Entry[]): DraftSale[] =>
  sales.map(({ id, coin, units, venue, createdAt }) => ({ id, coin, units, venue, createdAt }));
const read = (warnings: ReturnType<typeof namedWarnings>) =>
  warnings.map(({ coin, sold, eligible, venue, at }) => ({ coin, sold, eligible, venue, at }));

describe('namedWarnings', () => {
  // Per venue, FIFO, 365 days: the Bitvavo sale, logged first, has no Bitvavo lot, so the save gives it Ledger's lot
  // past the rule; the Ledger sale then takes Kraken's lot, none of it past the rule.
  const ledger = bought('2024-01-01', 'Ledger');
  const kraken = bought('2026-03-01', 'Kraken');
  const a = sold('Bitvavo', '2026-04-01T09:00:00Z');
  const b = sold('Ledger', '2026-04-01T10:00:00Z');
  const entries = [ledger, kraken, a, b];
  const replaced = [a.id, b.id];

  it('under per-venue lots, warns on a sale whose venue lots another venue’s sale of the edit takes', () => {
    expect(read(namedWarnings(plan, entries, draftOf([a, b]), day, perVenue, replaced))).toEqual([
      { coin: BTC.id, sold: '1', eligible: '0', venue: 'Bitvavo', at: 'venue' },
      { coin: BTC.id, sold: '1', eligible: '0', venue: 'Ledger', at: 'venue' },
    ]);
  });

  it('lists the warnings in draft order, each under its own sale', () => {
    const warnings = namedWarnings(plan, entries, draftOf([b, a]), day, perVenue, replaced);
    expect(warnings.map(({ venue }) => venue)).toEqual(['Ledger', 'Bitvavo']);
  });

  it('names one venue only when a coin warns at two venues or more', () => {
    const solo = namedWarnings(plan, [ledger, kraken, b], draftOf([{ ...b, units: units('1.5') }]), day, perVenue, [
      b.id,
    ]);
    expect(read(solo)).toEqual([{ coin: BTC.id, sold: '1.5', eligible: '1', venue: 'Ledger', at: 'none' }]);
  });

  it('names a sale without a venue apart from one with a venue', () => {
    const unnamed = { ...a, venue: null };
    const warnings = namedWarnings(plan, [ledger, kraken, unnamed, b], draftOf([unnamed, b]), day, perVenue, [
      unnamed.id,
      b.id,
    ]);
    expect(warnings.map(({ venue, at }) => [venue, at])).toEqual([
      [null, 'unnamed'],
      ['Ledger', 'venue'],
    ]);
  });

  it('under global lots, names no venue', () => {
    const warnings = namedWarnings(plan, entries, draftOf([a, b]), day, DEFAULT_HOLDING_CONTEXT, replaced);
    expect(read(warnings)).toEqual([{ coin: BTC.id, sold: '1', eligible: '0', venue: null, at: 'none' }]);
  });
});
