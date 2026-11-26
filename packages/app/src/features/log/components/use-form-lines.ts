import {
  type EntityId,
  type Entry,
  type HoldingContext,
  type Instant,
  isPositive,
  MAX_UNIT_DECIMALS,
  type Plan,
} from '@proofofcalm/core';
import { useMemo } from 'react';
import { useTranslations } from 'use-intl';
import type { NumberInput } from '../../../lib/format';
import { useFormatters, useToday } from '../../../lib/services';
import { emptiedFills } from '../lib/dated';
import { changedFields, type FormState, moveShortLines, proseDigits, toDraft } from '../lib/form';
import { freshIds, storedSales } from '../lib/source';
import { namedWarnings, saleWarningKey } from '../lib/warning';

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

/**
 * The entry form's lines before Save, worded, in the column's order: the earlier-date line, each holding warning of a
 * sale, the data line beside them (LEGAL §4), and the first move left short. Null for a line not shown.
 */
export type FormLines = {
  readonly earlier: string | null;
  readonly warnings: readonly { readonly key: string; readonly text: string }[];
  readonly note: string | null;
  readonly moveShort: string | null;
};

/**
 * Words the entry form's lines before Save, read on every change of the typed form. A sale taking more units than are
 * past the holding rule on its date says so, without blocking the save, which replaces every entry edited, so none
 * counts; each sale is read as the save stores it (DOMAIN §3.7). A stored move the save would leave short outside its
 * destination is named too, never refused (DOMAIN §3.7), read on the entries the save stores, so an unchanged Venue
 * field keeps each entry's venue. With no live move stored no save leaves one short, so neither the save nor the move
 * line runs: at the cap they read every entry per keystroke (docs/ENGINEERING.md §4, the Log at the cap).
 */
export function useFormLines(input: FormLinesInput): FormLines {
  const { plan, entries, editing, ids, state, initial, numberInput, holding, now } = input;
  const t = useTranslations();
  const format = useFormatters();
  const today = useToday();
  const moved = useMemo(() => entries.some((entry) => entry.kind === 'move' && entry.deletedAt === null), [entries]);
  const decimalsOf = (coin: Entry['coin']) =>
    state.rows.find((row) => row.coin === coin)?.decimals ?? MAX_UNIT_DECIMALS;
  const drafted = state.kind === 'sell' ? toDraft(state, numberInput) : null;
  const sold = drafted?.ok === true ? drafted.value : null;
  const named =
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
  const warnings = named.map((warning, index) => {
    const decimals = state.rows.find((row) => row.coin === warning.coin)?.decimals ?? 0;
    // Prose figures (DESIGN §5 rule 7): both at the decimals the more precise one needs, the coin named once.
    const digits = proseDigits(decimals, warning.eligible, warning.sold);
    const text = t(saleWarningKey(plan.holdingRule), {
      // None past the rule says so, rather than "Only 0.000 of" (CONTENT-STYLE §3).
      share: isPositive(warning.eligible) ? 'some' : 'none',
      // A coin warned at two venues names each one, so each warning reads apart from the other.
      at: warning.at,
      venue: warning.venue ?? '',
      eligible: numberInput.format(warning.eligible, digits),
      sold: format.units(warning.sold, warning.coin, digits),
      date: format.date(saleDate ?? today),
    });
    return { key: `${warning.coin}-${index}`, text };
  });
  const earlier = emptiedFills(state, initial) ? t('log.form.earlierDate') : null;
  // LEGAL §4: the data line once, beside the holding status.
  const note = warnings.length > 0 ? t('log.holding.note') : null;
  if (!moved) return { earlier, warnings, note, moveShort: null };
  const typed = drafted ?? toDraft(state, numberInput);
  const save = { plan, editing, ids: freshIds(ids, state.rows, editing), now, source: 'manual' as const };
  const [short] = typed.ok
    ? moveShortLines(typed.value, { entries, save: { ...save, initial, current: state }, holding })
    : [];
  const moveShort =
    short === undefined
      ? null
      : t('log.form.movesShort', {
          to: short.to,
          date: format.date(short.date),
          short: format.units(short.short, short.coin, proseDigits(decimalsOf(short.coin), short.short)),
        });
  return { earlier, warnings, note, moveShort };
}
