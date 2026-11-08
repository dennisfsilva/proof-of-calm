import type { CurrencyCode, Entry, FillField } from '@proofofcalm/core';
import * as z from 'zod/mini';
import type { NumberInput } from '../../../lib/format';
import { withDate } from './dated';
import { editRow, type FormState, FormStateSchema } from './form';
import { fillFrom } from './row';

// The entry form's session draft (ADR-0020 Readings): its key, its base and what a reopened form restores of it.

/**
 * What the drafts adapter keeps of an open form: its text, the form as it opened (so a reopened form tells what was
 * typed from what was a default), the number locale that text was typed in, and its base, what it was typed over
 * (`draftBase`). A draft stored without `opened` fails the schema, and the adapter drops it.
 */
export const EntryFormDraftSchema = z.object({
  numberLocale: z.string(),
  base: z.string(),
  opened: FormStateSchema,
  state: FormStateSchema,
});
export type EntryFormDraft = z.infer<typeof EntryFormDraftSchema>;

/** The drafts entity of a form: a new transaction's kind and month, or the sorted ids of the entries it edits. */
export function draftEntity(opened: FormState, editing: readonly Entry[]): string {
  if (editing.length > 0)
    return editing
      .map((entry) => entry.id as string)
      .sort()
      .join(',');
  return `new:${opened.kind}:${opened.slot ?? 'none'}`;
}

/** What a draft is typed over: each entry an edit opened, with the moment it was last written; '' for a new one. */
export function draftBase(editing: readonly Entry[]): string {
  return editing
    .map((entry) => `${entry.id}@${entry.updatedAt}`)
    .sort()
    .join(',');
}

/** Whether two forms read the same in every field the person can change: a form left as it opened is no draft. */
export function sameForm(a: FormState, b: FormState): boolean {
  const typed = ({ date, fee, venue, note, rows }: FormState) =>
    JSON.stringify([date, fee, venue, note, rows.map((row) => [row.coin, row.amount, row.units, row.price])]);
  return typed(a) === typed(b);
}

type FormRow = FormState['rows'][number];

const FILL_FIELDS = ['amount', 'units', 'price'] as const;
const ONE_ROW: FormState = { kind: 'extra', date: '', slot: null, fee: '', venue: '', note: '', rows: [] };

/** One row typed over `opened`, replayed over `fresh`: the fields the person typed into, then the fill again. */
function replayRow(opened: FormRow, typed: FormRow, fresh: FormRow, numberInput: NumberInput, currency: CurrencyCode) {
  // A derived field was filled, not typed, so it never counts as typed even though its text changed.
  const own = (field: FillField) => typed.derived !== field && typed[field] !== opened[field];
  const text = (field: FillField) => (own(field) ? typed[field] : fresh[field]);
  const derived = typed.derived ?? (fresh.derived !== null && !own(fresh.derived) ? fresh.derived : null);
  const row: FormRow = { ...fresh, amount: text('amount'), units: text('units'), price: text('price'), derived };
  if (derived === null) {
    // Nothing was derived when the draft was kept (no live price yet, say): the fill runs from each field the person
    // typed, as the live form runs it, and the first that leaves every typed text as typed is kept.
    const typedFields = FILL_FIELDS.filter(own);
    for (const field of typedFields) {
      const filled = fillFrom(row, field, row[field], numberInput, currency);
      const kept = typedFields.every((each) => row[each].trim() === '' || filled[each] === row[each]);
      if (filled.derived !== null && kept) return filled;
    }
    return row;
  }
  // Where no fill backs the derived field, it shows what the draft showed only over the same two sources, else nothing.
  const same = FILL_FIELDS.every((field) => field === derived || row[field] === typed[field]);
  const shown = { ...row, [derived]: same ? typed[derived] : '' };
  const source = derived === 'units' ? 'price' : 'units';
  const [filled] = editRow({ ...ONE_ROW, rows: [shown] }, 0, source, shown[source], numberInput, currency).rows;
  return filled ?? row;
}

/**
 * The form as it opens now (`fresh`) with what the person typed over the form as it opened (`opened`): the date,
 * fee, venue and note they changed, and per row the amount, units and price they typed into, each row filled again
 * by the three-way fill. Every field they left alone takes its value now, so a plan amount or a live price changed
 * since is never frozen into the draft (ADR-0020 Readings). The rows are the same coins in the same order.
 */
export function replayTyped(
  opened: FormState,
  typed: FormState,
  fresh: FormState,
  numberInput: NumberInput,
  currency: CurrencyCode,
): FormState {
  const pick = (field: 'date' | 'fee' | 'venue' | 'note') => (typed[field] !== opened[field] ? typed : fresh)[field];
  const rows = fresh.rows.map((row, at) => {
    const [was, now] = [opened.rows[at], typed.rows[at]];
    return was === undefined || now === undefined ? row : replayRow(was, now, row, numberInput, currency);
  });
  return { ...fresh, date: pick('date'), fee: pick('fee'), venue: pick('venue'), note: pick('note'), rows };
}

/** What the form opens with now, against which a draft is restored, and how its numbers read and fill. */
export type DraftFit = {
  readonly numberLocale: string;
  readonly base: string;
  readonly initial: FormState;
  readonly numberInput: NumberInput;
  readonly currency: CurrencyCode;
};

const coinsOf = (state: FormState): string => state.rows.map((row) => row.coin).join(',');

/**
 * What a draft typed, replayed over the form as it opens now (`replayTyped`), while it still fits: typed in this
 * number locale (another would read it otherwise), over the entries as stored now (a field the person left alone
 * never brings back a value written over since), with the coins the form opens with (a coin the plan dropped would
 * be refused at every save), and changing something. None otherwise. Its filled prices follow its date (`withDate`).
 */
export function restoredState(draft: EntryFormDraft | null, fit: DraftFit): FormState | null {
  if (draft === null || draft.numberLocale !== fit.numberLocale || draft.base !== fit.base) return null;
  const { opened, state } = draft;
  if (sameForm(opened, state) || coinsOf(state) !== coinsOf(fit.initial) || coinsOf(opened) !== coinsOf(state))
    return null;
  const replayed = replayTyped(opened, state, fit.initial, fit.numberInput, fit.currency);
  return withDate(replayed, replayed.date, fit.initial, fit.numberInput, fit.currency);
}
