import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, BTC, date, ETH, instant, money, month, split, units } from '../../test/builders';
import { PT_MOVE_ENTRIES } from '../../test/tax-year/pt-fixture';
import { minus, type Price, plus } from '../money/decimal';
import type { LotRule, LotScope } from '../schema/country';
import type { Entry } from '../schema/entry';
import type { PriceSnapshot } from '../schema/prices';
import { sellableNow } from './eligibility';
import type { HoldingContext } from './lots';
import { coinsWithEntries, portfolio, priceOf } from './portfolio';

const plan = aPlan({ coins: [BTC, ETH], split: split({ BTC: '70', ETH: '30' }) });
const snapshot = (btc: string | null, eth: string | null): PriceSnapshot => ({
  at: instant('2026-10-16T14:05:00+01:00'),
  prices: {
    ...(btc === null ? {} : { BTC: { EUR: btc as Price, USD: '1' as Price } }),
    ...(eth === null ? {} : { ETH: { EUR: eth as Price } }),
  } as PriceSnapshot['prices'],
});
const btcBuys: Entry[] = [
  anEntry({
    coin: 'BTC' as never,
    amount: money('70'),
    units: units('0.001'),
    fee: money('0.5'),
    slot: month('2026-01'),
  }),
  anEntry({
    coin: 'BTC' as never,
    amount: money('70'),
    units: units('0.0014'),
    slot: month('2026-02'),
    date: date('2026-02-01'),
  }),
];
const ethBuy = anEntry({ coin: 'ETH' as never, amount: money('30'), units: units('0.01'), slot: month('2026-01') });

