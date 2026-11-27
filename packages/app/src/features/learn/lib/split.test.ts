import { type Coin, type CoinId, type Plan, PlanSchema } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { createNumberInput } from '../../../lib/format';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { addCoin, type CoinSplitValue, coinSplit, MAX_COINS, removeCoin, setShare } from './split';

// The coin editor's value: the plan's coins and the shares as typed. The split is read with the
// formatting locale (ADR-0034) and checked by the core's invariants (docs/DOMAIN.md §2.1).

const plan = fixtureSnapshot().plan as Plan;
const [BTC, ETH] = plan.coins as [Coin, Coin];
const SOL = { id: 'SOL', name: 'Solana', geckoId: 'solana', decimals: 4 } as Coin;
const id = (text: string) => text as CoinId;
const english = createNumberInput('en-GB');
const value: CoinSplitValue = { coins: [BTC, ETH], shares: { [id('BTC')]: '70', [id('ETH')]: '30' } };
/** `count` coins C0, C1, … sharing 100 % in whole percents, the first taking the remainder. */
const many = (count: number): CoinSplitValue => {
  const coins = Array.from({ length: count }, (_, n) => ({ ...SOL, id: id(`C${n}`), name: `Coin ${n}` }));
  const each = Math.floor(100 / count);
  const shares = Object.fromEntries(
    coins.map((coin, n) => [coin.id, String(n === 0 ? 100 - each * (count - 1) : each)]),
  );
  return { coins, shares };
};

describe('the value', () => {
  it('adds a coin with an empty share, and adding a coin already present changes nothing', () => {
    const added = addCoin(value, SOL);
    expect(added.coins.map((coin) => coin.id)).toEqual(['BTC', 'ETH', 'SOL']);
    expect(added.shares[id('SOL')]).toBe('');
    expect(addCoin(value, BTC)).toBe(value);
  });

  it('the plan holds at most 20 coins, as the plan schema does: adding a 21st changes nothing', () => {
    expect(MAX_COINS).toBe(20);
    const full = many(MAX_COINS);
    expect(addCoin(full, BTC)).toBe(full);
    const split = (v: CoinSplitValue) => v.shares as Plan['split'];
    expect(PlanSchema.safeParse({ ...plan, coins: full.coins, split: split(full) }).success).toBe(true);
    const over = many(MAX_COINS + 1);
    expect(PlanSchema.safeParse({ ...plan, coins: over.coins, split: split(over) }).success).toBe(false);
  });

  it('removing a coin drops its share', () => {
    const removed = removeCoin(value, id('ETH'));
    expect(removed.coins).toEqual([BTC]);
    expect(removed.shares).toEqual({ BTC: '70' });
  });

  it('sets the typed share of one coin', () => {
    expect(setShare(value, id('ETH'), '30,5').shares).toEqual({ BTC: '70', ETH: '30,5' });
  });
});

describe('coinSplit', () => {
  it('reads the shares into the coins and the split', () => {
    expect(coinSplit(plan, value, english)).toEqual({
      ok: true,
      value: { coins: [BTC, ETH], split: { BTC: '70', ETH: '30' } },
    });
  });

  it('shares off 100 give the split-sum issue on the split', () => {
    const result = coinSplit(plan, setShare(value, id('ETH'), '20'), english);
    expect(result).toEqual({ ok: false, error: [{ code: 'split-sum', path: ['split'] }] });
  });

  it('5 decimals give split-precision on the share', () => {
    const shares = { [id('BTC')]: '70.00001', [id('ETH')]: '29.99999' };
    const result = coinSplit(plan, { ...value, shares }, english);
    expect(result).toEqual({
      ok: false,
      error: [
        { code: 'split-precision', path: ['split', 'BTC'] },
        { code: 'split-precision', path: ['split', 'ETH'] },
      ],
    });
  });

  it('a comma decimal reads in a comma locale', () => {
    const shares = { [id('BTC')]: '70,5', [id('ETH')]: '29,5' };
    expect(coinSplit(plan, { ...value, shares }, createNumberInput('pt-PT'))).toEqual({
      ok: true,
      value: { coins: [BTC, ETH], split: { BTC: '70.5', ETH: '29.5' } },
    });
  });

  it('an empty share reads as 0 %, so the coin stays in the plan', () => {
    const result = coinSplit(plan, addCoin(value, SOL), english);
    expect(result).toEqual({
      ok: true,
      value: { coins: [BTC, ETH, SOL], split: { BTC: '70', ETH: '30', SOL: '0' } },
    });
  });

  it('a share that cannot be read is an issue on that share, and the sum waits for it', () => {
    const result = coinSplit(plan, setShare(value, id('ETH'), '-30'), english);
    expect(result).toEqual({ ok: false, error: [{ code: 'number-negative', path: ['split', 'ETH'] }] });
    const invalid = coinSplit(plan, setShare(value, id('ETH'), 'thirty'), english);
    expect(invalid).toEqual({
      ok: false,
      error: [{ code: 'number-invalid', example: '1,234.56', path: ['split', 'ETH'] }],
    });
  });

  it('more coins than the plan holds give the coins-max issue on the coins', () => {
    expect(coinSplit(plan, many(MAX_COINS), english).ok).toBe(true);
    expect(coinSplit(plan, many(MAX_COINS + 1), english)).toEqual({
      ok: false,
      error: [{ code: 'coins-max', path: ['coins'] }],
    });
  });

  it('keeps only the issues of the coins and the split', () => {
    const unfunded = { ...plan, monthlyAmount: '0', startingAmount: '0' } as Plan;
    expect(coinSplit(unfunded, value, english).ok).toBe(true);
  });
});
