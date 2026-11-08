import { type Entry, isEstimate } from '@proofofcalm/core';
import { useTranslations } from 'use-intl';

// The lines above the entry form's rows (docs/CONTENT-STYLE.md §3): how the three-way fill works; for coins added,
// how to type an unknown cost; on an edit of a one-tap row, what the one tap filled and where the exact units are
// (ADR-0003). Its fee and venue sentence holds whether or not the tap copied either, since a stored entry cannot tell
// a copied fee from a typed one. The estimate line names no consequence of saving: only a change of the units clears
// the label (DOMAIN §2.2).

export type FormHintsProps = {
  /** The form records coins already held (`held`). */
  readonly added: boolean;
  /** The entries the form opened on; empty for a new transaction. */
  readonly editing: readonly Entry[];
};

export function FormHints({ added, editing }: FormHintsProps) {
  const t = useTranslations('log.form');
  return (
    <>
      <p className="text-14 text-ink-2">{t('hint')}</p>
      {added && <p className="text-14 text-ink-2">{t('costHint')}</p>}
      {editing.some(isEstimate) && <p className="text-14 text-ink-2">{t('estimateHint')}</p>}
    </>
  );
}
