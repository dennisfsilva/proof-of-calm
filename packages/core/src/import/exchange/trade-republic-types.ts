// The words a Trade Republic row is sorted by: its asset class, category and type (docs/DOMAIN.md §3.13, the exchange
// import; ADR-0056, Corrections). The vendor documents none of them; each is cited beside it by its key among the
// evidence of `docs/research/csv-import-exchanges.md` §5 (#16's evidence comment, its E keys prefixed TR-).
import type { LeftOutReason } from './kraken-types';

const CRYPTO = 'CRYPTO'; // TR-E7: the asset class of every crypto row
const TRADING = 'TRADING'; // TR-E7
const DELIVERY = 'DELIVERY'; // TR-E8f
const CASH = 'CASH'; // TR-E8c
const BUY = 'BUY'; // TR-E7, TR-E8b: one-off buys and savings-plan executions alike
const SELL = 'SELL'; // TR-E7
// TR-E8e names BUY_CANCELLED; SELL_CANCELLED is read alike (ADR-0056, Corrections, 2026-11-13).
const CANCELLED = new Map<string, typeof BUY | typeof SELL>([
  ['BUY_CANCELLED', BUY],
  ['SELL_CANCELLED', SELL],
]);
const FREE_RECEIPT = 'FREE_RECEIPT'; // TR-E8f: staking or coins sent in, not told apart
const FREE_DELIVERY = 'FREE_DELIVERY'; // TR-E8f: coins sent out
const MIGRATION = 'MIGRATION'; // TR-E9: pairs at one instant that cancel out
const SAVEBACK = 'BENEFITS_SAVEBACK'; // TR-E8c

/** What one row is: a trade, a cancellation, a migration, or a reason to leave it out. */
export type TradeRepublicKind =
  | { readonly kind: 'trade' | 'cancel'; readonly side: 'BUY' | 'SELL' }
  | { readonly kind: 'migration' | 'receipt' | 'delivery' }
  | { readonly kind: 'left'; readonly reason: Extract<LeftOutReason, 'benefit' | 'cash' | 'other'> };

/**
 * "Not CRYPTO: category `CASH` with type `BENEFITS_SAVEBACK` is `benefit`; any other `CASH` row is `cash`; any other
 * asset class is `other`." A crypto row of category TRADING is a trade or a cancellation, of DELIVERY a receipt, a
 * delivery or a migration; "Any other crypto row is `other`."
 */
export function tradeRepublicKind(assetClass: string, category: string, type: string): TradeRepublicKind {
  if (assetClass !== CRYPTO) {
    if (category !== CASH) return { kind: 'left', reason: 'other' };
    return { kind: 'left', reason: type === SAVEBACK ? 'benefit' : 'cash' };
  }
  const cancelled = CANCELLED.get(type);
  if (category === TRADING && (type === BUY || type === SELL)) return { kind: 'trade', side: type };
  if (category === TRADING && cancelled !== undefined) return { kind: 'cancel', side: cancelled };
  if (category === DELIVERY && type === FREE_RECEIPT) return { kind: 'receipt' };
  if (category === DELIVERY && type === FREE_DELIVERY) return { kind: 'delivery' };
  if (category === DELIVERY && type === MIGRATION) return { kind: 'migration' };
  return { kind: 'left', reason: 'other' };
}
