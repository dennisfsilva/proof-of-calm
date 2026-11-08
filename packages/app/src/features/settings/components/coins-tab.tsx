import { COINS } from '@proofofcalm/content';
import type { Coin, CoinId, Percent, Plan, Split } from '@proofofcalm/core';
import type { NumberInput } from '../../../lib/format';
import { CoinEditor, type CoinSplitValue, coinSplit, type SplitIssue } from '../../plan';
import type { PlanEdit } from '../actions';
import { PlanTabForm, same, type TabProps, tidy } from './plan-form';

// Settings' Coins & split tab: the coin editor over the plan and the coin catalogue (docs/DOMAIN.md §6 "Edit
// the plan"). The coins and the split are one change: either one changed sends both.

const PATHS: ReadonlySet<unknown> = new Set(['coins', 'split']);
const ZERO = '0' as Percent;

const toValue = (plan: Plan, numberInput: NumberInput): CoinSplitValue => ({
  coins: plan.coins,
  shares: Object.fromEntries(
    plan.coins.map((coin) => [coin.id, numberInput.format(plan.split[coin.id] ?? ZERO, 0)]),
  ) as Record<CoinId, string>,
});

const changed = (fields: { coins: Coin[]; split: Split }, opened: Plan): PlanEdit => {
  const unchanged =
    fields.coins.length === opened.coins.length &&
    fields.coins.every(
      (coin, at) =>
        coin.id === opened.coins[at]?.id && same(fields.split[coin.id] ?? ZERO, opened.split[coin.id] ?? ZERO),
    );
  return unchanged ? {} : fields;
};

const tidied = (value: CoinSplitValue, numberInput: NumberInput): CoinSplitValue => ({
  ...value,
  shares: Object.fromEntries(
    value.coins.map((coin) => [coin.id, tidy(value.shares[coin.id] ?? '', numberInput, 0)]),
  ) as Record<CoinId, string>,
});

export function CoinsTab({ onImport }: TabProps) {
  return (
    <PlanTabForm<CoinSplitValue, { coins: Coin[]; split: Split }, SplitIssue>
      onImport={onImport}
      toValue={toValue}
      read={coinSplit}
      changed={changed}
      tidy={tidied}
      paths={PATHS}
      editor={({ plan: _plan, ...editor }) => <CoinEditor catalogue={COINS} {...editor} />}
    />
  );
}
