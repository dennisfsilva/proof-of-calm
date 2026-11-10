// Why a Log row's delete, or its Undo, wrote nothing (docs/DOMAIN.md §6, docs/CONTENT-STYLE.md §3, Delete an entry):
// the toast's title, from the core's refusal and the row the person acted on. A fee refusal names the move the write
// left worse covered by its own date (`uncoveredSale`), or, when the Undo would restore that move itself (`written`),
// the move restored; a row of several entries is counted with the country's figures (CONTENT-STYLE §4).
import { assertNever, type CoverRefusal, type EntryKind, type RestoreRefusal } from '@proofofcalm/core';
import type { useTranslations } from 'use-intl';
import type { Formatters } from '../../../lib/format';
import { figure } from './figure';

/** The Log's words, `log` in the UI language. */
export type LogWords = ReturnType<typeof useTranslations<'log'>>;

/** The count of a row's entries and its figure, for a plural that writes the figure. */
const counted = (f: Formatters, count: number) => ({ count, figure: figure(f, count) });

/**
 * The toast of a delete the core refused. Deleting a row only takes units away, so the move a fee refusal names is
 * never one the delete stores; the row is a purchase or a Coins added entry, since deleting a sale or a move leaves
 * every step as covered as before.
 */
export function deleteRefusalTitle(
  error: CoverRefusal,
  row: { readonly kind: EntryKind; readonly count: number },
  f: Formatters,
  t: LogWords,
): string {
  if (error.code === 'sell-exceeds-held') return t('row.notDeleted', { coin: error.coin });
  return t('row.notDeletedFee', {
    kind: row.kind,
    coin: error.coin,
    date: f.date(error.date),
    ...counted(f, row.count),
  });
}

/** The toast of an Undo the core refused, for a row of `count` entries. */
export function undoRefusalTitle(error: RestoreRefusal, count: number, f: Formatters, t: LogWords): string {
  switch (error.code) {
    case 'changed-since-delete':
      return t('row.notRestoredReplaced', counted(f, count));
    case 'sell-exceeds-held':
      return t('row.notRestoredSold', { coin: error.coin });
    case 'fee-exceeds-held':
      // A move's row holds one entry (DOMAIN §3.9), so a move restored short of its own fee is the whole row.
      return error.written
        ? t('row.notRestoredOwnFee')
        : t('row.notRestoredFee', { coin: error.coin, date: f.date(error.date), ...counted(f, count) });
    case 'too-many-entries':
      return t('row.notRestoredFull', { max: figure(f, error.max), ...counted(f, count) });
    case 'currency-changed':
      return t('row.notRestoredCurrency', { from: error.from, to: error.to, ...counted(f, count) });
    case 'slot-skipped':
    case 'slot-done':
      return t('row.notRestored', {
        reason: error.code === 'slot-skipped' ? 'skipped' : 'recorded',
        month: f.month(error.slot),
        ...counted(f, count),
      });
    default:
      return assertNever(error);
  }
}
