import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { anEntry, date, instant, money, month, units } from '../../../test/builders';
import { restarted } from '../../../test/exchange/plan-arbitraries';
import { CHOICES, LISBON, NOW, PLAN, testId } from '../../../test/exchange/plan-fixture';
import { saveTransaction, storedOver } from '../../actions/entries';
import { addDays } from '../../dates/calendar';
import { type Entry, isEstimate } from '../../schema/entry';
import type { ExchangeFile } from './kraken';
import { type ExchangeImportPlan, planExchangeImport } from './plan';
import { readTradeRepublic, TR_COLUMNS } from './trade-republic';

// The Trade Republic reader (docs/DOMAIN.md §3.13, the exchange import) over generated exports. Trades take their own
// minute, so no cancellation pairs by line; migrations share two instants, one written two ways, so they group by
// instant and coin; some ids repeat a whole row, which is read once.

// The worst of three seeds under the whole core suite with coverage on was 79 ms (2026-11-13); six times it, 474 ms,
// stays under a third of Vitest's 5 s timeout, the core's default.
const RUNS = { numRuns: 100 };
// The cancellation property plans two imports over the reader, over live one-tap estimates, so it runs 300 times with
// a 60 s timeout. Measured again on 2026-11-14 under the whole core suite with coverage, seeds 1 to 8: the worst was
// 0.53 s (seed 4); six times it, 3.2 s, stays under a third of the timeout (20 s). The reader's own properties took at most 0.15 s there.
// Measured again on 2026-11-23, with taps of 70 and 250, seeds 1 to 8: the worst was 0.69 s (seed 8); six times it, 4.1 s.
const TWICE = { numRuns: 300 };
const TIMEOUT = 60_000;

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
  shares: fc.constantFrom('0.001', '0.002', '0.00012345678912', '0.00000000004', '0', ''),
  amount: fc.constantFrom('50.00', '25.00', '0.10'),
  fee: fc.constantFrom('-1.00', ''),
  instant: fc.constantFrom('2026-06-01T09:00:00.000Z', '2026-06-01T09:00:00Z', '2026-06-01T09:30:00.000Z'),
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

/** Buys at their own even minute, and cancellations copying an earlier buy's |shares| and |amount| a minute or more later. */
const trade = fc.record({ coin: fc.constantFrom('BTC', 'ETH'), shares: fc.constantFrom('0.001', '0.002') });
type Trade = typeof trade extends fc.Arbitrary<infer T> ? T : never;
const cancelling = fc.record({
  buys: fc.array(trade, { minLength: 1, maxLength: 8 }),
  cancels: fc.array(fc.record({ of: fc.nat(), late: fc.nat({ max: 20 }) }), { maxLength: 4 }),
  cut: fc.nat(),
  taps: fc.array(
    fc.record({
      coin: fc.constantFrom('BTC', 'ETH'),
      month: fc.constantFrom(4, 5, 5, 6),
      late: fc.integer({ min: -3, max: 20 }),
      amount: fc.constantFrom('70', '250'),
    }),
    { maxLength: 3 },
  ),
  change: fc.oneof(
    fc.constant({ kind: 'none' as const }),
    fc.record({ kind: fc.constant('deleted' as const), of: fc.nat() }),
    fc.record({ kind: fc.constant('edited' as const), of: fc.nat() }),
    fc.record({
      kind: fc.constant('added' as const),
      coin: fc.constantFrom('BTC', 'ETH'),
      month: fc.constantFrom(4, 5, 5, 6),
      late: fc.integer({ min: -3, max: 20 }),
      amount: fc.constantFrom('70', '250'),
    }),
  ),
});
type Change = (typeof cancelling extends fc.Arbitrary<infer T> ? T : never)['change'];
const HAND = instant('2026-11-01T08:00:00Z');
const LATER = instant('2026-11-12T18:00:00Z');
/** One-tap estimates as the person taps them, live, near their month's due date. */
const tapsOf = (taps: readonly { coin: string; month: number; late: number; amount: string }[]) =>
  taps.map(({ coin, month: m, late, amount }) =>
    anEntry({
      coin: coin as Entry['coin'],
      slot: month(`2026-0${m}`),
      date: addDays(date(`2026-0${m}-01`), late),
      amount: money(amount),
      source: 'one-tap',
      venue: 'Bitvavo',
    }),
  );
