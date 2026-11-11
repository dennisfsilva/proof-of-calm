import { describe, expect, it } from 'vitest';
import { aMove, anEntry, BTC, date, ETH, id, units } from '../../test/builders';
import { moveShortfallOf } from '../actions/moves';
import type { LotRule, LotScope } from '../schema/country';
import type { Entry } from '../schema/entry';
import { moveShortfalls } from './move-shortfalls';

// docs/DOMAIN.md §3.7: the stored moves that send more than the Log finds outside their destination at their place in
// the matching order. Per-venue lots list each one whose `short` is above 0; global lots only those whose fee lost its
// cover outside the destination (`feeAtDestination + feeUncovered` above 0; research Q5).
const buy = (day: string, quantity: string, venue: string | null, coin = BTC.id) =>
  anEntry({ kind: 'extra', slot: null, coin, date: date(day), units: units(quantity), venue });
const move = (day: string, sent: string, received: string, from: string | null = 'Kraken', to = 'Ledger') =>
  aMove({ coin: BTC.id, date: date(day), units: units(sent), received: units(received), venue: from, to });
const context = (lotScope: LotScope, lotRule: LotRule = 'fifo') => ({ overrides: [], lotScope, lotRule });
const listed = (entries: readonly Entry[], lotScope: LotScope, lotRule: LotRule = 'fifo') =>
  moveShortfalls(entries, BTC.id, context(lotScope, lotRule));

describe('moveShortfalls (docs/DOMAIN.md §3.7)', () => {
  it('moveShortfalls lists a move per venue when it sends more than the units outside its destination, and under global lots only when its fee lost its cover outside it', () => {
    // The e2e seed (apps/web/e2e/move.spec.ts): 0.02215 BTC with no venue, 0.08 BTC at Kraken, all of it moved to
    // Ledger on 1 Sep 2026 before the move of 0.05 BTC on 14 Oct 2026.
    const unnamed = [
      buy('2026-04-05', '0.0125', null),
      ...['04', '05', '06', '08', '09'].map((month) => buy(`2026-${month}-05`, '0.00121', null)),
      buy('2026-06-18', '0.0036', null),
    ];
    const october = move('2026-10-14', '0.05', '0.0498');
    const entries = [...unnamed, buy('2026-06-18', '0.08', 'Kraken'), october, move('2026-09-01', '0.08', '0.08')];
    expect(listed(entries, 'per-venue')).toEqual([
      {
        id: october.id,
        coin: BTC.id,
        date: '2026-10-14',
        from: 'Kraken',
        to: 'Ledger',
        sent: '0.05',
        outside: '0.02215',
        short: '0.02785',
        feeAtDestination: '0',
        feeUncovered: '0',
      },
    ]);
    // The fee and part of the units received are covered outside Ledger: no line under global lots.
    expect(listed(entries, 'global')).toEqual([]);

    // Part of the fee taken at Ledger: listed in every country.
    const atLedger = move('2026-03-01', '0.01', '0.0099');
    const fee = [buy('2026-01-10', '0.10', 'Ledger'), atLedger];
    for (const scope of ['per-venue', 'global'] as const) {
      expect(listed(fee, scope)).toEqual([
        expect.objectContaining({ id: atLedger.id, outside: '0', short: '0.01', feeAtDestination: '0.0001' }),
      ]);
    }

    // Nothing of the coin covers the fee: listed in every country; a move of another coin is not.
    const alone = move('2026-03-01', '0.01', '0.0099');
    for (const scope of ['per-venue', 'global'] as const) {
      expect(listed([buy('2026-01-10', '1', null, ETH.id), alone], scope)).toEqual([
        expect.objectContaining({ id: alone.id, outside: '0', short: '0.01', feeUncovered: '0.0001' }),
      ]);
    }

    // Every unit sent found outside Ledger: no line anywhere.
    const covered = [buy('2026-01-10', '0.10', 'Kraken'), move('2026-03-01', '0.05', '0.0498')];
    expect([...listed(covered, 'per-venue'), ...listed(covered, 'global')]).toEqual([]);
  });

  it('reads the matching under the country lot rule: LIFO leaves the Kraken lot to the move that FIFO sold', () => {
    // A sale with no venue under global lots takes the Kraken lot first under FIFO, the later Ledger lot under LIFO.
    const april = move('2026-04-01', '0.05', '0.0499');
    const entries = [
      buy('2026-01-10', '0.05', 'Kraken'),
      buy('2026-02-10', '0.05', 'Ledger'),
      anEntry({ kind: 'sell', slot: null, date: date('2026-03-10'), units: units('0.05'), venue: null }),
      april,
    ];
    expect(listed(entries, 'global', 'fifo')).toEqual([
      expect.objectContaining({ id: april.id, outside: '0', short: '0.05', feeAtDestination: '0.0001' }),
    ]);
    expect(listed(entries, 'global', 'lifo')).toEqual([]);
  });

  it("reads outside as the units the Log holds at each venue but the destination at the move's place, as the move form's source cards show", () => {
    // Global FIFO sells the Kraken lot, but the sale at Ledger leaves 1 BTC at Kraken: the move of 0.5 finds 0.5 there,
    // and its fee comes from the Ledger lot left. No figure would be wrong, so no line shows.
    const sale = anEntry({ kind: 'sell', slot: null, date: date('2026-03-10'), units: units('1'), venue: 'Ledger' });
    const sold = [buy('2026-01-10', '1', 'Kraken'), buy('2026-02-10', '1', 'Ledger'), sale];
    const april = move('2026-04-01', '0.5', '0.4999');
    for (const lotScope of ['per-venue', 'global'] as const) {
      expect(listed([...sold, april], lotScope)).toEqual([]);
      expect(moveShortfallOf(sold, april, context(lotScope))).toBeNull();
    }

    // Global FIFO sells the Kraken lot of 0.2 for a sale at Ledger, which leaves 0.2 at Kraken: the move of 0.5 is short
    // outside Ledger and its fee is taken at Ledger, so it is listed under global lots with the per-venue figures.
    const thin = move('2026-04-01', '0.5', '0.4999');
    const atLedger = { ...sale, id: id(), units: units('0.2') };
    const ledger = [buy('2026-01-10', '0.2', 'Kraken'), buy('2026-02-10', '1', 'Ledger'), atLedger];
    expect(moveShortfallOf(ledger, thin, context('global'))).toEqual(
      expect.objectContaining({ outside: '0.2', short: '0.3', feeAtDestination: '0.0001', feeUncovered: '0' }),
    );

    // A sale imported at Bitvavo, which holds none, takes the Kraken lot: Bitvavo counts 0, never below.
    const imported = anEntry({
      kind: 'sell',
      slot: null,
      date: date('2026-02-01'),
      units: units('0.08'),
      venue: 'Bitvavo',
    });
    const short = move('2026-03-01', '0.04', '0.0399');
    const entries = [buy('2026-01-10', '0.05', 'Kraken'), imported, buy('2026-02-10', '0.02', 'Kraken'), short];
    expect(listed(entries, 'per-venue')).toEqual([expect.objectContaining({ outside: '0.02', short: '0.02' })]);
  });
});
