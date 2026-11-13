import { describe, expect, it } from 'vitest';
import synthetic from '../../../test/exchange/trade-republic-synthetic.csv?raw';
import { TRADE_REPUBLIC_SYNTHETIC } from '../../../test/exchange/trade-republic-synthetic.expected';
import { csvRows } from './table';
import { readTradeRepublic, TR_COLUMNS, TR_READ } from './trade-republic';

// The Trade Republic reader (docs/DOMAIN.md §3.13, the exchange import; ADR-0056, Corrections) against a synthetic
// export worked out by hand, then one case per reading rule.
const fromText = (text: string) => {
  const [header = [], ...data] = csvRows(text);
  return readTradeRepublic(header, data);
};

type Cells = Partial<Record<(typeof TR_READ)[number], string>>;
const BUY: Required<Cells> = {
  datetime: '2026-05-04T08:15:30.123Z',
  category: 'TRADING',
  type: 'BUY',
  asset_class: 'CRYPTO',
  symbol: 'BTC',
  shares: '0.001',
  amount: '-50.00',
  fee: '-1.00',
  tax: '',
  currency: 'EUR',
  transaction_id: 'T1',
};
const SELL: Cells = { type: 'SELL', shares: '-0.001', amount: '50.00' };
const read = (...rows: Cells[]) =>
  readTradeRepublic(
    TR_READ,
    rows.map((row) => TR_READ.map((column) => ({ ...BUY, ...row })[column])),
  );
const reasons = (...rows: Cells[]) => read(...rows).leftOut.map((row) => [row.reason, row.lines, row.column]);
const keys = (...rows: Cells[]) => read(...rows).movements.map((movement) => movement.key);

describe('readTradeRepublic (golden)', () => {
  it('reads the synthetic export exactly as worked out by hand', () => {
    expect(fromText(synthetic)).toEqual(TRADE_REPUBLIC_SYNTHETIC);
  });

  it('reads the columns by name, in any order', () => {
    const reversed = csvRows(synthetic).map((cells) => cells.toReversed());
    const [header = [], ...data] = reversed;
    expect(readTradeRepublic(header, data)).toEqual(TRADE_REPUBLIC_SYNTHETIC);
  });

  it('holds no text of a column it never reads', () => {
    expect(JSON.stringify(fromText(synthetic))).not.toContain('SENTINEL');
    const never = TR_COLUMNS.filter((column) => !(TR_READ as readonly string[]).includes(column));
    expect(never).toEqual(['date', 'account_type', 'name', 'price', 'original_amount', 'original_currency'].concat([
      'fx_rate',
      'description',
      'counterparty_name',
      'counterparty_iban',
      'payment_reference',
      'mcc_code',
    ]));
  });

  it('skips a blank line, and a later row keeps its line', () => {
    const file = readTradeRepublic(TR_READ, [
      TR_READ.map(() => ''),
      TR_READ.map((column) => BUY[column]),
    ]);
    expect([file.rows, file.movements.map((movement) => movement.lines)]).toEqual([1, [[3]]]);
  });

  it('reads an empty file as no rows, no first and no last', () => {
    expect(read()).toEqual({ exchange: 'trade-republic', rows: 0, first: null, last: null, movements: [], leftOut: [] });
  });
});