describe('portfolio (docs/DOMAIN.md §3.6)', () => {
  it('sums each coin and the whole, by value when every held coin is priced', () => {
    const result = portfolio(plan, [...btcBuys, ethBuy], snapshot('60000', '2000'));
    expect(result.positions[0]).toEqual({
      coin: 'BTC',
      boughtUnits: '0.0024',
      soldUnits: '0',
      units: '0.0024',
      unrecordedUnits: '0',
      invested: '140',
      proceeds: '0',
      fees: '0.5',
      average: '58333.3333333333',
      price: '60000',
      value: '144',
      pnl: '4',
      pnlPct: '2.8571',
      weight: '0.878049',
      buys: 2,
      sells: 0,
    });
    expect(result.positions[1]).toEqual(
      expect.objectContaining({ value: '20', pnl: '-10', pnlPct: '-33.3333', weight: '0.121951' }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        invested: '170',
        proceeds: '0',
        fees: '0.5',
        value: '164',
        pnl: '-6',
        pnlPct: '-3.5294',
        multiple: '0.964706',
        priced: true,
        buys: 3,
        sells: 0,
      }),
    );
  });

  it('never shows a partial total: one held coin without a price leaves the value empty', () => {
    const result = portfolio(plan, [...btcBuys, ethBuy], snapshot('60000', null));
    expect([result.value, result.pnl, result.multiple, result.priced]).toEqual([null, null, null, false]);
    expect(result.positions[1]).toEqual(expect.objectContaining({ price: null, value: null, pnl: null }));
    // Weights fall back to the amount invested.
    expect(result.positions.map((position) => position.weight)).toEqual(['0.823529', '0.176471']);
  });

  it('stays priced when a coin without units has no price, and weighs that coin at zero', () => {
    const result = portfolio(plan, btcBuys, snapshot('60000', null));
    expect([result.priced, result.value]).toEqual([true, '144']);
    expect(result.positions.map((position) => position.weight)).toEqual(['1', '0']);
  });

  it('counts sales as proceeds and units out, never below zero', () => {
    const sale = anEntry({
      kind: 'sell',
      slot: null,
      coin: 'BTC' as never,
      amount: money('100'),
      units: units('0.003'),
    });
    const result = portfolio(plan, [...btcBuys, sale], snapshot('60000', '2000'));
    expect(result.positions[0]).toEqual(
      expect.objectContaining({ soldUnits: '0.003', units: '0', proceeds: '100', value: '0', pnl: '-40', sells: 1 }),
    );
    expect(result.multiple).toBe('0.714286');
  });

  it('counts the units of coins held and only their recorded cost in invested', () => {
    const bought = anEntry({ kind: 'extra', slot: null, amount: money('100'), units: units('0.002') });
    const held = (amount: string | null) =>
      anEntry({
        kind: 'held',
        slot: null,
        fee: null,
        date: date('2025-01-01'),
        amount: amount === null ? null : money(amount),
        units: units('0.5'),
      });
    const result = portfolio(plan, [bought, held(null), held('0'), held('40')], null);
    expect(result.positions[0]).toMatchObject({ coin: 'BTC', boughtUnits: '1.502', invested: '140', buys: 4 });
    expect(result.invested).toBe('140');
  });

  it('a held entry without a cost adds its units to value and unrecordedUnits and nothing to invested, average or P/L', () => {
    const bought = anEntry({ kind: 'extra', slot: null, amount: money('100'), units: units('0.002') });
    const held = anEntry({ kind: 'held', slot: null, amount: null, units: units('0.5'), date: date('2025-01-01') });
    const result = portfolio(plan, [bought, held], snapshot('60000', '2000'));
    expect(result.positions[0]).toMatchObject({
      units: '0.502',
      unrecordedUnits: '0.5',
      value: '30120',
      invested: '100',
      average: '50000',
      pnl: '20',
      pnlPct: '20',
    });
    expect(result).toMatchObject({ value: '30120', invested: '100', pnl: '20', pnlPct: '20', multiple: '1.2' });
    // Value weights count every unit.
    expect(result.positions.map((position) => position.weight)).toEqual(['1', '0']);
  });

  it('gives a coin held only without a cost no average and no P/L, and weighs it at 0 by invested', () => {
    const held = anEntry({ kind: 'held', slot: null, amount: null, units: units('0.5'), date: date('2025-01-01') });
    const result = portfolio(plan, [held, ethBuy], snapshot(null, '2000'));
    expect(result.positions[0]).toMatchObject({ unrecordedUnits: '0.5', average: null, pnl: null, pnlPct: null });
    expect([result.value, result.pnl, result.multiple]).toEqual([null, null, null]);
    expect(result.positions.map((position) => position.weight)).toEqual(['0', '1']);
    const priced = portfolio(plan, [held, ethBuy], snapshot('60000', '2000'));
    expect(priced.positions[0]).toMatchObject({ value: '30000', average: null, pnl: null });
    // The totals count only the costed parts: ETH's 20 against its 30.
    expect(priced).toMatchObject({ value: '30020', invested: '30', pnl: '-10', multiple: '0.666667' });
  });

  it('is empty-handed without entries and without prices', () => {
    const result = portfolio(plan, [], null);
    expect(result).toEqual(
      expect.objectContaining({ invested: '0', value: '0', pnl: '0', pnlPct: null, multiple: null, priced: true }),
    );
    expect(result.positions.map((position) => [position.average, position.weight])).toEqual([
      [null, null],
      [null, null],
    ]);
    expect(portfolio(plan, btcBuys).value).toBeNull();
  });

  it('ignores deleted entries and keeps coins that have entries but left the plan', () => {
    const deleted = anEntry({ coin: 'BTC' as never, amount: money('999'), deletedAt: instant('2026-01-02T10:00:00Z') });
    const sol = anEntry({ coin: 'SOL' as never, kind: 'extra', slot: null, amount: money('10'), units: units('1') });
    expect(coinsWithEntries(plan, [sol, sol])).toEqual(['BTC', 'ETH', 'SOL']);
    const result = portfolio(plan, [deleted, sol], null);
    expect(result.positions.map((position) => [position.coin, position.invested])).toEqual([
      ['BTC', '0'],
      ['ETH', '0'],
      ['SOL', '10'],
    ]);
  });

  it('reads prices in the pay currency only, and ignores a zero price', () => {
    expect(priceOf(snapshot('60000', null), 'BTC' as never, plan)).toBe('60000');
    expect(priceOf(snapshot('60000', null), 'BTC' as never, { ...plan, payCurrency: 'GBP' })).toBeNull();
    expect(priceOf(snapshot('0', null), 'BTC' as never, plan)).toBeNull();
    expect(priceOf(null, 'BTC' as never, plan)).toBeNull();
  });

  it('a move lowers units, value and P/L by its fee and keeps invested and the average (the PT move fixture)', () => {
    const context: HoldingContext = { overrides: [], lotScope: 'per-venue', lotRule: 'fifo' };
    const [position] = portfolio(plan, PT_MOVE_ENTRIES, snapshot('80000', null), context).positions;
    expect(position).toMatchObject({
      units: '0.1498',
      soldUnits: '0.0002',
      invested: '5000',
      average: '33333.3333333333',
      value: '11984',
      pnl: '6984',
    });
  });
});