/** One trade row's cells, its `datetime` first and again in its column, so a cut reads it without the header. */
function tradeRow(kind: 'buy' | 'buyCancelled', { coin, shares }: Trade, minute: number, id: string) {
  const [category, type, assetClass, sharesSign, amountSign] = ROWS[kind] as (typeof ROWS)[string];
  const datetime = `2026-05-01T08:${String(minute).padStart(2, '0')}:00.000Z`;
  const cells: Record<string, string> = {
    datetime,
    category,
    type,
    asset_class: assetClass,
    symbol: coin,
    shares: sign(sharesSign, shares),
    amount: sign(amountSign, shares === '0.001' ? '50.00' : '100.00'),
    fee: '-1.00',
    currency: 'EUR',
    transaction_id: id,
  };
  return [datetime, ...TR_COLUMNS.map((column) => cells[column] ?? '')];
}
/** What the write does with a plan: tombstones the estimates it replaces and adds its entries. */
function store(entries: readonly Entry[], plan: ExchangeImportPlan): Entry[] {
  const replaced = new Set(plan.replaced.flatMap((replacement) => replacement.estimates.map((entry) => entry.id)));
  return [...entries.map((entry) => (replaced.has(entry.id) ? { ...entry, deletedAt: NOW } : entry)), ...plan.entries];
}
const planned = (file: ExchangeFile, entries: readonly Entry[]) =>
  planExchangeImport(file, { plan: PLAN, entries }, CHOICES, LISBON);

/** The Log before the imports: the taps, one of them deleted by hand when the change says so. */
const startOf = (tapped: readonly Entry[], change: Change) =>
  tapped.map((entry, index) =>
    change.kind === 'deleted' && index === change.of % tapped.length
      ? { ...entry, deletedAt: HAND, updatedAt: HAND }
      : entry,
  );
/**
 * The Log between the imports: a live estimate's row saved in the Log with other units, which makes it the person's own
 * record (`manual`), or a tap added as a JSON import brings one; `added` is that tap.
 */
function between(log: readonly Entry[], change: Change, added: Entry | null): readonly Entry[] {
  if (added !== null) return [...log, added];
  const estimates = log.filter((entry) => entry.deletedAt === null && isEstimate(entry));
  const estimate = estimates[change.kind === 'edited' ? change.of % Math.max(estimates.length, 1) : -1];
  if (estimate === undefined) return log;
  const { date: day, slot, fee, venue, coin, id, amount } = estimate;
  const held = units(estimate.units === '0.00777' ? '0.00778' : '0.00777');
  const rows = [{ coin, entry: id, amount, units: held }];
  const draft = { kind: 'dca' as const, date: day, slot, fee, note: 'edited', venue, rows };
  const saved = saveTransaction(draft, {
    plan: PLAN,
    entries: log,
    editing: [estimate],
    ids: [],
    now: LATER,
    source: 'manual',
  });
  if (!saved.ok) throw new Error(`the edit is refused: ${saved.error.code}`);
  return storedOver(log, saved.value);
}

