import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, BTC, date, ETH, id, instant, money, split } from '../../test/builders';
import type { Price } from '../money/decimal';
import type { Coin } from '../schema/coin';
import type { PriceSnapshot } from '../schema/prices';
import { canOneTap, defaultFee, oneTapEntries, plannedParts, sameParts } from './parts';
import type { Action } from './statuses';

const SOL: Coin = { id: 'SOL' as never, name: 'Solana', geckoId: 'solana', decimals: 4 };
const LINK: Coin = { id: 'LINK' as never, name: 'Chainlink', geckoId: 'chainlink', decimals: 4 };
const cycle = aPlan({ coins: [BTC, ETH, SOL, LINK], split: split({ BTC: '40', ETH: '30', SOL: '15', LINK: '15' }) });
const action = (overrides: Partial<Action> = {}): Action => ({
  kind: 'dca',
  slot: '2026-03' as never,
  due: date('2026-03-01'),
  status: 'late',
  plannedAmount: money('100'),
  loggedAmount: money('0'),
  ...overrides,
});
const prices = (values: Record<string, string>): PriceSnapshot => ({
  at: instant('2026-03-02T09:00:00Z'),
  prices: Object.fromEntries(Object.entries(values).map(([coin, eur]) => [coin, { EUR: eur as Price }])),
});
const now = instant('2026-03-02T09:00:00Z');

describe('plannedParts (docs/DOMAIN.md §3.4)', () => {
  it('splits the amount by the shares, in plan order, summing exactly', () => {
    expect(plannedParts(cycle, money('100'))).toEqual([
      { coin: 'BTC', amount: '40' },
      { coin: 'ETH', amount: '30' },
      { coin: 'SOL', amount: '15' },
      { coin: 'LINK', amount: '15' },
    ]);
    const thirds = aPlan({ coins: [BTC, ETH, SOL], split: split({ BTC: '33.3333', ETH: '33.3333', SOL: '33.3334' }) });
    expect(plannedParts(thirds, money('100')).map((part) => part.amount)).toEqual(['33.33', '33.33', '33.34']);
  });

  it('leaves out coins at zero, which stay in the plan for extras and sales', () => {
    const plan = aPlan({ coins: [BTC, ETH], split: split({ BTC: '100', ETH: '0' }) });
    expect(plannedParts(plan, money('250'))).toEqual([{ coin: 'BTC', amount: '250' }]);
  });
});

describe('sameParts (docs/DOMAIN.md §6 "One-tap")', () => {
  const parts = (...pairs: [string, string][]) =>
    pairs.map(([coin, amount]) => ({ coin: coin as never, amount: money(amount) }));

  it('holds for the same coins in the same order with equal amounts, however the decimals are written', () => {
    expect(sameParts(parts(['BTC', '70'], ['ETH', '30']), parts(['BTC', '70.00'], ['ETH', '30.0']))).toBe(true);
    expect(sameParts([], [])).toBe(true);
  });

  it('fails on another amount, another coin, another order or another count', () => {
    const shown = parts(['BTC', '70'], ['ETH', '30']);
    expect(sameParts(shown, parts(['BTC', '50'], ['ETH', '50']))).toBe(false);
    expect(sameParts(shown, parts(['BTC', '70'], ['SOL', '30']))).toBe(false);
    expect(sameParts(shown, parts(['ETH', '30'], ['BTC', '70']))).toBe(false);
    expect(sameParts(shown, parts(['BTC', '70']))).toBe(false);
    expect(sameParts(parts(['BTC', '70']), shown)).toBe(false);
  });
});