describe('readTradeRepublic, rule by rule', () => {
  it('rule 2: a datetime with 0, 3 or 6 fraction digits reads as that UTC instant', () => {
    for (const datetime of ['2026-05-04T08:15:30Z', '2026-05-04T08:15:30.123Z', '2026-05-04T08:15:30.123456Z']) {
      expect(read({ datetime }).movements.map((movement) => movement.at)).toEqual([datetime]);
    }
  });

  it.each([
    '2026-05-04T08:15:30.1234567Z',
    '2026-05-04 08:15:30.123Z',
    '2026-05-04T08:15:30.123+01:00',
    '2026-05-04T08:15:30.123',
    '2026-02-30T08:15:30Z',
    '',
  ])('rule 2: datetime %j is unreadable, with no time', (datetime) => {
    const file = read({ datetime });
    expect([file.leftOut, file.first]).toEqual([
      [{ reason: 'unreadable', lines: [2], at: null, coin: null, units: null, column: 'datetime' }],
      null,
    ]);
  });

  it.each(['+0.001', '1e-3', '0,001', '1,000.5', '1 000', '.5', '5.', '-', ''])(
    'rule 3: shares %j are unreadable',
    (shares) => {
      expect(reasons({ shares })).toEqual([['unreadable', [2], 'shares']]);
    },
  );

  it('rule 3: an empty fee or tax is 0, a fee is its absolute value, and an unparsable one is unreadable', () => {
    expect(read({ fee: '', tax: '' }).movements[0]?.fee).toBe('0');
    expect(read({ fee: '1.00', tax: '0.00' }).movements[0]?.fee).toBe('1');
    expect(reasons({ fee: '1,00' })).toEqual([['unreadable', [2], 'fee']]);
    expect(reasons({ tax: 'x' })).toEqual([['unreadable', [2], 'tax']]);
  });

  it.each(['', 'x'.repeat(65), 'txé', 'tx\u0001'])('rule 4: transaction_id %j is unreadable', (transaction_id) => {
    expect(reasons({ transaction_id })).toEqual([['unreadable', [2], 'transaction_id']]);
  });

  it('rule 4: a transaction_id of 64 printable characters is read', () => {
    expect(keys({ transaction_id: 'x'.repeat(64) })).toEqual([`poc-csv-1|trade-republic|${'x'.repeat(64)}|BTC|in`]);
  });

  it('rule 4: a repeated id with the same cells keeps one row; with other cells both rows are unreadable', () => {
    const same = read({}, {}, {});
    expect([same.rows, same.movements.map((movement) => movement.lines), same.leftOut]).toEqual([3, [[2]], []]);
    const named = readTradeRepublic(
      [...TR_READ, 'name'],
      ['first name', 'second name'].map((name) => [...TR_READ.map((column) => BUY[column]), name]),
    );
    expect([named.movements.length, named.leftOut]).toEqual([1, []]);
    expect(reasons({}, { shares: '0.002' }, { transaction_id: 'T2' })).toEqual([
      ['unreadable', [2, 3], 'transaction_id'],
    ]);
    expect(keys({}, { shares: '0.002' }, { transaction_id: 'T2' })).toEqual(['poc-csv-1|trade-republic|T2|BTC|in']);
  });

  it('rule 5: a buy is a purchase and a sell a sale, the amount without the fee', () => {
    const [buy, sell] = read({}, { ...SELL, transaction_id: 'T2' }).movements;
    expect([buy?.role, buy?.units, buy?.amount, buy?.fee, buy?.currency]).toEqual(['purchase', '0.001', '50', '1', 'EUR']);
    expect([sell?.role, sell?.units, sell?.amount, sell?.key]).toEqual([
      'sale',
      '0.001',
      '50',
      'poc-csv-1|trade-republic|T2|BTC|out',
    ]);
  });

  it.each<[string, Cells, string]>([
    ['empty shares', { shares: '' }, 'shares'],
    ['zero shares', { shares: '0.000' }, 'shares'],
    ['negative zero shares', { shares: '-0.0' }, 'shares'],
    ['negative shares', { shares: '-0.001' }, 'shares'],
    ['empty amount', { amount: '' }, 'amount'],
    ['zero amount', { amount: '0' }, 'amount'],
    ['positive amount', { amount: '50.00' }, 'amount'],
    ['a tax', { tax: '-0.10' }, 'tax'],
    ['a lower-case currency', { currency: 'eur' }, 'currency'],
    ['no currency', { currency: '' }, 'currency'],
    ['a sale with positive shares', { ...SELL, shares: '0.001' }, 'shares'],
    ['a sale with zero shares', { ...SELL, shares: '0' }, 'shares'],
    ['a sale with negative amount', { ...SELL, amount: '-50.00' }, 'amount'],
    ['a sale with empty amount', { ...SELL, amount: '' }, 'amount'],
  ])('rule 5: a trade with %s is unreadable in that column', (_, row, column) => {
    expect(reasons(row)).toEqual([['unreadable', [2], column]]);
  });

  it('rule 5: units over 10 decimals are cut toward zero and flagged', () => {
    const [movement] = read({ shares: '0.00012345678919' }).movements;
    expect([movement?.units, movement?.unitsCut]).toEqual(['0.0001234567', true]);
  });

  it('rule 6: of two equal earlier buys, only the latest pairs with the cancellation', () => {
    const rows: Cells[] = [
      { transaction_id: 'A', datetime: '2026-05-01T08:00:00.000Z' },
      { transaction_id: 'B', datetime: '2026-05-02T08:00:00.000Z' },
      { transaction_id: 'C', datetime: '2026-05-03T08:00:00.000Z', type: 'BUY_CANCELLED', shares: '-0.001' },
    ];
    expect([keys(...rows), reasons(...rows)]).toEqual([
      ['poc-csv-1|trade-republic|A|BTC|in'],
      [['unpaired', [3, 4], null]],
    ]);
    expect(read(...rows).leftOut[0]?.at).toBe('2026-05-02T08:00:00.000Z');
  });

  it('rule 6: equal times pair by line, and each buy pairs once', () => {
    const at = { datetime: '2026-05-01T08:00:00.000Z' };
    const cancel = { ...at, type: 'BUY_CANCELLED', amount: '50.00' };
    const rows: Cells[] = [
      { ...at, transaction_id: 'A' },
      { ...at, transaction_id: 'B' },
      { ...cancel, transaction_id: 'C' },
      { ...cancel, transaction_id: 'D' },
      { ...cancel, transaction_id: 'E' },
    ];
    expect([keys(...rows), reasons(...rows)]).toEqual([
      [],
      [
        ['unpaired', [2, 5], null],
        ['unpaired', [3, 4], null],
        ['unpaired', [6], null],
      ],
    ]);
  });

  it.each<[string, Cells]>([
    ['another coin', { symbol: 'ETH' }],
    ['other shares', { shares: '0.002' }],
    ['another amount', { amount: '49.99' }],
    ['a sale cancelled', { type: 'SELL_CANCELLED' }],
    ['an earlier time', { datetime: '2026-05-01T00:00:00.000Z' }],
  ])('rule 6: a cancellation with %s pairs with nothing and goes out alone', (_, row) => {
    const rows: Cells[] = [{}, { type: 'BUY_CANCELLED', datetime: '2026-05-05T00:00:00.000Z', transaction_id: 'C', ...row }];
    expect([keys(...rows), reasons(...rows)]).toEqual([['poc-csv-1|trade-republic|T1|BTC|in'], [['unpaired', [3], null]]]);
  });

  it('rule 6: SELL_CANCELLED pairs with a sale; a cancellation with unreadable shares is unreadable', () => {
    const later = { datetime: '2026-05-05T00:00:00.000Z', transaction_id: 'C' };
    expect(reasons({ ...SELL }, { ...later, type: 'SELL_CANCELLED', shares: '0.001', amount: '-50' })).toEqual([
      ['unpaired', [2, 3], null],
    ]);
    expect(reasons({ type: 'BUY_CANCELLED', amount: '' })).toEqual([['unreadable', [2], 'amount']]);
  });

  it('rule 7: a free receipt is a coin deposit and a free delivery a coin withdrawal, each with its units', () => {
    const delivery = { category: 'DELIVERY', amount: '', fee: '' };
    const file = read(
      { ...delivery, type: 'FREE_RECEIPT', shares: '0.0002' },
      { ...delivery, type: 'FREE_DELIVERY', shares: '-0.0003', symbol: 'XBT', transaction_id: 'T2' },
    );
    expect(file.leftOut.map((row) => [row.reason, row.coin, row.units, row.at])).toEqual([
      ['coin-deposit', 'BTC', '0.0002', BUY.datetime],
      ['coin-withdrawal', 'BTC', '0.0003', BUY.datetime],
    ]);
    expect(reasons({ ...delivery, type: 'FREE_RECEIPT', shares: '-0.0002' })).toEqual([['unreadable', [2], 'shares']]);
    expect(reasons({ ...delivery, type: 'FREE_DELIVERY', shares: '0.0002' })).toEqual([['unreadable', [2], 'shares']]);
  });

  it('rule 7: migration rows of one coin summing to 0 are within; two coins a conversion; anything else unreadable', () => {
    const move = (transaction_id: string, symbol: string, shares: string, datetime = BUY.datetime) => ({
      category: 'DELIVERY',
      type: 'MIGRATION',
      transaction_id,
      symbol,
      shares,
      datetime,
    });
    expect(reasons(move('A', 'SOL', '-1.5'), move('B', 'SOL', '1.50'))).toEqual([['within', [2, 3], null]]);
    expect(reasons(move('A', 'SOL', '-1.5'), move('B', 'ETH', '0.2'))).toEqual([['conversion', [2, 3], null]]);
    expect(reasons(move('A', 'SOL', '-1.5'))).toEqual([['unreadable', [2], 'type']]);
    expect(reasons(move('A', 'SOL', '-1.5'), move('B', 'SOL', '1.4'))).toEqual([['unreadable', [2, 3], 'type']]);
    expect(reasons(move('A', 'SOL', '-1'), move('B', 'ETH', '1'), move('C', 'BTC', '1'))).toEqual([
      ['unreadable', [2, 3, 4], 'type'],
    ]);
    expect(reasons(move('A', 'SOL', '-1.5'), move('B', 'SOL', '1.5', '2026-05-04T08:15:31.000Z'))).toEqual([
      ['unreadable', [2], 'type'],
      ['unreadable', [3], 'type'],
    ]);
    expect(reasons(move('A', 'SOL', ''))).toEqual([['unreadable', [2], 'shares']]);
  });

  it('rule 7: any other crypto row is other', () => {
    expect(reasons({ type: 'CORRECTION' }, { category: 'DELIVERY', type: 'X', transaction_id: 'T2' })).toEqual([
      ['other', [2], null],
      ['other', [3], null],
    ]);
  });

  it('rule 8: a Saveback credit is a benefit, any other cash row cash, and any other asset class other', () => {
    const cash = { category: 'CASH', asset_class: '', symbol: '', shares: '', amount: '4.50' };
    expect(
      reasons(
        { ...cash, type: 'BENEFITS_SAVEBACK' },
        { ...cash, type: 'CARD_TRANSACTION', transaction_id: 'T2' },
        { asset_class: 'FUND', symbol: 'IE00SYNTH0001', transaction_id: 'T3' },
      ),
    ).toEqual([
      ['benefit', [2], null],
      ['cash', [3], null],
      ['other', [4], null],
    ]);
  });

  it.each(['XF0RENDER015', 'btc', 'B', '', 'BTC.S'])('rule 9: symbol %j is unreadable', (symbol) => {
    expect(reasons({ symbol })).toEqual([['unreadable', [2], 'symbol']]);
  });

  it('rule 9: a ticker becomes its coin code by the Kraken rule', () => {
    expect(keys({ symbol: 'XBT' }, { symbol: 'RENDER', transaction_id: 'T2' })).toEqual([
      'poc-csv-1|trade-republic|T1|BTC|in',
      'poc-csv-1|trade-republic|T2|RENDER|in',
    ]);
  });

  it('a header lacking a read column leaves its cells empty, so every row is unreadable', () => {
    const header = TR_READ.filter((column) => column !== 'transaction_id');
    const file = readTradeRepublic(header, [header.map((column) => BUY[column])]);
    expect(file.leftOut.map((row) => row.column)).toEqual(['transaction_id']);
  });
});
