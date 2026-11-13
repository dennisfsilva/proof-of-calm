// The Trade Republic reader (docs/DOMAIN.md §3.13, the exchange import; ADR-0056, Corrections, 2026-11-13). It turns
// the rows of a transaction export into the movements and left-out rows Kraken's reader gives, and reads only
// `TR_READ`: never a name, a description, an IBAN or any other personal column. A movement's key is the one place a
// transaction_id goes. Not yet recognised by `readExchangeFile`, so no screen names a format it cannot word.
import { compareInstants, type Instant, InstantSchema } from '../../dates/calendar';
import {
  abs,
  compare,
  type Decimal,
  isPositive,
  isZero,
  type Money,
  parseDecimal,
  sum,
  type Units,
} from '../../money/decimal';
import { cutUnits, type ExchangeFile, isBlankRow, type LeftOutRow, type Movement } from './kraken';
import { coinCode, type LeftOutReason } from './kraken-types';
import { tradeRepublicKind } from './trade-republic-types';

/** The 23 columns of the export (TR-E1), English whatever the app's language. */
export const TR_COLUMNS = ['datetime', 'date', 'account_type', 'category', 'type', 'asset_class', 'name', 'symbol']
  .concat(['shares', 'price', 'amount', 'fee', 'tax', 'currency', 'original_amount', 'original_currency', 'fx_rate'])
  .concat(['description', 'transaction_id', 'counterparty_name', 'counterparty_iban', 'payment_reference', 'mcc_code']);
/** The columns the reader reads by header name; a header without one of them is `missing-columns`. */
export const TR_READ = [
  'datetime',
  'category',
  'type',
  'asset_class',
  'symbol',
  'shares',
  'amount',
  'fee',
  'tax',
  'currency',
  'transaction_id',
] as const;
type Column = (typeof TR_READ)[number];

type Base = { readonly line: number; readonly at: Instant; readonly coin: string; readonly shares: Decimal };
type Trade = Base & {
  readonly side: 'BUY' | 'SELL';
  readonly id: string;
  readonly amount: Decimal;
  readonly fee: Decimal;
  readonly currency: string;
};
type Cancel = Base & { readonly side: 'BUY' | 'SELL'; readonly amount: Decimal };
type Item =
  | { readonly is: 'trade'; readonly trade: Trade }
  | { readonly is: 'cancel'; readonly cancel: Cancel }
  | { readonly is: 'migration'; readonly migration: Base }
  | { readonly is: 'left'; readonly left: LeftOutRow };
type Row = {
  readonly line: number;
  readonly signature: string;
  readonly id: string | null;
  readonly at: Instant | null;
};

// Rule 2: "`YYYY-MM-DDTHH:MM:SS`, an optional fraction of 1 to 6 digits, then `Z`" (TR-E3).
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/u;
// Rule 3: "an optional `-`, digits, an optional `.digits`; no `+`, exponent, thousands or comma" (TR-E4).
const NUMBER = /^-?\d+(?:\.\d+)?$/u;
// Rule 4: "1 to 64 printable ASCII characters (a UUID in every source)" (TR-E11).
const ID = /^[\x20-\x7E]{1,64}$/u;
// Rule 9: "a ticker of 2 to 10 capital letters or digits" (TR-E7); XF0RENDER015 is no ticker.
const TICKER = /^[A-Z0-9]{2,10}$/u;
const CURRENCY = /^[A-Z]{3}$/u;

const instantOf = (cell: string) => {
  const parsed = InstantSchema.safeParse(DATETIME.test(cell) ? cell : '');
  return parsed.success ? parsed.data : null;
};
const numberOf = (cell: string) => (NUMBER.test(cell) ? parseDecimal<Decimal>(cell) : null);
/** −1, 0 or 1; null for no number. */
const signOf = (value: Decimal | null) => (value === null ? null : isZero(value) ? 0 : isPositive(value) ? 1 : -1);
const left = (reason: LeftOutReason, lines: number[], at: Instant | null, column: Column | null = null) => ({
  reason,
  lines,
  at,
  coin: null,
  units: null,
  column,
});
const order = (
  a: { readonly at: Instant; readonly line: number },
  b: { readonly at: Instant; readonly line: number },
) => compareInstants(a.at, b.at) || a.line - b.line;
/** By the moment named, then by the text, so one moment written two ways sorts the same in any file order. */
const byMoment = (a: Instant, b: Instant) => compareInstants(a, b) || Number(a > b) - Number(a < b);