describe('portfolio: the sales of coins held without a cost, per lot rule (docs/DOMAIN.md §3.6)', () => {
  const context = (lotScope: LotScope, lotRule: LotRule): HoldingContext => ({ overrides: [], lotScope, lotRule });
  const held = (day: string, quantity: string) =>
    anEntry({ kind: 'held', slot: null, amount: null, units: units(quantity), date: date(day), venue: 'Ledger' });
  const bought = (day: string) =>
    anEntry({
      kind: 'extra',
      slot: null,
      amount: money('100'),
      units: units('0.002'),
      date: date(day),
      venue: 'Kraken',
    });
  const sold = (quantity: string) =>
    anEntry({
      kind: 'sell',
      slot: null,
      amount: money('80'),
      units: units(quantity),
      date: date('2026-06-01'),
      venue: 'Kraken',
    });
  const btc = (entries: Entry[], scope: LotScope, rule: LotRule) =>
    portfolio(plan, entries, snapshot('60000', '2000'), context(scope, rule)).positions[0];

  it("under per-venue FIFO a sale at the plan's venue leaves the held venue's units unrecorded", () => {
    const entries = [held('2025-01-01', '0.5'), bought('2026-01-01'), sold('0.001')];
    expect(btc(entries, 'per-venue', 'fifo')).toMatchObject({
      units: '0.501',
      unrecordedUnits: '0.5',
      proceeds: '80',
      pnl: '40',
    });
  });

  it('under global FIFO the sale takes the older held units first, and its proceeds drop out', () => {
    const entries = [held('2025-01-01', '0.5'), bought('2026-01-01'), sold('0.001')];
    expect(btc(entries, 'global', 'fifo')).toMatchObject({
      units: '0.501',
      unrecordedUnits: '0.499',
      proceeds: '80',
      pnl: '20',
    });
  });

  it('under LIFO the sale takes the latest lot, and only its share without a cost drops out', () => {
    const entries = [bought('2026-01-01'), held('2026-03-01', '0.001'), sold('0.002')];
    // FIFO takes the purchase; LIFO takes the 0.001 held, then 0.001 of the purchase: half the 80 counts.
    expect(btc(entries, 'global', 'fifo')).toMatchObject({ unrecordedUnits: '0.001', pnl: '-20' });
    expect(btc(entries, 'global', 'lifo')).toMatchObject({ units: '0.001', unrecordedUnits: '0', pnl: '0' });
  });

  it("takes the units a sale's venue could not cover off the oldest lot, and leaves its share without a cost out", () => {
    const entries = [held('2025-01-01', '0.5'), bought('2026-01-01'), sold('0.003')];
    // Per venue, Kraken's 0.002 cover 0.002 of the sale; the 0.001 left comes off the held lot, so 80 × 1/3 drops out.
    expect(btc(entries, 'per-venue', 'fifo')).toMatchObject({
      units: '0.499',
      unrecordedUnits: '0.499',
      pnl: '-46.6666666667',
    });
  });

  it('counts the units no lot of the coin covers as costed (imported data)', () => {
    const entries = [bought('2026-01-01'), sold('0.003')];
    for (const scope of ['per-venue', 'global'] as const) {
      expect(btc(entries, scope, 'fifo')).toMatchObject({ units: '0', unrecordedUnits: '0', pnl: '-20' });
    }
  });

  it('per venue: a sale at a venue without lots takes the held units, so the total is the sum of the positions', () => {
    const eth = anEntry({
      kind: 'extra',
      slot: null,
      coin: ETH.id,
      date: date('2026-02-01'),
      amount: money('1000'),
      units: units('1'),
      venue: 'Bitvavo',
    });
    const sale = { ...sold('0.5'), amount: money('30000'), venue: 'Bitvavo' };
    const result = portfolio(plan, [eth, held('2025-01-01', '1'), sale], snapshot('60000', '1100'), {
      overrides: [],
      lotScope: 'per-venue',
      lotRule: 'fifo',
    });
    // The 0.5 sold come off the held BTC: none of the €30,000 counts, and only the ETH's €100 is profit.
    expect(result).toMatchObject({ invested: '1000', value: '31100', pnl: '100', multiple: '1.1' });
    expect(result.positions.map((position) => [position.coin, position.unrecordedUnits, position.pnl])).toEqual([
      ['BTC', '0.5', null],
      ['ETH', '0', '100'],
    ]);
  });

  it('per venue: leaves the same lot unrecorded that sellableNow leaves held, under a 365-day rule', () => {
    const daily = { ...plan, holdingRule: { kind: 'days', days: 365, effect: 'exempt' } } as const;
    const extra = { ...bought('2026-02-01'), units: units('1'), venue: 'Ledger' };
    const sale = { ...sold('1'), amount: money('300'), venue: 'Bitvavo' };
    const entries = [held('2025-01-01', '1'), extra, sale];
    const perVenue: HoldingContext = { overrides: [], lotScope: 'per-venue', lotRule: 'fifo' };
    // The sale takes the oldest lot, the held one: the €100 lot is left, past the rule from 2027-02-01.
    expect(portfolio(daily, entries, snapshot('60000', '2000'), perVenue).positions[0]).toMatchObject({
      units: '1',
      unrecordedUnits: '0',
      pnl: '59900',
    });
    expect(sellableNow(daily, entries, BTC.id, date('2026-07-01'), perVenue)).toEqual({
      now: '0',
      later: [{ from: '2027-02-01', units: '1' }],
    });
  });

  it('per venue, the #368 repro gives P/L +€200 and a multiple of 3 at €60,000, as global scope does', () => {
    const january = held('2025-01-01', '1');
    const june = { ...sold('1'), date: date('2025-06-01'), amount: money('30000'), venue: 'Bitvavo' };
    const august = { ...bought('2025-08-01'), units: units('1'), venue: 'Ledger' };
    const september = { ...sold('1'), date: date('2025-09-01'), amount: money('300'), venue: 'Ledger' };
    const entries = [january, june, august, september];
    for (const scope of ['per-venue', 'global'] as const) {
      // The June sale takes the January lot, which has no cost, so none of its €30,000 counts; September takes August.
      const result = portfolio(plan, entries, snapshot('60000', '2000'), context(scope, 'fifo'));
      expect(result).toMatchObject({ invested: '100', value: '0', pnl: '200', multiple: '3' });
      expect(result.positions[0]).toMatchObject({ units: '0', unrecordedUnits: '0', pnl: '200' });
    }
  });

  it('imported: a sale before every lot that heldLots covers with a no-cost lot stays uncosted, under both scopes', () => {
    const sale = { ...sold('1'), date: date('2025-01-01'), amount: money('30000'), venue: 'Bitvavo' };
    const february = held('2025-02-01', '1');
    const march = { ...bought('2025-03-01'), units: units('1'), venue: 'Bitvavo' };
    for (const scope of ['per-venue', 'global'] as const) {
      // The sale's unit comes off the oldest lot, the no-cost one: its €30,000 drop out, the €100 lot is held and costed.
      expect(btc([sale, february, march], scope, 'fifo')).toMatchObject({
        units: '1',
        unrecordedUnits: '0',
        pnl: '59900',
      });
      // Without the held entry the unit comes off the €100 lot, so the €30,000 count.
      expect(btc([sale, march], scope, 'fifo')).toMatchObject({ units: '0', unrecordedUnits: '0', pnl: '29900' });
    }
  });

  it('adds nothing for a sale without an amount, which the entry schema refuses', () => {
    const entries = [bought('2026-01-01'), { ...sold('0.001'), amount: null }];
    expect(btc(entries, 'global', 'fifo')).toMatchObject({ proceeds: '0', pnl: '-40' });
  });
});

