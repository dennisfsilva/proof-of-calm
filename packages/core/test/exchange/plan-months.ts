// Rule M, the oracle of step 5's gate (docs/DOMAIN.md §3.13), written from the rule, not from plan-estimates.ts:
// a coin's live one-tap estimates for a month go when `added` holds a monthly buy of the coin for that month and the
// exchange-imported monthly buys of the coin for it, the Log's live ones and `added`'s, fees excluded, come to at least
// half of each of those estimates. An estimate whose month `added` holds no monthly buy for is not named.
import { compare, type Money, plus, sum } from '../../src/money/decimal';
import { type Entry, isEstimate } from '../../src/schema/entry';
import type { EntityId } from '../../src/schema/ids';

export type Verdict = { readonly go: boolean; readonly imported: Money };

export function ruleM(before: readonly Entry[], added: readonly Entry[]): Map<EntityId, Verdict> {
  const live = before.filter((entry) => entry.deletedAt === null);
  const verdicts = new Map<EntityId, Verdict>();
  for (const estimate of live.filter((entry) => isEstimate(entry) && entry.kind === 'dca')) {
    const same = (entry: Entry) => entry.kind === 'dca' && entry.coin === estimate.coin && entry.slot === estimate.slot;
    if (!added.some(same)) continue;
    const imported = sum(
      [...live, ...added].filter((entry) => same(entry) && entry.source === 'import-csv').map((e) => e.amount as Money),
    );
    const go = live
      .filter((entry) => same(entry) && isEstimate(entry))
      .every((each) => compare(plus(imported, imported), each.amount as Money) >= 0);
    verdicts.set(estimate.id, { go, imported });
  }
  return verdicts;
}

/** The Log as the write leaves it when rule M decides the tombstones: `before`'s estimates that go, then `added`. */
export function storedByRuleM(before: readonly Entry[], added: readonly Entry[], now: Entry['updatedAt']): Entry[] {
  const verdicts = ruleM(before, added);
  return [
    ...before.map((entry) => (verdicts.get(entry.id)?.go === true ? { ...entry, deletedAt: now } : entry)),
    ...added,
  ];
}