/** One row's item, or the first of its read columns, in `TR_READ` order, that it cannot read. */
function itemOf(cell: (column: Column) => string, line: number, at: Instant | null, id: string | null): Item | Column {
  const kind = tradeRepublicKind(cell('asset_class'), cell('category'), cell('type'));
  const coin = TICKER.test(cell('symbol')) ? coinCode(cell('symbol')) : null;
  const shares = numberOf(cell('shares'));
  const amount = numberOf(cell('amount'));
  const [fee, tax] = [numberOf(cell('fee') || '0'), numberOf(cell('tax') || '0')];
  // Rule 5: a purchase's shares are above 0 and its amount below; a sale's the other way round. Shares that cut to 0
  // units (below 1e-10) would make an entry of 0 units, which the write refuses with the whole file.
  const side = kind.kind === 'trade' ? (kind.side === 'BUY' ? 1 : -1) : null;
  const want = kind.kind === 'receipt' ? 1 : kind.kind === 'delivery' ? -1 : side;
  const cut = shares === null ? null : cutUnits(shares).units;
  const checks: [Column, boolean][] = [
    ['datetime', at !== null],
    ['symbol', kind.kind === 'left' || coin !== null],
    ['shares', kind.kind === 'left' || (shares !== null && (want === null || signOf(cut) === want))],
    ['amount', side === null ? kind.kind !== 'cancel' || amount !== null : signOf(amount) === -side],
    ['fee', side === null || fee !== null],
    ['tax', side === null || (tax !== null && isZero(tax))],
    ['currency', side === null || CURRENCY.test(cell('currency'))],
    ['transaction_id', id !== null],
  ];
  const fault = checks.find(([, ok]) => !ok);
  if (fault !== undefined) return fault[0];
  const base = { line, at: at as Instant, coin: coin as string, shares: shares as Decimal };
  switch (kind.kind) {
    case 'left':
      return { is: 'left', left: left(kind.reason, [line], at) };
    case 'trade': {
      const figures = { amount: amount as Decimal, fee: fee as Decimal, currency: cell('currency') };
      return { is: 'trade', trade: { ...base, ...figures, side: kind.side, id: id as string } };
    }
    case 'cancel':
      return { is: 'cancel', cancel: { ...base, side: kind.side, amount: amount as Decimal } };
    case 'migration':
      return { is: 'migration', migration: base };
    default: {
      const reason = kind.kind === 'receipt' ? 'coin-deposit' : 'coin-withdrawal';
      return { is: 'left', left: { ...left(reason, [line], at), coin: base.coin, units: abs(base.shares) as Units } };
    }
  }
}

/**
 * Rule 6: "each pairs one-to-one with the latest earlier (by `datetime`, then line), not yet paired BUY (or SELL) of
 * the same coin with equal |shares| and equal |amount|; both rows go out as `unpaired`, named by line. With no such
 * row, the cancellation alone goes out as `unpaired`."
 */
function cancel(trades: readonly Trade[], cancels: readonly Cancel[]) {
  const paired = new Set<Trade>();
  const out: LeftOutRow[] = [];
  for (const row of cancels.toSorted(order)) {
    const same = (trade: Trade) =>
      !paired.has(trade) &&
      trade.side === row.side &&
      trade.coin === row.coin &&
      order(trade, row) < 0 &&
      compare(abs(trade.shares), abs(row.shares)) === 0 &&
      compare(abs(trade.amount), abs(row.amount)) === 0;
    const match = trades.filter(same).toSorted(order).at(-1);
    if (match !== undefined) paired.add(match);
    out.push(
      match === undefined ? left('unpaired', [row.line], row.at) : left('unpaired', [match.line, row.line], match.at),
    );
  }
  return { out, kept: trades.filter((trade) => !paired.has(trade)) };
}

/**
 * Rule 7: "MIGRATION rows group by the instant their datetime names and by coin. Each coin whose rows at an instant
 * sum to 0 is `within`; when exactly two coins are left at that instant, one summing below 0 and one above, their rows
 * are one `conversion`; any other MIGRATION row is `unreadable`, column `type`." A group's time is the text that
 * sorts first among its rows', so the file's order changes nothing.
 */
