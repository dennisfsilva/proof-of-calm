// The coin editor's value (docs/DOMAIN.md §2.1): the plan's coins in order and each share as typed,
// a decimal string never read through a float. `coinSplit` reads the shares with the formatting locale
// (ADR-0034) and keeps the core's issues of the coins and the split; the screens map codes to copy.
import {
  type Coin,
  type CoinId,
  compare,
  decimalPlaces,
  err,
  isNegative,
  ok,
  type Percent,
  type Plan,
  type PlanIssue,
  planIssues,
  type Result,
  type Split,
  sum,
} from '@proofofcalm/core';
import type { NumberInput, NumberInputError } from '../../../lib/format';

export type CoinSplitValue = {
  readonly coins: readonly Coin[];
  /** The typed text of each coin's share, in percent; empty reads as 0 %. */
  readonly shares: Readonly<Record<CoinId, string>>;
};

/** A share that cannot be read, on its path (`['split', coin]`), as the core's split issues are. */
type ShareIssue = NumberInputError & { readonly path: readonly ['split', CoinId] };
type CountIssue = { readonly code: 'coins-max'; readonly path: readonly ['coins'] };
export type SplitIssue = PlanIssue | ShareIssue | CountIssue;

/**
 * The most coins a plan holds: PlanSchema's `coins` check (packages/core/src/schema/plan.ts:82), which
 * the core exports no constant for and planIssues does not report; a test parses both sides of it.
 */
export const MAX_COINS = 20;

const PATHS: ReadonlySet<unknown> = new Set(['coins', 'split']);

/** The coin at the end with an empty share; a coin already in the plan, or a full plan, changes nothing. */
export function addCoin(value: CoinSplitValue, coin: Coin): CoinSplitValue {
  if (value.coins.length >= MAX_COINS || value.coins.some((current) => current.id === coin.id)) return value;
  return { coins: [...value.coins, coin], shares: { ...value.shares, [coin.id]: '' } };
}

export function removeCoin(value: CoinSplitValue, id: CoinId): CoinSplitValue {
  const { [id]: _dropped, ...shares } = value.shares;
  return { coins: value.coins.filter((coin) => coin.id !== id), shares };
}

export function setShare(value: CoinSplitValue, id: CoinId, text: string): CoinSplitValue {
  return { ...value, shares: { ...value.shares, [id]: text } };
}

/**
 * The value a plan's split opens the editor with: its coins in order and each share written in the formatting
 * locale, as `readShares` reads it back (a de-DE `33.333` as `33,333`, never `33.333`, which reads as 33333).
 */
export const splitValueOf = (plan: Plan, numberInput: NumberInput): CoinSplitValue => ({
  coins: plan.coins,
  shares: Object.fromEntries(
    plan.coins.map((coin) => [coin.id, numberInput.format(plan.split[coin.id] ?? ('0' as Percent), 0)]),
  ) as Record<CoinId, string>,
});

/** A share's most decimals: the core's `PERCENT_DECIMALS` (packages/core/src/schema/plan.ts:144), not exported. */
const SHARE_DECIMALS = 4;

/**
 * The split the value makes with no plan to check it against, the shape a simulation takes, or its
 * issues as `coinSplit` gives them: the shares that cannot be read first (the sum waits for them), then
 * `coins-max`, and the core's checks of a plan's coins and split in its order (planIssues' split
 * checks, which read nothing else of the plan; a test compares the two on every issue).
 */
export function readShares(value: CoinSplitValue, numberInput: NumberInput): Result<Split, SplitIssue[]> {
  const split: Record<CoinId, Percent> = {};
  const unread: ShareIssue[] = [];
  for (const coin of value.coins) {
    const text = (value.shares[coin.id] ?? '').trim();
    const read = text === '' ? ok('0' as Percent) : numberInput.parse<Percent>(text);
    if (read.ok) split[coin.id] = read.value;
    else unread.push({ ...read.error, path: ['split', coin.id] });
  }
  if (unread.length > 0) return err(unread);
  const issues: SplitIssue[] = [];
  if (value.coins.length > MAX_COINS) issues.push({ code: 'coins-max', path: ['coins'] });
  if (new Set(value.coins.map((coin) => coin.id)).size !== value.coins.length) {
    issues.push({ code: 'coins-not-unique', path: ['coins'] });
  }
  const shares = Object.entries(split) as [CoinId, Percent][];
  for (const [coin, share] of shares) {
    if (isNegative(share)) issues.push({ code: 'split-negative', path: ['split', coin] });
    if (decimalPlaces(share) > SHARE_DECIMALS) issues.push({ code: 'split-precision', path: ['split', coin] });
  }
  if (compare(sum(shares.map(([, share]) => share)), '100' as Percent) !== 0) {
    issues.push({ code: 'split-sum', path: ['split'] });
  }
  return issues.length > 0 ? err(issues) : ok(split);
}

/**
 * The coins and the split the value makes, or its issues: `readShares`, then the core's issues on
 * `coins` and `split` for the rest of the plan as it is, so a plan's split stays the core's to judge.
 */
export function coinSplit(
  plan: Plan,
  value: CoinSplitValue,
  numberInput: NumberInput,
): Result<{ coins: Coin[]; split: Split }, SplitIssue[]> {
  const read = readShares(value, numberInput);
  if (!read.ok) return read;
  const coins = [...value.coins];
  const split = read.value;
  const issues: SplitIssue[] = planIssues({ ...plan, coins, split }).filter((issue) => PATHS.has(issue.path[0]));
  return issues.length > 0 ? err(issues) : ok({ coins, split });
}
