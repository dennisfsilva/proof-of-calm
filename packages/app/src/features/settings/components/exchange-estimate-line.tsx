import type { Decimal, EstimateLine, Money } from '@proofofcalm/core';
import { sum } from '@proofofcalm/core';
import { useTranslations } from 'use-intl';
import type { useFormatters } from '../../../lib/services';

// The estimate line (docs/DOMAIN.md §3.13, "Lines that ask for a change"; CONTENT-STYLE §3 "Import an exchange's
// file"): a Log row of one-tap estimates the file leaves while its purchase made after the month's reach counts for
// another month or as an extra buy. The line names the row's coins, the file's pieces on that date and the change.

/** The summary's words (`useWords`), passed in so this file and the sections do not import each other. */
type Words = {
  readonly format: ReturnType<typeof useFormatters>;
  readonly units: (coin: string, value: Decimal) => string;
  readonly money: (amount: Decimal) => string;
};

/** One sentence per estimate line, each naming every staying coin's purchases on the date, summed. */
export function useEstimateLines(lines: readonly EstimateLine[], w: Words) {
  const t = useTranslations('settings.data.exchange');
  return lines.map((line) => {
    const pieces = line.estimates.map(({ coin }) => {
      const added = line.added.filter((entry) => entry.coin === coin);
      return t('estimatePiece', {
        units: w.units(coin, sum(added.map((entry) => entry.units))),
        amount: w.money(sum(added.map((entry) => entry.amount as Money))),
      });
    });
    const text = t('estimateLeft', {
      coins: w.format.list(line.estimates.map((entry) => entry.coin)),
      count: line.estimates.length,
      month: w.format.month(line.month),
      pieces: w.format.list(pieces),
      date: w.format.date(line.date),
      kind: line.other === null ? 'extra' : 'dca',
      other: line.other === null ? '' : w.format.month(line.other),
    });
    return { key: line.estimates.map((entry) => entry.id).join(), text };
  });
}