describe('portfolio properties (docs/ROADMAP.md M0)', () => {
  const amounts = fc.integer({ min: 1, max: 1_000_000 }).map((cents) => money((cents / 100).toFixed(2)));
  const quantities = fc.integer({ min: 1, max: 10_000_000 }).map((sats) => units((sats / 1e8).toFixed(8)));
  const entriesArb = fc.array(
    fc.record({
      sell: fc.boolean(),
      coin: fc.constantFrom('BTC', 'ETH'),
      amount: amounts,
      units: quantities,
    }),
    { maxLength: 30 },
  );
  const toEntries = (
    records: { sell: boolean; coin: string; amount: ReturnType<typeof money>; units: ReturnType<typeof units> }[],
  ) =>
    records.map((record) =>
      anEntry({
        kind: record.sell ? 'sell' : 'extra',
        slot: null,
        coin: record.coin as never,
        amount: record.amount,
        units: record.units,
      }),
    );

  it('does not depend on the order of the entries', () => {
    fc.assert(
      fc.property(entriesArb, fc.integer(), (records, seed) => {
        const entries = toEntries(records);
        const shuffled = [...entries].sort(
          (a, b) => ((a.id.charCodeAt(30) * 31 + seed) % 7) - ((b.id.charCodeAt(30) * 31 + seed) % 7),
        );
        expect(portfolio(plan, shuffled, snapshot('60000', '2000'))).toEqual(
          portfolio(plan, entries, snapshot('60000', '2000')),
        );
      }),
    );
  });

  it('keeps the identity P/L = value + proceeds − invested, per coin and in total', () => {
    fc.assert(
      fc.property(entriesArb, (records) => {
        const result = portfolio(plan, toEntries(records), snapshot('60000', '2000'));
        for (const position of result.positions) {
          expect(position.pnl).toBe(minus(plus(position.value as never, position.proceeds), position.invested));
        }
        expect(result.pnl).toBe(minus(plus(result.value as never, result.proceeds), result.invested));
      }),
    );
  });
});