/** The file's items without their lines, in an order that ignores the file's. */
function unlined(file: ExchangeFile) {
  const each = <T extends { readonly lines: readonly number[] }>(items: readonly T[]) =>
    items
      .map(({ lines: _, ...item }) => JSON.stringify(item))
      .toSorted()
      .map((item) => JSON.parse(item) as unknown);
  return { ...file, movements: each(file.movements), leftOut: each(file.leftOut), cancelled: each(file.cancelled) };
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

  it(
    'a whole file names exactly the stored live buys its cancellations pair; deleting them leaves one import’s live Log, but for the estimates it names',
    () => {
      fc.assert(
        fc.property(restarted(cancelling), ({ buys, cancels, cut, taps, change }) => {
          const rows = [
            ...buys.map((buy, index) => tradeRow('buy', buy, index * 2, `B${index}`)),
            ...cancels.map(({ of, late }, index) => {
              const at = (of % buys.length) * 2 + 1 + late;
              return tradeRow('buyCancelled', buys[of % buys.length] as Trade, at, `C${index}`);
            }),
          ];
          const instants = [...new Set(rows.map((cells) => cells[0] as string))].sort();
          const at = instants[cut % (instants.length + 1)] ?? '~';
          const whole = read(rows.map((cells) => cells.slice(1)));
          const part = read(rows.filter((cells) => (cells[0] as string) < at).map((cells) => cells.slice(1)));
          // At most one hand change to the Log: a tap deleted before the imports (both worlds start with the delete), a
          // row edit between them (one import's world starts without it) or a tap added between them (one import's
          // world holds it from the start).
          const tapped = startOf(tapsOf(taps), change);
          const added = change.kind === 'added' ? (tapsOf([change])[0] as Entry) : null;
          const earlier = planned(part, tapped);
          const log = between(store(tapped, earlier), change, added);
          const then = planned(whole, log);
          const paired = new Set(whole.cancelled.map((movement) => testId(movement.key)));
          const named = then.cancelled.map(({ entry }) => entry.id).sort();
          expect(named).toEqual(
            log
              .filter((entry) => paired.has(entry.id) && entry.deletedAt === null)
              .map((entry) => entry.id)
              .sort(),
          );
          const carried = new Set(then.cancelled.flatMap(({ estimates }) => estimates.map((entry) => entry.id)));
          const deleted = log.map((entry) => (named.includes(entry.id) ? { ...entry, deletedAt: NOW } : entry));
          const first = added === null ? tapped : [...tapped, added];
          const [two, one] = [store(deleted, then), store(first, planned(whole, first))];
          // Never silently: (i) a month the line names holds no live estimate of its coin; (ii) an estimate one import of
          // the whole file keeps live and two tombstone is in a month the line names, or the Log two imports end with keeps
          // in its month a live monthly buy of the coin that is not exchange-imported: a live one-tap estimate or an entry
          // of the person's own, so the month is not left without its monthly buy. Read from that Log, not from the plan.
          const monthOf = (entry: Entry) => `${entry.coin}|${entry.slot}`;
          const months = new Set(
            then.cancelled.flatMap(({ entry, estimates }) => (estimates.length > 0 ? [monthOf(entry)] : [])),
          );
          const liveIn = (entries: readonly Entry[]) => entries.filter((entry) => entry.deletedAt === null);
          expect(liveIn(two).filter((entry) => isEstimate(entry) && months.has(monthOf(entry)))).toEqual([]);
          const kept = new Set(
            liveIn(two)
              .filter((entry) => entry.kind === 'dca' && entry.source !== 'import-csv')
              .map(monthOf),
          );
          const tombstoned = new Set(two.filter((entry) => entry.deletedAt !== null).map((entry) => entry.id));
          const silent = liveIn(one).filter(
            (entry) =>
              isEstimate(entry) && tombstoned.has(entry.id) && !months.has(monthOf(entry)) && !kept.has(monthOf(entry)),
          );
          expect(silent).toEqual([]);
          if (change.kind !== 'none') return;
          // With no hand change, the exception exactly: each estimate a named entry carries is live in one import and
          // tombstoned in two, and the two Logs are otherwise equal.
          const liveOf = (entries: readonly Entry[]) =>
            liveIn(entries)
              .map((entry) => `${entry.id}:${entry.kind}:${entry.slot}:${entry.coin}:${entry.units}`)
              .sort();
          expect(two.filter((entry) => carried.has(entry.id) && entry.deletedAt === null)).toEqual([]);
          expect(one.filter((entry) => carried.has(entry.id) && entry.deletedAt === null)).toHaveLength(carried.size);
          expect(liveOf(two)).toEqual(liveOf(one.filter((entry) => !carried.has(entry.id))));
          // Step 5's half gate across the cancellation is drawn here but not counted, since no seed is sure to reach it
          // (0 of 300 runs at seed 167): plan-estimates.test.ts pins both worlds, a named buy carrying a tap the part's
          // import replaced while its month keeps an imported buy under half ("Nina, both buys in the earlier export"),
          // and a month the whole file keeps beside a named buy ("Nina: an earlier export stores 60").
        }),
        TWICE,
      );
    },
    TIMEOUT,
  );

  it('gives each movement its own key and units above 0, and no left-out row a cell of its row', () => {
    fc.assert(
      fc.property(exportOf, (file) => {
        const { movements, leftOut } = read(dataOf(file, blank));
        const keys = movements.map((movement) => movement.key);
        expect(new Set(keys).size).toBe(keys.length);
        expect(movements.filter((movement) => !/[1-9]/u.test(movement.units))).toEqual([]);
        expect(JSON.stringify(leftOut)).not.toMatch(/TXN-|CRYPTO|TRADING|DELIVERY|CASH|EUR|BUY|SELL|FREE_|XF0/u);
      }),
      RUNS,
    );
  });
});
