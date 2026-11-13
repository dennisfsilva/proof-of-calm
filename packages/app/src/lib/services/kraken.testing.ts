import type { EntityId, Entry, Instant } from '@proofofcalm/core';
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

/**
 * A ledger of rows the import leaves out, one of each reason, and a BTC purchase 5 days after the fixture plan's
 * first buy day, which its starting amount leaves out over a Log with no April entry.
 */
export const KRAKEN_LEFT_OUT = krakenLedger([
  ['DQ9ZZZ-SYNTH-000101', '2026-04-01 08:00:00', 'deposit', 'EUR', '500.0000', '0.0000'],
  ['TQ9ZZZ-SYNTH-000102', '2026-04-10 09:00:00', 'trade', 'EUR', '-40.0000', '0.1000'],
  ['TQ9ZZZ-SYNTH-000102', '2026-04-10 09:00:00', 'trade', 'BTC', '0.0006000000', '0.0000000000'],
  ['TQ9ZZZ-SYNTH-000103', '2026-10-02 09:00:00', 'trade', 'USD', '-40.0000', '0.1000'],
  ['TQ9ZZZ-SYNTH-000103', '2026-10-02 09:00:00', 'trade', 'BTC', '0.0006000000', '0.0000000000'],
  ['TQ9ZZZ-SYNTH-000104', '2026-10-03 09:00:00', 'trade', 'EUR', '-20.0000', '0.0500'],
  ['TQ9ZZZ-SYNTH-000104', '2026-10-03 09:00:00', 'trade', 'XRP', '30.0000000000', '0.0000000000'],
  ['RQ9ZZZ-SYNTH-000105', '2026-10-04 00:00:00', 'staking', 'ETH', '0.0001000000', '0.0000000000'],
  ['DQ9ZZZ-SYNTH-000106', '2026-10-06 08:00:00', 'deposit', 'BTC', '0.0100000000', '0.0000000000'],
  ['WQ9ZZZ-SYNTH-000107', '2026-10-07 08:00:00', 'withdrawal', 'BTC', '-0.0050000000', '0.0000200000'],
  ['TQ9ZZZ-SYNTH-000108', '2026-10-08 08:00:00', 'transfer', 'ETH', '0.0100000000', '0.0000000000'],
  ['TQ9ZZZ-SYNTH-000109', '2026-10-09 09:00:00', 'trade', 'BTC', '-0.0001000000', '0.0000000000'],
  ['TQ9ZZZ-SYNTH-000109', '2026-10-09 09:00:00', 'trade', 'ETH', '0.0030000000', '0.0000000000'],
  ['TQ9ZZZ-SYNTH-000110', '2026-10-10 09:00:00', 'trade', 'EUR', '-10.0000', '0.0300'],
  ['TQ9ZZZ-SYNTH-000110', '2026-10-10 09:00:00', 'trade', 'BTC', '0.0001000000', '0.0000000000'],
  ['TQ9ZZZ-SYNTH-000110', '2026-10-10 09:00:00', 'trade', 'ETH', '0.0010000000', '0.0000000000'],
  ['MQ9ZZZ-SYNTH-000111', '2026-10-11 09:00:00', 'margin', 'BTC', '0.0001000000', '0.0000000000'],
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
