import type { ExchangeFile } from '../../src/import/exchange/kraken';
import type { CoinId } from '../../src/schema/ids';
import { anEntry, aPlan, date, money, units } from '../builders';
import { fileOf, type World } from './plan-arbitraries';
import { testId, trade } from './plan-fixture';
import type { LumpCut } from './plan-late';

// The import properties' `examples`: reduced worlds of the fast-check seeds that failed them on main a9ca28db, built
// from the builders so a change to the generators never moves them (docs/DOMAIN.md §3.13 steps 2 and 5).

const bought = (refid: string, coin: string, day: string, figures: [string, string], line: number) =>
  trade(refid, 'purchase', coin, day, { units: figures[0], amount: figures[1], fee: '0' }, line);
const kraken = (plan: World['plan'], entries: World['entries'], file: ExchangeFile): World => ({
  plan,
  entries,
  file,
  addHeld: false,
  venue: 'Kraken',
});
type Window = { shape: 'prefix' | 'suffix' | 'middle'; byDay: boolean; from: number; to: number };

/**
 * Seed 93 (run 203): a window from 13 Dec 2025 has no F before another import's Coins added entry of 11 Dec, so it
 * counts that entry and stores the 6 Mar sale the whole file, buying ETH on 10 Dec, leaves out (`coverCut`).
 */
export const WINDOW_93: [World, Window] = [
  kraken(
    aPlan({ firstBuy: date('2026-03-15'), startingAmount: money('500') }),
    [
      anEntry({
        id: testId('other|held'),
        kind: 'held',
        slot: null,
        coin: 'ETH' as CoinId,
        date: date('2025-12-11'),
        units: units('0.50046'),
        amount: null,
        venue: 'Ledger',
        source: 'import-csv',
      }),
    ],
    fileOf([
      bought('S93-1', 'ETH', '2025-12-10', ['0.35874', '940.50'], 2),
      bought('S93-2', 'ETH', '2025-12-13', ['0.19969', '882.50'], 4),
      trade('S93-3', 'sale', 'ETH', '2026-03-06T23:30:00Z', { units: '0.50046', amount: '136.50', fee: '0' }, 6),
    ]),
  ),
  { shape: 'suffix', byDay: true, from: 1, to: 1 },
];

// The base lumps keep id()'s ids: they sort before `testId('cut-lump|…')`, the cut's lump, and a `testId` id would
// reorder the claims so the example no longer fails.

/**
 * Seed 46 (run 305): two live one-tap lumps of ETH on 1 Oct 2026; the export from 1 Oct's second fill leaves the cut
 * date's part to the second lump, so a date past the cut date is doubled above the part.
 */
export const CUT_46: [World, LumpCut] = [
  kraken(
    aPlan({ firstBuy: date('2026-03-01'), startingAmount: money('500') }),
    [
      anEntry({
        kind: 'lump',
        slot: null,
        coin: 'ETH' as CoinId,
        date: date('2026-10-01'),
        units: units('0.001'),
        amount: money('173.50'),
        source: 'one-tap',
      }),
    ],
    fileOf([]),
  ),
  {
    slot: 2130706428,
    coin: 'ETH' as CoinId,
    dayOff: 0,
    tapOff: 0,
    size: 'above',
    times: 3,
    fills: [
      { of: 'lump', tenths: 1 },
      { of: 'lump', tenths: 8 },
    ],
    others: [{ off: 1, share: { of: 'lump', tenths: 6 } }],
    side: 'begins',
    from: 0,
    to: 0,
    source: 'one-tap',
  },
];

/**
 * Seed 212 (run 113): a hand lump of 1,000 and a one-tap lump of BTC on 2 Jun 2026; the export from 31 May's second
 * fill stores 31 May's 252, which stops the second lump's walk before 4 Jun, so 4 Jun is doubled above the part.
 */
export const CUT_212: [World, LumpCut] = [
  kraken(
    aPlan({ firstBuy: date('2026-03-01') }),
    [
      anEntry({
        kind: 'lump',
        slot: null,
        coin: 'BTC' as CoinId,
        date: date('2026-06-02'),
        units: units('0.001'),
        amount: money('1000'),
        source: 'manual',
      }),
    ],
    fileOf([
      bought('S212-1', 'BTC', '2026-06-01', ['0.78788', '314'], 2),
      bought('S212-2', 'BTC', '2026-06-02', ['0.95066', '162.50'], 4),
      bought('S212-3', 'BTC', '2026-06-04', ['0.83575', '175.50'], 6),
    ]),
  ),
  {
    slot: 1107276977,
    coin: 'BTC' as CoinId,
    dayOff: -1,
    tapOff: 2,
    size: 'above',
    times: 4,
    fills: [
      { of: 'lump', tenths: 1 },
      { of: 'lump', tenths: 5 },
    ],
    others: [{ off: 0, share: { of: 'lump', tenths: 4 } }],
    side: 'begins',
    from: 0,
    to: 0,
    source: 'one-tap',
  },
];
