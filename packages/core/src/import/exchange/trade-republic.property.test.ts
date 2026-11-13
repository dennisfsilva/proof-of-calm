import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { ExchangeFile } from './kraken';
import { readTradeRepublic, TR_COLUMNS } from './trade-republic';

// The Trade Republic reader (docs/DOMAIN.md §3.13, the exchange import) over generated exports. Trades take their own
// minute, so no cancellation pairs by line; migrations share two instants, so they group; some ids repeat a whole
// row, which is read once.

// The worst of three seeds under the whole core suite with coverage on was 79 ms (2026-11-13); six times it, 474 ms,
// stays under a third of Vitest's 5 s timeout, the core's default.
const RUNS = { numRuns: 100 };

const ROWS: Record<string, readonly [string, string, string, '+' | '-' | '', '+' | '-' | '']> = {
  buy: ['TRADING', 'BUY', 'CRYPTO', '+', '-'],
  sell: ['TRADING', 'SELL', 'CRYPTO', '-', '+'],
  buyCancelled: ['TRADING', 'BUY_CANCELLED', 'CRYPTO', '-', '+'],
  sellCancelled: ['TRADING', 'SELL_CANCELLED', 'CRYPTO', '+', '-'],
  receipt: ['DELIVERY', 'FREE_RECEIPT', 'CRYPTO', '+', ''],
  delivery: ['DELIVERY', 'FREE_DELIVERY', 'CRYPTO', '-', ''],
  migrationIn: ['DELIVERY', 'MIGRATION', 'CRYPTO', '+', ''],
  migrationOut: ['DELIVERY', 'MIGRATION', 'CRYPTO', '-', ''],
  saveback: ['CASH', 'BENEFITS_SAVEBACK', '', '', '+'],
  cash: ['CASH', 'CARD_TRANSACTION', '', '', '-'],
  fund: ['TRADING', 'BUY', 'FUND', '+', '-'],
};
const NEVER_READ = TR_COLUMNS.filter(
  (column) => !['datetime', 'category', 'type', 'asset_class', 'symbol', 'shares'].includes(column),
).filter((column) => !['amount', 'fee', 'tax', 'currency', 'transaction_id'].includes(column));

const row = fc.record({
  kind: fc.constantFrom(...Object.keys(ROWS)),
  symbol: fc.constantFrom('BTC', 'XBT', 'ETH', 'SOL', 'XF0RENDER015'),
  shares: fc.constantFrom('0.001', '0.002', '0.00012345678912', '0', ''),
  amount: fc.constantFrom('50.00', '25.00', '0.10'),
  fee: fc.constantFrom('-1.00', ''),
  instant: fc.constantFrom('2026-06-01T09:00:00.000Z', '2026-06-01T09:30:00.000Z'),
});
type Row = typeof row extends fc.Arbitrary<infer T> ? T : never;
const exportOf = fc.tuple(fc.array(row, { maxLength: 16 }), fc.array(fc.nat({ max: 15 }), { maxLength: 3 }));
const sign = (mark: '+' | '-' | '', value: string) => (mark === '-' && value !== '' ? `-${value}` : value);

/** The cells of each row, the trades at their own minute, then the repeats; `fill` gives a never-read cell. */
function dataOf([rows, repeats]: [readonly Row[], readonly number[]], fill: (column: string, index: number) => string) {
  const data = rows.map((each, index) => {
    const [category, type, assetClass, shares, amount] = ROWS[each.kind] as (typeof ROWS)[string];
    const read: Record<string, string> = {
      datetime: category === 'TRADING' ? `2026-05-01T08:${String(index).padStart(2, '0')}:00.000Z` : each.instant,
      category,
      type,
      asset_class: assetClass,
      symbol: assetClass === 'CRYPTO' ? each.symbol : '',
      shares: shares === '' ? '' : sign(shares, each.shares),
      amount: amount === '' ? '' : sign(amount, each.amount),
      fee: each.fee,
      tax: '',
      currency: 'EUR',
      transaction_id: `TXN-${index}`,
    };
    return TR_COLUMNS.map((column) => read[column] ?? fill(column, index));
  });
  return [...data, ...repeats.flatMap((index) => data.slice(index, index + 1))];
}
const blank = () => '';
const read = (data: readonly (readonly string[])[]) => readTradeRepublic(TR_COLUMNS, data);

/** The file's items without their lines, in an order that ignores the file's. */
function unlined(file: ExchangeFile) {
  const each = <T extends { readonly lines: readonly number[] }>(items: readonly T[]) =>
    items
      .map(({ lines: _, ...item }) => JSON.stringify(item))
      .toSorted()
      .map((item) => JSON.parse(item) as unknown);
  return { ...file, movements: each(file.movements), leftOut: each(file.leftOut) };
}

describe('readTradeRepublic (property)', () => {
  it('reads the same for any text in the columns it never reads, and holds none of it', () => {
    const texts = fc.dictionary(fc.constantFrom(...NEVER_READ), fc.string(), { maxKeys: NEVER_READ.length });
    fc.assert(
      fc.property(exportOf, texts, (file, text) => {
        const filled = read(dataOf(file, (column, index) => `NR|${index}|${text[column] ?? ''}`));
        expect(filled).toEqual(read(dataOf(file, blank)));
        expect(JSON.stringify(filled)).not.toContain('NR|');
      }),
      RUNS,
    );
  });

  it('reads any order of the same rows as the same movements and left-out rows', () => {
    const shuffled = exportOf.chain((file) => {
      const data = dataOf(file, blank);
      return fc.tuple(fc.constant(data), fc.shuffledSubarray(data, { minLength: data.length, maxLength: data.length }));
    });
    fc.assert(
      fc.property(shuffled, ([data, moved]) => {
        expect(unlined(read(moved))).toEqual(unlined(read(data)));
      }),
      RUNS,
    );
  });

  it('gives each movement its own key, and no left-out row a cell of its row', () => {
    fc.assert(
      fc.property(exportOf, (file) => {
        const { movements, leftOut } = read(dataOf(file, blank));
        const keys = movements.map((movement) => movement.key);
        expect(new Set(keys).size).toBe(keys.length);
        expect(JSON.stringify(leftOut)).not.toMatch(/TXN-|CRYPTO|TRADING|DELIVERY|CASH|EUR|BUY|SELL|FREE_|XF0/u);
      }),
      RUNS,
    );
  });
});
