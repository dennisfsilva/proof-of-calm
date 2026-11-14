// The Kraken ledger reader (docs/DOMAIN.md §3.13, the exchange import; ADR-0056). It turns the rows of a
// ledger export into movements, the purchases, sales and receipts a person can log, and the rows it leaves
// out, each with its reason and lines. "No refusal, left-out row or thrown error holds a cell's text": a
// movement's key is the one place a refid goes, and no txid or balance is kept (D13).
import { compareInstants, type Instant, InstantSchema } from '../../dates/calendar';
import { CurrencyCodeSchema, MINOR_UNITS } from '../../money/currency';
import {
  abs,
  type Decimal,
  decimalPlaces,
  isPositive,
  isZero,
  type Money,
  minus,
  parseDecimal,
  plus,
  product,
  quotient,
  round,
  sum,
  type Units,
} from '../../money/decimal';
import { MAX_UNIT_DECIMALS } from '../../schema/entry';
import { isFiat, type LeftOutReason, type RowKind, readAsset, rowKind } from './kraken-types';

export type ExchangeId = 'kraken' | 'trade-republic';

export type Movement = {
  /** poc-csv-1|kraken|<refid>|<COIN>|<in|out>, or poc-csv-1|trade-republic|<transaction_id>|<COIN>|<in|out> */
  readonly key: string;
  /** The file's lines, the header being line 1. */
  readonly lines: readonly number[];
  readonly at: Instant;
  readonly role: 'purchase' | 'sale' | 'receipt';
  readonly coin: string;
  readonly units: Units;
  readonly unitsCut: boolean;
  readonly currency: string | null;
  readonly amount: Money | null;
  readonly fee: Money | null;
  readonly feeInCoin: boolean;
};

export type LeftOutRow = {
  readonly reason: LeftOutReason;
  readonly lines: readonly number[];
  readonly at: Instant | null;
  readonly coin: string | null;
  readonly units: Units | null;
  readonly column: string | null;
};

export type ExchangeFile = {
  readonly exchange: ExchangeId;
  readonly rows: number;
  readonly first: Instant | null;
  readonly last: Instant | null;
  readonly movements: readonly Movement[];
  readonly leftOut: readonly LeftOutRow[];
  /** The trades a cancellation in the file pairs, each under the key it would have had (Trade Republic only). */
  readonly cancelled: readonly Movement[];
};

// "The reader reads txid, refid, time, type, subtype, asset, amount and fee by header name, in any order, and
// never reads aclass, subclass, wallet, balance or amountusd." Subtype is the one it reads that a file may
// lack; amountusd is in two of K8's ledger headers.
export const LEDGER_COLUMNS = ['txid', 'refid', 'time', 'type', 'subtype', 'aclass', 'subclass', 'asset'].concat([
  'wallet',
  'amount',
  'fee',
  'balance',
  'amountusd',
]);
export const REQUIRED_COLUMNS = ['txid', 'refid', 'time', 'type', 'asset', 'amount', 'fee'] as const;
type Column = (typeof REQUIRED_COLUMNS)[number];

type Leg = { readonly line: number; readonly at: Instant; readonly kind: RowKind; readonly code: string };
type Figures = { readonly amount: Decimal; readonly fee: Decimal };
type Row = {
  readonly line: number;
  readonly failed: boolean;
  readonly signature: string;
  readonly txid: string | null;
  readonly refid: string | null;
  readonly at: Instant | null;
  readonly fault: Column | null;
  readonly leg: (Leg & Figures) | null;
};

// D11: a txid, refid or type that is empty or holds anything outside printable ASCII is unreadable; a row whose
// txid is empty never gets that far, since "A row with an empty txid is a transaction Kraken did not complete
// (K8): it is dropped, counts in rows and in first and last like an identical repeat, and leaves the other rows
// of its refid as they are."
const text = (cell: string) => (/^[\x20-\x7E]+$/u.test(cell) ? cell : null);

// "A time `YYYY-MM-DD HH:MM:SS(.f)` reads as that UTC instant with `Z`"
function readTime(cell: string): Instant | null {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?)$/u.exec(cell);
  const parsed = InstantSchema.safeParse(match === null ? '' : `${match[1]}T${match[2]}Z`);
  return parsed.success ? parsed.data : null;
}

// "Numbers are normalised with `parseDecimal`; a negative zero reads as 0; a fee is its absolute value."
const readNumber = (cell: string) => parseDecimal<Decimal>(/^-0(\.0+)?$/u.test(cell) ? '0' : cell);

