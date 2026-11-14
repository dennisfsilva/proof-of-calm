// What both synthetic Kraken fold ledgers read as (docs/DOMAIN.md §3.13, the exchange import; ADR-0056,
// Corrections, 2026-11-13), worked out by hand from their rows. The two files hold the same rows under the two
// headers (the December 2025 header, K7; the legacy header without subclass and wallet, K8): the legacy file names
// XXBT and ZEUR where the December 2025 file names BTC and EUR, so they read the same. Every txid, refid, time and
// figure is invented. Line numbers count the header as line 1. The receipts of one refid and coin fold into one,
// their units summed; a receipt of the coin its refid's purchase bought would share the purchase's key.
import type { ExchangeFile } from '../../src/import/exchange/kraken';
import { instant, money, units } from '../builders';

const key = (refid: string, coin: string) => `poc-csv-1|kraken|${refid}|${coin}|in`;

export const KRAKEN_SYNTHETIC_FOLD: ExchangeFile = {
  exchange: 'kraken',
  // Lines 2 to 6.
  rows: 5,
  // Line 3's time, the earliest; line 6's, the latest.
  first: instant('2025-12-29T08:00:00Z'),
  last: instant('2025-12-30T10:00:01Z'),
  movements: [
    // Lines 2 and 3: two invite bonus rows of BTC under one refid, 0.00003 at 09:00 and 0.00002 at 08:00, each
    // fee 0: one receipt, both lines, the earlier time, units 0.00003 + 0.00002 = 0.00005.
    {
      key: key('BQ1AAA-SYNTH-000030', 'BTC'),
      lines: [2, 3],
      at: instant('2025-12-29T08:00:00Z'),
      role: 'receipt',
      coin: 'BTC',
      units: units('0.00005'),
      unitsCut: false,
      currency: null,
      amount: null,
      fee: null,
      feeInCoin: false,
    },
    // Lines 4 and 5: EUR −20.0000 fee 0.0500; BTC 0.0002000000 fee 0. units 0.0002; amount 20; fee 0.05.
    {
      key: key('TQ1AAA-SYNTH-000031', 'BTC'),
      lines: [4, 5],
      at: instant('2025-12-30T10:00:00Z'),
      role: 'purchase',
      coin: 'BTC',
      units: units('0.0002'),
      unitsCut: false,
      currency: 'EUR',
      amount: money('20'),
      fee: money('0.05'),
      feeInCoin: false,
    },
  ],
  // Line 6: an invite bonus of BTC under the refid of lines 4 and 5, which bought BTC: unpaired, by its line.
  leftOut: [
    { reason: 'unpaired', lines: [6], at: instant('2025-12-30T10:00:01Z'), coin: null, units: null, column: null },
  ],
  cancelled: [],
};