function migrations(rows: readonly Base[]): LeftOutRow[] {
  const instants: Base[][] = [];
  for (const row of rows.toSorted((a, b) => byMoment(a.at, b.at) || a.line - b.line)) {
    const last = instants.at(-1);
    if (last !== undefined && compareInstants((last[0] as Base).at, row.at) === 0) last.push(row);
    else instants.push([row]);
  }
  return instants.flatMap((same) => {
    const at = (same[0] as Base).at;
    const coins = new Map<string, Base[]>();
    for (const row of same) coins.set(row.coin, [...(coins.get(row.coin) ?? []), row]);
    const total = (group: readonly Base[]) => signOf(sum(group.map((row) => row.shares)));
    const lines = (groups: readonly Base[][]) =>
      groups
        .flat()
        .map((row) => row.line)
        .toSorted((a, b) => a - b);
    const groups = [...coins.values()];
    const [within, rest] = [groups.filter((group) => total(group) === 0), groups.filter((group) => total(group) !== 0)];
    const out = within.map((group) => left('within', lines([group]), at));
    if (rest.length === 0) return out;
    const swap = rest.length === 2 && total(rest[0] as Base[]) !== total(rest[1] as Base[]);
    return [...out, swap ? left('conversion', lines(rest), at) : left('unreadable', lines(rest), null, 'type')];
  });
}

/** Rules 5 and 10: one row, one movement, keyed `poc-csv-1|trade-republic|<transaction_id>|<COIN>|<in|out>`. */
const movementOf = (trade: Trade): Movement => ({
  key: `poc-csv-1|trade-republic|${trade.id}|${trade.coin}|${trade.side === 'BUY' ? 'in' : 'out'}`,
  lines: [trade.line],
  at: trade.at,
  role: trade.side === 'BUY' ? 'purchase' : 'sale',
  coin: trade.coin,
  ...cutUnits(abs(trade.shares)),
  currency: trade.currency,
  amount: abs(trade.amount) as Money,
  fee: abs(trade.fee) as Money,
  feeInCoin: false,
});

/** Reads a Trade Republic export's data rows under its header, by header name. */
export function readTradeRepublic(header: readonly string[], data: readonly (readonly string[])[]): ExchangeFile {
  const columns = new Map(header.map((name, index) => [name, index]));
  const rows = data.flatMap((cells, index): (Row & { item: Item | Column })[] => {
    if (isBlankRow(cells)) return [];
    const cell = (name: Column) => cells[columns.get(name) ?? -1] ?? '';
    const [at, id] = [instantOf(cell('datetime')), ID.test(cell('transaction_id')) ? cell('transaction_id') : null];
    const signature = JSON.stringify(TR_READ.map(cell));
    return [{ line: index + 2, signature, id, at, item: itemOf(cell, index + 2, at, id) }];
  });
  // Rule 4: "A repeated id with the same read cells keeps one row; with different cells both rows are `unreadable`."
  const ids = new Map<string | number, typeof rows>();
  for (const row of rows) ids.set(row.id ?? row.line, [...(ids.get(row.id ?? row.line) ?? []), row]);
  const out: (Movement | LeftOutRow)[] = [];
  const [trades, cancels, moved]: [Trade[], Cancel[], Base[]] = [[], [], []];
  for (const same of ids.values()) {
    const [{ item, line }] = same as [(typeof rows)[number]];
    if (same.some((row) => row.signature !== same[0]?.signature))
      out.push(
        left(
          'unreadable',
          same.map((row) => row.line),
          null,
          'transaction_id',
        ),
      );
    else if (typeof item === 'string') out.push(left('unreadable', [line], null, item));
    else if (item.is === 'trade') trades.push(item.trade);
    else if (item.is === 'cancel') cancels.push(item.cancel);
    else if (item.is === 'migration') moved.push(item.migration);
    else out.push(item.left);
  }
  const cancelled = cancel(trades, cancels);
  out.push(...cancelled.out, ...migrations(moved), ...cancelled.kept.map(movementOf));
  const times = rows.flatMap((row) => (row.at === null ? [] : [row.at])).toSorted(byMoment);
  const sorted = out.toSorted((a, b) => Math.min(...a.lines) - Math.min(...b.lines));
  return {
    exchange: 'trade-republic',
    rows: rows.length,
    first: times.at(0) ?? null,
    last: times.at(-1) ?? null,
    movements: sorted.filter((item): item is Movement => 'key' in item),
    leftOut: sorted.filter((item): item is LeftOutRow => 'reason' in item),
  };
}
