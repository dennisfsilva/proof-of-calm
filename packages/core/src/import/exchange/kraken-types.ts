// The words a Kraken ledger row is sorted by: its type and subtype, and its asset code (docs/DOMAIN.md
// §3.13, the exchange import). The K keys are the sources ADR-0056 cites;
// each word and code is trimmed to what the source cited beside it holds.

/** The reason a row is left out of the import (docs/DOMAIN.md §3.13). */
export type LeftOutReason =
  | 'reward'
  | 'coin-deposit'
  | 'coin-withdrawal'
  | 'cash'
  | 'within'
  | 'conversion'
  | 'unpaired'
  | 'unreadable'
  | 'other';

/** What one readable row is: a leg of a trade to pair by refid, a receipt, or a reason to leave it out. */
export type RowKind = 'leg' | 'receipt' | LeftOutReason;

// "Legacy codes normalise as K1, K6 or K8 list them (XXBT and XBT to BTC, XETH to ETH, XXDG and XDG to
// DOGE, ZEUR to EUR, …), each cited beside its line."
const LEGACY = new Map<string, string>([
  ['XXBT', 'BTC'], // K8: XXBT to XBT, then XBT to BTC
  ['XBT', 'BTC'], // K8
  ['XETC', 'ETC'], // K8
  ['XETH', 'ETH'], // K8
  ['XLTC', 'LTC'], // K8
  ['XMLN', 'MLN'], // K8
  ['XREP', 'REP'], // K8
  // XXDG to XDG (K8), and XDG to DOGE: Kraken's "Bitcoin Currency Code: XBT vs BTC", updated 2026-11-02,
  // https://support.kraken.com/articles/360001206766-bitcoin-currency-code-xbt-vs-btc
  ['XXDG', 'DOGE'],
  ['XDG', 'DOGE'],
  ['XXLM', 'XLM'], // K8
  ['XXMR', 'XMR'], // K8
  ['XXRP', 'XRP'], // K8
  ['XZEC', 'ZEC'], // K8
  // K8: every Z-prefixed fiat code to its plain code.
  ...['ARS', 'AUD', 'CAD', 'CLP', 'COP', 'DKK', 'EUR', 'GBP', 'GEL', 'GHS', 'JPY', 'LKR', 'MXN', 'PLN', 'SEK']
    .concat(['UGX', 'USD', 'VND', 'XOF'])
    .map((code): [string, string] => [`Z${code}`, code]),
]);

// "Fiat is every code K8 lists as fiat (EUR, USD, GBP, CHF, CAD, JPY and AUD among them), after
// normalisation."
// K8: the plain codes of its Z-prefixed fiat codes, and CHF from its quote assets.
const FIAT = new Set<string>([
  ...[...LEGACY.entries()].filter(([from]) => from.startsWith('Z')).map(([, to]) => to),
  'CHF',
]);

/** Whether a normalised code is fiat. */
export function isFiat(code: string): boolean {
  return FIAT.has(code);
}

const ASSET = /^([A-Z0-9]{1,16})(\.[A-Z0-9]{1,8})?$/u;

/**
 * A ledger asset code, normalised: "A code with a dot suffix (.S, .M, .P, .F, .B) is a balance within Kraken
 * of the code before the dot." (.S, .M and .P from K8, .F from K6; any other suffix reads the same.) Null for a
 * cell that is no code.
 */
export function readAsset(cell: string): { readonly code: string; readonly suffixed: boolean } | null {
  const match = ASSET.exec(cell);
  if (match?.[1] === undefined) return null;
  return { code: LEGACY.get(match[1]) ?? match[1], suffixed: match[2] !== undefined };
}

// "Each type and subtype word comes from K1 or K6, cited beside it."
const TRADE_TYPES = new Set(['trade', 'spend', 'receive']); // K1, K6
const STAKING = 'staking'; // K1, K6
const EARN = 'earn'; // K1
const REWARD = 'reward'; // K1: a subtype of earn
const BONUS = 'invite bonus'; // K1
const TRANSFER = 'transfer'; // K1, K6
const DEPOSIT = 'deposit'; // K1, K6
const WITHDRAWAL = 'withdrawal'; // K1, K6
const KFEE = 'KFEE'; // K1: fee credits, shown as a deposit

/**
 * "The bonus rows K1 documents are receipts for a coin; staking, and earn with the reward subtype, are rewards;
 * other earn subtypes, transfer, suffixed and KFEE rows are within Kraken; a deposit or withdrawal is cash for
 * fiat and a coin deposit or withdrawal for a coin; every other type is other." A bonus in fiat is cash, since
 * an entry's coin is never a currency.
 */
export function rowKind(type: string, subtype: string, code: string, suffixed: boolean): RowKind {
  if (type === STAKING || (type === EARN && subtype === REWARD)) return 'reward';
  if (suffixed || code === KFEE) return 'within';
  if (TRADE_TYPES.has(type)) return 'leg';
  if (type === BONUS) return isFiat(code) ? 'cash' : 'receipt';
  if (type === EARN || type === TRANSFER) return 'within';
  if (type === DEPOSIT) return isFiat(code) ? 'cash' : 'coin-deposit';
  if (type === WITHDRAWAL) return isFiat(code) ? 'cash' : 'coin-withdrawal';
  return 'other';
}