function readRow(cells: readonly string[], columns: ReadonlyMap<string, number>, line: number): Row {
  const cell = (name: string) => {
    const index = columns.get(name);
    return index === undefined ? '' : (cells[index] ?? '');
  };
  const [txid, refid, at, type] = [text(cell('txid')), text(cell('refid')), readTime(cell('time')), text(cell('type'))];
  const [asset, amount, fee] = [readAsset(cell('asset')), readNumber(cell('amount')), readNumber(cell('fee'))];
  const read = { txid, refid, time: at, type, asset, amount, fee };
  const fault = REQUIRED_COLUMNS.find((column) => read[column] === null) ?? null;
  const signature = JSON.stringify(['txid', 'refid', 'time', 'type', 'subtype', 'asset', 'amount', 'fee'].map(cell));
  const base = { line, failed: cell('txid') === '', signature, txid, refid, at, fault };
  if (at === null || type === null || asset === null || amount === null || fee === null) return { ...base, leg: null };
  const kind = rowKind(type, cell('subtype'), asset.code, asset.suffixed);
  return { ...base, leg: { line, at, kind, code: asset.code, amount, fee: abs(fee) } };
}

const KEY = 'poc-csv-1|kraken';
const lineOrder = (a: { readonly lines: readonly number[] }, b: { readonly lines: readonly number[] }) =>
  Math.min(...a.lines) - Math.min(...b.lines);
const group = (reason: LeftOutReason, lines: number[], at: Instant | null, column: string | null = null) => ({
  reason,
  lines,
  at,
  coin: null,
  units: null,
  column,
});
// "units over 10 decimals are cut toward zero and flagged"
export const cutUnits = (value: Decimal) => {
  const unitsCut = decimalPlaces(value) > MAX_UNIT_DECIMALS;
  return { units: unitsCut ? round(value as Units, MAX_UNIT_DECIMALS, 'down') : (value as Units), unitsCut };
};

/**
 * "A purchase's units are the coin amount less a fee in the coin, a sale's the coin amount plus it; units over
 * 10 decimals are cut toward zero and flagged." "A purchase's amount is the fiat amount less v, a sale's the fiat
 * amount plus v, and the fee is the fiat fee plus v, where v is the coin fee × fiat amount ÷ coin amount,
 * half-even at the currency's minor unit (`MINOR_UNITS`); a currency outside `MINOR_UNITS` keeps its raw
 * figures, since the plan leaves it out." A movement's `at` is its coin row's.
 */
function trade(refid: string, coin: Leg & Figures, cash: Leg & Figures): Movement | LeftOutRow {
  const purchase = isPositive(coin.amount);
  const [coinAmount, cashAmount] = [abs(coin.amount), abs(cash.amount)];
  const units = cutUnits(purchase ? minus(coinAmount, coin.fee) : plus(coinAmount, coin.fee));
  // Units not above 0 after the cut would make an entry `EntrySchema` refuses, and the write would refuse the file.
  if (!isPositive(units.units))
    return group(
      'unreadable',
      [coin.line, cash.line].toSorted((a, b) => a - b),
      null,
      'amount',
    );
  const currency = CurrencyCodeSchema.safeParse(cash.code);
  const v = currency.success
    ? quotient<Money>(product(coin.fee, cashAmount), coinAmount, MINOR_UNITS[currency.data], 'half-even')
    : ('0' as Money);
  return {
    key: `${KEY}|${refid}|${coin.code}|${purchase ? 'in' : 'out'}`,
    lines: [coin.line, cash.line].toSorted((a, b) => a - b),
    at: coin.at,
    role: purchase ? 'purchase' : 'sale',
    coin: coin.code,
    ...units,
    currency: cash.code,
    amount: (purchase ? minus(cashAmount, v) : plus(cashAmount, v)) as Money,
    fee: plus(cash.fee, v) as Money,
    feeInCoin: !isZero(coin.fee),
  };
}

// A group's time is its earliest row's, so the order of a refid's rows in the file changes nothing.
const earliest = (legs: readonly Leg[]) => legs.map((leg) => leg.at).toSorted(compareInstants)[0] as Instant;
// "a left-out row's units are |amount − fee|", and a receipt's.
const worth = (leg: Figures) => abs(minus(leg.amount, leg.fee));

/**
 * "Rows pair by refid. A trade, or a spend with a receive, of one fiat leg and one coin leg is a purchase when the
 * coin leg is positive and a sale when it is negative; two coin legs are a conversion; two fiat legs are cash; any
 * other number of legs is unpaired."
 */
function pair(refid: string, legs: readonly (Leg & Figures)[]): Movement | LeftOutRow | null {
  if (legs.length === 0) return null;
  const [lines, at] = [legs.map((leg) => leg.line), earliest(legs)];
  const [coin] = legs.filter((leg) => !isFiat(leg.code));
  const [cash] = legs.filter((leg) => isFiat(leg.code));
  if (legs.length === 2 && coin === undefined) return group('cash', lines, at);
  if (legs.length === 2 && cash === undefined) return group('conversion', lines, at);
  if (legs.length !== 2 || coin === undefined || cash === undefined || isZero(coin.amount))
    return group('unpaired', lines, at);
  return trade(refid, coin, cash);
}

