import { decimal, type Entry, isEstimate } from '@proofofcalm/core';
import { useTranslations } from 'use-intl';
import { createNumberInput } from '../../../lib/format';
import { useFormatters } from '../../../lib/services';
import { editedVenues } from '../lib/form';

// The lines above the entry form's rows (docs/CONTENT-STYLE.md §3): how the three-way fill works; for coins added,
// how to type an unknown cost; on an edit of a one-tap row, what the one tap filled and where the exact units are
// (ADR-0003). Its fee and venue sentence holds whether or not the tap copied either, since a stored entry cannot tell
// a copied fee from a typed one. The estimate line names no consequence of saving: only a change of the units clears
// the label (DOMAIN §2.2). A grouped edit at different venues names them, since its Venue field opens empty and a
// venue typed there applies to every entry (DOMAIN §6, Edit a transaction); the entries with none are a count in the
// country's number format (CONTENT-STYLE §4).

export type FormHintsProps = {
  /** The form records coins already held (`held`). */
  readonly added: boolean;
  /** The entries the form opened on; empty for a new transaction. */
  readonly editing: readonly Entry[];
};

export function FormHints({ added, editing }: FormHintsProps) {
  const t = useTranslations('log.form');
  const format = useFormatters();
  const venues = editedVenues(editing);
  return (
    <>
      <p className="text-14 text-ink-2">{t('hint')}</p>
      {added && <p className="text-14 text-ink-2">{t('costHint')}</p>}
      {editing.some(isEstimate) && <p className="text-14 text-ink-2">{t('estimateHint')}</p>}
      {venues !== null && (
        <p className="text-14 text-ink-2">
          {t('venuesHint', {
            named: venues.named.length,
            venues: format.list(venues.named),
            unnamed: venues.unnamed,
            figure: createNumberInput(format.locales.numbers).format(decimal(String(venues.unnamed))),
          })}
        </p>
      )}
    </>
  );
}
