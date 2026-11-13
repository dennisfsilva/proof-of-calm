import type { Entry, EntityId, Instant } from '@proofofcalm/core';
import { fixtureSnapshot } from './fixtures';

// A synthetic Kraken ledger (ADR-0056: every id and figure invented) for fixtureSnapshot's plan seen at
// fixtureNowMs('buy'), 2026-10-20: October's BTC and ETH monthly buys on the 5th, an extra BTC buy, an ETH sale and
// coins added at no cost (an invite bonus). With `ONE_TAP_OCTOBER` stored, the BTC buy replaces that estimate.

type Row = readonly [refid: string, time: string, type: string, asset: string, amount: string, fee: string];

const HEADER = '"txid","refid","time","type","subtype","aclass","subclass","asset","wallet","amount","fee","balance"';

/** A ledger of the given rows, numbered by txid, with the columns the reader never reads filled in. */
export function krakenLedger(rows: readonly Row[]): string {
  const lines = rows.map(([refid, time, type, asset, amount, fee], index) => {
    const txid = `LQ9ZZZ-SYNTH-${String(index + 1).padStart(6, '0')}`;
    const subclass = asset === 'EUR' ? 'fiat' : 'crypto';
    const cells = [txid, refid, time, type, '', 'currency', subclass, asset, 'spot / main', amount, fee, '0'];
    return cells.map((cell) => `"${cell}"`).join(',');
  });
  return [HEADER, ...lines].join('\n');
}

export const KRAKEN_OCTOBER = krakenLedger([
  ['TQ9ZZZ-SYNTH-000001', '2026-10-05 09:00:00', 'trade', 'EUR', '-70.0000', '0.1800'],
  ['TQ9ZZZ-SYNTH-000001', '2026-10-05 09:00:00', 'trade', 'BTC', '0.0012000000', '0.0000000000'],
  ['TQ9ZZZ-SYNTH-000002', '2026-10-05 09:05:00', 'trade', 'EUR', '-30.0000', '0.0800'],
  ['TQ9ZZZ-SYNTH-000002', '2026-10-05 09:05:00', 'trade', 'ETH', '0.0120000000', '0.0000000000'],
  ['TQ9ZZZ-SYNTH-000003', '2026-10-12 12:00:00', 'trade', 'EUR', '-50.0000', '0.1300'],
  ['TQ9ZZZ-SYNTH-000003', '2026-10-12 12:00:00', 'trade', 'BTC', '0.0008000000', '0.0000000000'],
  ['TQ9ZZZ-SYNTH-000004', '2026-10-15 15:00:00', 'trade', 'ETH', '-0.0100000000', '0.0000000000'],
  ['TQ9ZZZ-SYNTH-000004', '2026-10-15 15:00:00', 'trade', 'EUR', '25.0000', '0.0700'],
  ['BQ9ZZZ-SYNTH-000005', '2026-10-16 00:00:00', 'invite bonus', 'BTC', '0.0000500000', '0.0000000000'],
]);

/** A one tap of October's BTC buy, dated the day after its due date, at another venue. */
export const ONE_TAP_OCTOBER: Entry = {
  ...(fixtureSnapshot().entries.find((entry) => entry.kind === 'dca' && entry.coin === 'BTC') as Entry),
  id: 'aaaaaaaa-0000-4000-8000-000000000010' as EntityId,
  date: '2026-10-06' as Entry['date'],
  slot: '2026-10' as Entry['slot'],
  units: '0.00119' as Entry['units'],
  note: 'tapped',
  venue: 'Bitvavo',
  source: 'one-tap',
  createdAt: '2026-10-06T08:00:00.000Z' as Instant,
  updatedAt: '2026-10-06T08:00:00.000Z' as Instant,
};
