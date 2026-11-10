// The toast after a new transaction is saved on the Log (docs/CONTENT-STYLE.md §3): "Recorded: …" with what was
// recorded and its date. Coins added name their units, and a cost only when one was typed; a move names its units
// sent and its route; a purchase or a sale names its amount, and its coin when there is one.
import { MAX_UNIT_DECIMALS, type Entry, type Plan, recordedAmounts, sum } from '@proofofcalm/core';
import type { Formatters } from '../../../lib/format';
import { proseDigits } from './form';
import type { LogWords } from './row-refusal';

/** The title of the toast for the entries a new transaction saved; '' when none was saved. */
export function recordedTitle(saved: readonly Entry[], plan: Plan, f: Formatters, t: LogWords): string {
  const [first] = saved;
  if (first === undefined) return '';
  const date = f.date(first.date);
  const one = saved.every((entry) => entry.coin === first.coin);
  const units = (entry: Entry) => {
    const decimals = plan.coins.find((coin) => coin.id === entry.coin)?.decimals ?? MAX_UNIT_DECIMALS;
    return f.units(entry.units, entry.coin, proseDigits(decimals, entry.units));
  };
  if (first.kind === 'move') {
    // One move a save; the source with no venue named as the Log's row names it.
    const at = first.venue === null ? 'unnamed' : 'venue';
    return t('recorded.moved', { at, units: units(first), from: first.venue ?? '', to: first.to ?? '', date });
  }
  if (first.kind === 'held') {
    // Coins added name their units, and a cost only when one was typed: none is unknown, not 0 (CONTENT-STYLE §3).
    const held = saved.map(units);
    const cost = first.amount === null ? 'unknown' : 'known';
    const amount = first.amount === null ? '' : f.money(first.amount, plan.payCurrency);
    return one
      ? t('recorded.held.one', { units: held.join(''), cost, amount, date })
      : t('recorded.held.several', { units: f.list(held), date });
  }
  const amount = f.money(sum(recordedAmounts(saved)), plan.payCurrency);
  // A sale says it sold (CONTENT-STYLE §1 rule 2), as the month header does.
  const said = first.kind === 'sell' ? 'recorded.sold' : 'recorded';
  return one ? t(`${said}.one`, { amount, coin: first.coin, date }) : t(`${said}.several`, { amount, date });
}