/** A row that pairs with no other and is no receipt, left out for its reason. */
const alone = (leg: Leg & Figures): LeftOutRow[] =>
  leg.kind === 'leg' || leg.kind === 'receipt'
    ? []
    : [{ reason: leg.kind, lines: [leg.line], at: leg.at, coin: leg.code, units: worth(leg) as Units, column: null }];

/**
 * "Fills: one entry per refid, coin and direction" (ADR-0056, Corrections, 2026-11-13): a refid's receipts of one
 * coin fold into one receipt under the key `poc-csv-1|kraken|<refid>|<COIN>|in`, every line kept and sorted, at the
 * earliest row's time, its units the sum of |amount − fee|, cut and flagged after the sum. A receipt of the coin
 * the refid's purchase bought would take the purchase's key, so it is left out as unpaired, named by its line.
 */
function receipts(refid: string, legs: readonly (Leg & Figures)[], bought: string | null) {
  const out: (Movement | LeftOutRow)[] = [];
  const coins = new Map<string, (Leg & Figures)[]>();
  for (const leg of legs) {
    if (leg.code === bought) out.push(group('unpaired', [leg.line], leg.at));
    else coins.set(leg.code, [...(coins.get(leg.code) ?? []), leg]);
  }
  for (const [coin, same] of coins) {
    const [lines, units] = [same.map((leg) => leg.line).toSorted((a, b) => a - b), cutUnits(sum(same.map(worth)))];
    if (!isPositive(units.units)) {
      out.push(group('unreadable', lines, null, 'amount'));
      continue;
    }
    out.push({
      key: `${KEY}|${refid}|${coin}|in`,
      lines,
      at: earliest(same),
      role: 'receipt',
      coin,
      ...units,
      currency: null,
      amount: null,
      fee: null,
      feeInCoin: false,
    });
  }
  return out;
}

/** One refid's rows: left out whole for an unreadable cell or a conflicting txid, else read leg by leg. */
function readRefid(refid: string, members: readonly Row[], fault: Column | null): (Movement | LeftOutRow)[] {
  const [lines, legs] = [members.map((row) => row.line), members.flatMap((row) => (row.leg === null ? [] : [row.leg]))];
  // "A row with an unreadable required cell leaves its refid's rows out whole, named by line and column."
  if (fault !== null) return [group('unreadable', lines, null, fault)];
  const paired = pair(
    refid,
    legs.filter((leg) => leg.kind === 'leg'),
  );
  const bought = paired !== null && 'role' in paired && paired.role === 'purchase' ? paired.coin : null;
  const items = [
    ...legs.flatMap(alone),
    ...receipts(
      refid,
      legs.filter((leg) => leg.kind === 'receipt'),
      bought,
    ),
  ];
  return paired === null ? items : [...items, paired];
}

/**
 * "A blank line (one empty cell, or every cell empty) is not a row: the reader skips it, it counts nowhere, and a
 * ledger with only blank lines after its header is `no-rows`." A later row keeps its line in the file.
 */
export const isBlankRow = (cells: readonly string[]) => cells.every((cell) => cell === '');

/** Reads a Kraken ledger's data rows under its header, whose columns `readExchangeFile` has checked. */
export function readKrakenLedger(header: readonly string[], data: readonly (readonly string[])[]): ExchangeFile {
  const columns = new Map(header.map((name, index) => [name, index]));
  const rows = data.flatMap((cells, index) => (isBlankRow(cells) ? [] : [readRow(cells, columns, index + 2)]));
  // "A txid twice with the same cells keeps one; with different cells, both refids are left out."
  const seen = new Map<string, Row>();
  const conflicted = new Set<string | null>();
  const kept = rows.filter((row) => {
    if (row.failed) return false;
    const earlier = row.txid === null ? undefined : seen.get(row.txid);
    if (row.txid !== null && earlier === undefined) seen.set(row.txid, row);
    if (earlier !== undefined && earlier.signature !== row.signature) conflicted.add(earlier.refid).add(row.refid);
    return earlier?.signature !== row.signature;
  });
  const groups = new Map<string, Row[]>();
  const out: (Movement | LeftOutRow)[] = [];
  for (const row of kept) {
    if (row.refid === null) out.push(group('unreadable', [row.line], null, row.fault));
    else groups.set(row.refid, [...(groups.get(row.refid) ?? []), row]);
  }
  for (const [refid, members] of groups) {
    const fault = members.find((row) => row.fault !== null)?.fault ?? (conflicted.has(refid) ? 'txid' : null);
    out.push(...readRefid(refid, members, fault));
  }
  const times = rows.flatMap((row) => (row.at === null ? [] : [row.at])).toSorted(compareInstants);
  const sorted = out.toSorted(lineOrder);
  return {
    exchange: 'kraken',
    rows: rows.length,
    first: times.at(0) ?? null,
    last: times.at(-1) ?? null,
    movements: sorted.filter((item): item is Movement => 'key' in item),
    leftOut: sorted.filter((item): item is LeftOutRow => 'reason' in item),
    cancelled: [],
  };
}
