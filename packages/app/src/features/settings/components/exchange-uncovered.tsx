import type { Decimal, Uncovered } from '@proofofcalm/core';
import { IMPORT_MATCH_DAYS } from '@proofofcalm/core';
import { useTranslations } from 'use-intl';
import type { useFormatters } from '../../../lib/services';

// The uncovered line (docs/DOMAIN.md §3.13, the sales a guard reaches; CONTENT-STYLE §3 "Import an exchange's file"):
// a sale left out because it is dated within the reach of the starting amount or of a Coins added entry, and the
// person's own entries and the file hold less of its coin up to that date than it sells. A fact, never an instruction.

/** The summary's words (`useWords`), passed in so this file and the sections do not import each other. */
type Words = {
  readonly format: ReturnType<typeof useFormatters>;
  readonly figure: (value: number) => string;
  readonly units: (coin: string, value: Decimal, others?: readonly Decimal[]) => string;
  readonly money: (amount: Decimal) => string;
};

/** One left-out item per uncovered sale, in date order; a held reach's units share their places with the sale's. */
export function useUncoveredItems(items: readonly Uncovered[], w: Words) {
  const t = useTranslations('settings.data.exchange.leftOut');
  return items.map(({ id, coin, date, units, amount, reach }) => {
    const peers = reach.kind === 'held' ? [reach.units] : [];
    const text = t('uncovered', {
      coin,
      units: w.units(coin, units, peers),
      amount: w.money(amount),
      date: w.format.date(date),
      reach: reach.kind,
      through: reach.kind === 'starting' ? w.format.date(reach.through) : '',
      // The cut-off is the first buy day plus the import's match window (DOMAIN §3.13 step 3).
      days: w.figure(IMPORT_MATCH_DAYS),
      heldUnits: reach.kind === 'held' ? w.units(coin, reach.units, [units]) : '',
      heldDate: reach.kind === 'held' ? w.format.date(reach.date) : '',
    });
    return { key: `uncovered-${id}`, text };
  });
}
