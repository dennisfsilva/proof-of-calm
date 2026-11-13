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
  type Units,
} from '../../money/decimal';
import { MAX_UNIT_DECIMALS } from '../../schema/entry';
import { isFiat, type LeftOutReason, type RowKind, readAsset, rowKind } from './kraken-types';

export type ExchangeId = 'kraken';

export type Movement = {
  /** poc-csv-1|kraken|<refid>|<COIN>|<in|out> */
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
  readonly signature: string;
  readonly txid: string | null;
  readonly refid: string | null;
  readonly at: Instant | null;
  readonly fault: Column | null;
  readonly leg: (Leg & Figures) | null;
};

// D11: a txid, refid or type that is empty or holds anything outside printable ASCII is unreadable.
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
  const base = { line, signature, txid, refid, at, fault };
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
const units = (value: Decimal) => {
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
function trade(refid: string, coin: Leg & Figures, cash: Leg & Figures): Movement {
  const purchase = isPositive(coin.amount);
  const [coinAmount, cashAmount] = [abs(coin.amount), abs(cash.amount)];
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
    ...units(purchase ? minus(coinAmount, coin.fee) : plus(coinAmount, coin.fee)),
    currency: cash.code,
    amount: (purchase ? minus(cashAmount, v) : plus(cashAmount, v)) as Money,
    fee: plus(cash.fee, v) as Money,
    feeInCoin: !isZero(coin.fee),
  };
}

/**
 * "Rows pair by refid. A trade, or a spend with a receive, of one fiat leg and one coin leg is a purchase when the
 * coin leg is positive and a sale when it is negative; two coin legs are a conversion; two fiat legs are cash; any
 * other number of legs is unpaired."
 */
function pair(refid: string, legs: readonly (Leg & Figures)[]): Movement | LeftOutRow | null {
  const [first] = legs;
  if (first === undefined) return null;
  const lines = legs.map((leg) => leg.line);
  const [coin] = legs.filter((leg) => !isFiat(leg.code));
  const [cash] = legs.filter((leg) => isFiat(leg.code));
  if (legs.length === 2 && coin === undefined) return group('cash', lines, first.at);
  if (legs.length === 2 && cash === undefined) return group('conversion', lines, first.at);
  if (legs.length !== 2 || coin === undefined || cash === undefined || isZero(coin.amount))
    return group('unpaired', lines, first.at);
  return trade(refid, coin, cash);
}

/** A row that pairs with no other: a receipt, or a row left out for its reason. */
function single(refid: string, leg: Leg & Figures): Movement | LeftOutRow {
  const value = abs(minus(leg.amount, leg.fee));
  if (leg.kind !== 'receipt' && leg.kind !== 'leg') {
    return { reason: leg.kind, lines: [leg.line], at: leg.at, coin: leg.code, units: value as Units, column: null };
  }
  const [key, lines, nothing] = [
    `${KEY}|${refid}|${leg.code}|in`,
    [leg.line],
    { currency: null, amount: null, fee: null },
  ];
  return { key, lines, at: leg.at, role: 'receipt', coin: leg.code, ...units(value), ...nothing, feeInCoin: false };
}

/** Reads a Kraken ledger's data rows under its header, whose columns `readExchangeFile` has checked. */
export function readKrakenLedger(header: readonly string[], data: readonly (readonly string[])[]): ExchangeFile {
  const columns = new Map(header.map((name, index) => [name, index]));
  const rows = data.map((cells, index) => readRow(cells, columns, index + 2));
  // "A txid twice with the same cells keeps one; with different cells, both refids are left out."
  const seen = new Map<string, Row>();
  const conflicted = new Set<string | null>();
  const kept = rows.filter((row) => {
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
    // "A row with an unreadable required cell leaves its refid's rows out whole, named by line and column."
    const fault = members.find((row) => row.fault !== null)?.fault ?? (conflicted.has(refid) ? 'txid' : null);
    const legs = members.flatMap((row) => (row.leg === null ? [] : [row.leg]));
    if (fault !== null)
      out.push(
        group(
          'unreadable',
          members.map((row) => row.line),
          null,
          fault,
        ),
      );
    else out.push(...legs.filter((leg) => leg.kind !== 'leg').map((leg) => single(refid, leg)));
    const paired =
      fault === null
        ? pair(
            refid,
            legs.filter((leg) => leg.kind === 'leg'),
          )
        : null;
    if (paired !== null) out.push(paired);
  }
  const times = rows.flatMap((row) => (row.at === null ? [] : [row.at])).toSorted(compareInstants);
  const sorted = out.toSorted(lineOrder);
  return {
    exchange: 'kraken',
    rows: data.length,
    first: times.at(0) ?? null,
    last: times.at(-1) ?? null,
    movements: sorted.filter((item): item is Movement => 'key' in item),
    leftOut: sorted.filter((item): item is LeftOutRow => 'reason' in item),
  };
}
