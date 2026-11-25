import type { CalendarDate, EntityId, Entry, HoldingContext, Instant, MoveShortfall, Plan } from '@proofofcalm/core';
import { useMemo } from 'react';
import type { NumberInput } from '../../../lib/format';
import { changedFields, type FormState, moveShortLines, toDraft } from '../lib/form';
import { freshIds, storedSales } from '../lib/source';
import { type NamedWarning, namedWarnings } from '../lib/warning';

/** What the entry form's lines before Save read: the stored entries, the form as opened and as typed, its ids. */
export type FormLinesInput = {
  readonly plan: Plan;
  readonly entries: readonly Entry[];
  readonly editing: readonly Entry[];
  /** The ids the form made as it mounted, one per row. */
  readonly ids: readonly EntityId[];
  readonly state: FormState;
  readonly initial: FormState;
  readonly numberInput: NumberInput;
  readonly holding: HoldingContext;
  readonly now: Instant;
};

/** The holding warnings of a sale, the date they are read on (null while none can be), and the first move left short. */
export type FormLines = {
  readonly warnings: NamedWarning[];
  readonly saleDate: CalendarDate | null;
  readonly moveShort: MoveShortfall | undefined;
};

/**
 * The entry form's lines before Save, read on every change of the typed form. A sale taking more units than are past
 * the holding rule on its date says so, without blocking the save, which replaces every entry edited, so none counts;
 * each sale is read as the save stores it (DOMAIN §3.7). A stored move the save would leave short outside its
 * destination is named too, never refused (DOMAIN §3.7), read on the entries the save stores, so an unchanged Venue
 * field keeps each entry's venue. With no live move stored no save leaves one short, so neither the save nor the move
 * line runs: at the cap they read every entry per keystroke (docs/ENGINEERING.md §4, the Log at the cap).
 */
export function useFormLines(input: FormLinesInput): FormLines {
  const { plan, entries, editing, ids, state, initial, numberInput, holding, now } = input;
  const moved = useMemo(() => entries.some((entry) => entry.kind === 'move' && entry.deletedAt === null), [entries]);
  const drafted = state.kind === 'sell' ? toDraft(state, numberInput) : null;
  const sold = drafted?.ok === true ? drafted.value : null;
  const warnings =
    sold === null
      ? []
      : namedWarnings(
          plan,
          entries,
          storedSales(sold, state.rows, editing, ids, changedFields(initial, state).venue, now),
          sold.date,
          holding,
          editing.map((entry) => entry.id),
        );
  const saleDate = sold?.date ?? null;
  if (!moved) return { warnings, saleDate, moveShort: undefined };
  const typed = drafted ?? toDraft(state, numberInput);
  const save = { plan, editing, ids: freshIds(ids, state.rows, editing), now, source: 'manual' as const };
  const [moveShort] = typed.ok
    ? moveShortLines(typed.value, { entries, save: { ...save, initial, current: state }, holding })
    : [];
  return { warnings, saleDate, moveShort };
}
