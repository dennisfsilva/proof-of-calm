import type { Decimal, Entry, Money } from '@proofofcalm/core';
import { useTranslations } from 'use-intl';

// The estimates an import keeps (docs/DOMAIN.md §3.13 step 5; CONTENT-STYLE §3 "Import an exchange's file"): a month
// whose imported purchases come to less than half of its one-tap estimate keeps the estimate beside them. A fact, never
// an instruction.

type Kept = { readonly estimate: Entry; readonly imported: Money };
/** The sections' words, passed in so this file and the sections do not import each other. */
type Words = {
  readonly money: (amount: Decimal) => string;
  readonly month: (entry: Entry) => string;
  /** The estimate's piece, with its venue. */
  readonly estimate: (entry: Entry) => string;
};

/** One item per estimate kept, in the plan's order. */
export function useKeptItems(items: readonly Kept[], w: Words) {
  const t = useTranslations('settings.data.exchange');
  return items.map(({ estimate, imported }) => ({
    key: `kept-${estimate.id}`,
    text: t('keep', { month: w.month(estimate), estimate: w.estimate(estimate), amount: w.money(imported) }),
  }));
}
