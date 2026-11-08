import { CalendarDateSchema, type CurrencyCode } from '@proofofcalm/core';
import type { NumberInput } from '../../../lib/format';
import type { FormState } from './form';
import { type FormRow, fillFrom } from './row';

// The price a new purchase opens with is the opening day's: an earlier date empties it (ADR-0034 Readings).

/**
 * Whether `row`'s price is still the one the form opened with (`opened`): not derived, an opened price to fill, and
 * the same text or none. A price typed as the opened text counts as the fill, and a cleared one is filled again once
 * the date is the opening day or later.
 */
export function isFilledPrice(row: FormRow, opened: FormRow | undefined): boolean {
  if (opened === undefined || row.derived === 'price' || opened.price === '') return false;
  return row.price === opened.price || row.price === '';
}

/** A new purchase with a full date: the dates its filled prices follow. A sale's and an edit's prices are their own. */
const follows = (initial: FormState, date: string): boolean =>
  initial.kind !== 'sell' &&
  initial.rows.every((row) => row.source === null) &&
  CalendarDateSchema.safeParse(date).success;

/**
 * The form at `date`. Before the opening day (`initial.date`) every filled price is emptied with the field derived
 * from it, its marker kept; directly, since an edit to '' pauses the fill. On the opening day or later an emptied
 * price is the opened one again, and the fill runs from it, unless that would change a field the person typed.
 */
export function withDate(
  state: FormState,
  date: string,
  initial: FormState,
  numberInput: NumberInput,
  currency: CurrencyCode,
): FormState {
  if (!follows(initial, date)) return { ...state, date };
  const rows = state.rows.map((row, at) => {
    const opened = initial.rows[at];
    if (opened === undefined || !isFilledPrice(row, opened)) return row;
    if (date < initial.date)
      return row.derived === null ? { ...row, price: '' } : { ...row, price: '', [row.derived]: '' };
    if (row.price !== '') return row;
    const filled = fillFrom({ ...row }, 'price', opened.price, numberInput, currency);
    const kept = (['amount', 'units'] as const).every(
      (f) => f === row.derived || row[f] === '' || filled[f] === row[f],
    );
    return kept ? filled : { ...row, price: opened.price };
  });
  return { ...state, date, rows };
}

/** Whether the date is before the opening day and a filled price is still emptied, so the form says what to type. */
export function emptiedFills(state: FormState, initial: FormState): boolean {
  if (!follows(initial, state.date) || state.date >= initial.date) return false;
  return state.rows.some((row, at) => row.price === '' && isFilledPrice(row, initial.rows[at]));
}