describe('oneTapEntries (docs/DOMAIN.md §3.4)', () => {
  const ids = [id(), id(), id(), id()];

  it('builds one entry per part at the day price, units rounded down to the coin decimals', () => {
    const drafts = oneTapEntries({
      plan: cycle,
      action: action(),
      prices: prices({ BTC: '70000', ETH: '2100', SOL: '150', LINK: '12' }),
      today: date('2026-03-02'),
      fee: money('1'),
      ids,
      now,
      venue: 'Kraken',
    });
    expect(drafts.map((draft) => [draft.coin, draft.amount, draft.units, draft.fee])).toEqual([
      ['BTC', '40', '0.00057142', '0.4'],
      ['ETH', '30', '0.014285', '0.3'],
      ['SOL', '15', '0.1', '0.15'],
      ['LINK', '15', '1.25', '0.15'],
    ]);
    expect(drafts[0]).toEqual(
      expect.objectContaining({
        id: ids[0],
        kind: 'dca',
        date: '2026-03-02',
        slot: '2026-03',
        venue: 'Kraken',
        source: 'one-tap',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        note: '',
      }),
    );
    expect(canOneTap(drafts)).toBe(true);
  });

  it('splits the fee by largest remainder, so the shares add up to the fee', () => {
    const plan = aPlan({ coins: [BTC, ETH, SOL], split: split({ BTC: '33.34', ETH: '33.33', SOL: '33.33' }) });
    const drafts = oneTapEntries({
      plan,
      action: action(),
      prices: prices({ BTC: '70000', ETH: '2100', SOL: '150' }),
      today: date('2026-03-02'),
      fee: money('0.1'),
      ids,
      now,
      venue: null,
    });
    expect(drafts.map((draft) => draft.fee)).toEqual(['0.04', '0.03', '0.03']);
  });

  it('leaves units empty where a price is missing or the amount buys less than one step', () => {
    const drafts = oneTapEntries({
      plan: cycle,
      action: action({ plannedAmount: money('0.04') }),
      prices: prices({ BTC: '70000', ETH: '0' }),
      today: date('2026-03-02'),
      fee: null,
      ids,
      now,
      venue: null,
    });
    // 0.04 splits 0.02 / 0.01 / 0.01 / 0 by largest remainder; the zero part is dropped.
    expect(drafts.map((draft) => [draft.coin, draft.amount, draft.units])).toEqual([
      ['BTC', '0.02', '0.00000028'],
      ['ETH', '0.01', null],
      ['SOL', '0.01', null],
    ]);
    expect(drafts.every((draft) => draft.fee === null)).toBe(true);
    const unpriced = oneTapEntries({
      plan: cycle,
      action: action(),
      prices: null,
      today: date('2026-03-02'),
      fee: null,
      ids,
      now,
      venue: null,
    });
    expect(canOneTap(unpriced)).toBe(false);
  });

  it('records the starting amount without a slot', () => {
    const [draft] = oneTapEntries({
      plan: aPlan({ coins: [BTC], split: split({ BTC: '100' }) }),
      action: action({ kind: 'lump', slot: null, plannedAmount: money('500') }),
      prices: prices({ BTC: '50000' }),
      today: date('2026-01-15'),
      fee: null,
      ids,
      now,
      venue: null,
    });
    expect(draft).toEqual(expect.objectContaining({ kind: 'lump', slot: null, amount: '500', units: '0.01' }));
  });

  it('treats too few ids as a programmer error', () => {
    expect(() =>
      oneTapEntries({
        plan: cycle,
        action: action(),
        prices: null,
        today: date('2026-03-02'),
        fee: null,
        ids: [id()],
        now,
        venue: null,
      }),
    ).toThrow('4 ids needed, 1 given');
  });
});

describe('defaultFee', () => {
  it('is null without fees', () => {
    expect(defaultFee([])).toBeNull();
    expect(defaultFee([anEntry()])).toBeNull();
  });

  it('is the whole fee of the latest transaction that had one, not one entry share', () => {
    const entries = [
      anEntry({ date: date('2026-02-01'), slot: '2026-02' as never, fee: money('2') }),
      anEntry({ date: date('2026-03-02'), slot: '2026-03' as never, fee: money('0.7') }),
      anEntry({ date: date('2026-03-02'), slot: '2026-03' as never, coin: 'ETH' as never, fee: money('0.3') }),
      anEntry({ date: date('2026-03-05'), kind: 'extra', slot: null, fee: null }),
    ];
    expect(defaultFee(entries)).toBe('1');
  });

  it('breaks a same-day tie on the moment the entry was created, and ignores deleted entries', () => {
    const entries = [
      anEntry({
        date: date('2026-03-02'),
        kind: 'extra',
        slot: null,
        fee: money('5'),
        createdAt: instant('2026-03-02T10:00:00+02:00'),
      }),
      anEntry({
        date: date('2026-03-02'),
        kind: 'dca',
        slot: '2026-03' as never,
        fee: money('1.5'),
        createdAt: instant('2026-03-02T09:00:00Z'),
      }),
      anEntry({
        date: date('2026-04-01'),
        slot: '2026-04' as never,
        fee: money('9'),
        deletedAt: instant('2026-04-01T10:00:00Z'),
      }),
    ];
    // 10:00+02:00 is 08:00 UTC, before 09:00Z.
    expect(defaultFee(entries)).toBe('1.5');
  });
});
