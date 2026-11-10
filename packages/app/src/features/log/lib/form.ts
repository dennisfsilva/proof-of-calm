import {
  type ActionError,
  type CalendarDate,
  CalendarDateSchema,
  type CoinId,
  type CurrencyCode,
  coinsWithEntries,
  compare,
  type Decimal,
  decimalPlaces,
  defaultFee,
  type Entry,
  err,
  type FillField,
  focusSlot,
  type HoldingContext,
  heldUnits,
  isNegative,
  isPositive,
  lastVenue,
  liveEntries,
  MAX_UNIT_DECIMALS,
  MINOR_UNITS,
  type Money,
  type MonthKey,
  MonthKeySchema,
  type MoveShortfall,
  minus,
  movesLeftShort,
  ok,
  type Plan,
  PRICE_FIGURES,
  type Price,
  type PriceSnapshot,
  plannedParts,
  priceOf,
  quotientSignificant,
  type Result,
  roundSignificant,
  type SaveContext,
  saveTransaction,
  slotStatuses,
  sum,
  type TransactionDraft,
  type TransactionKind,
  TransactionKindSchema,
  type Units,
  unitsFor,
} from '@proofofcalm/core';
import * as z from 'zod/mini';
import { type ErrorMessage, errorMessage } from '../../../lib/errors';
import type { Formatters, NumberInput, NumberInputError } from '../../../lib/format';
import { figure } from './figure';
import { type FormRow, FormRowSchema, fillFrom, positive, read } from './row';
import { rowSource } from './source';

// The entry form's state as typed text, and the pure steps between it and a draft (ADR-0034).

/** The form as typed; a session draft stores it (ADR-0020), so the schema reads it back. */
export const FormStateSchema = z.readonly(
  z.object({
    kind: TransactionKindSchema,
    /** The date input's text: '' when cleared or partly typed, so `toDraft` reads it (ADR-0034). */
    date: z.string(),
    slot: z.nullable(MonthKeySchema),
    fee: z.string(),
    venue: z.string(),
    note: z.string(),
    rows: z.readonly(z.array(FormRowSchema)),
  }),
);
export type FormState = z.infer<typeof FormStateSchema>;

export type FormContext = {
  readonly plan: Plan;
  readonly entries: readonly Entry[];
  readonly today: CalendarDate;
  readonly prices: PriceSnapshot | null;
  readonly numberInput: NumberInput;
};

export type FieldIssue = { readonly field: string; readonly error: NumberInputError | 'date-invalid' };

const decimalsOf = (plan: Plan, coin: CoinId): number =>
  plan.coins.find((each) => each.id === coin)?.decimals ?? MAX_UNIT_DECIMALS;

function emptyRow(plan: Plan, coin: CoinId): FormRow {
  return { source: null, coin, decimals: decimalsOf(plan, coin), amount: '', units: '', price: '', derived: null };
}

/**
 * A buy row at the live price, with its units derived when an amount is planned, so a new amount recomputes them
 * and never the price; a sale's price is the person's own. A price derived from another currency carries every
 * digit of the division, so it is rounded half-even at PRICE_FIGURES significant figures, or at the currency's
 * minor unit when that keeps more (a coin under a cent never fills as 0), and the units come from the price the
 * field shows.
 */
function buyRow(coin: CoinId, amount: Money | null, ctx: FormContext): FormRow {
  const { plan, prices, numberInput } = ctx;
  const row = { ...emptyRow(plan, coin), amount: amount === null ? '' : numberInput.format(amount, 2) };
  const live = priceOf(prices, coin, plan);
  if (live === null) return row;
  const price = roundSignificant(live, PRICE_FIGURES, MINOR_UNITS[plan.payCurrency], 'half-even');
  const priced = { ...row, price: numberInput.format(price, MINOR_UNITS[plan.payCurrency]) };
  if (amount === null || !isPositive(amount)) return priced;
  return { ...priced, units: numberInput.format(unitsFor(amount, price, row.decimals)), derived: 'units' };
}

function plannedRows(kind: 'dca' | 'lump', ctx: FormContext): FormRow[] {
  const total = kind === 'dca' ? ctx.plan.monthlyAmount : ctx.plan.startingAmount;
  return plannedParts(ctx.plan, total).map(({ coin, amount }) => buyRow(coin, amount, ctx));
}

/**
 * A grouped edit's venues when its entries' differ: the named ones in the entries' order, and how many name none; null
 * when every entry has the same venue, or none.
 */
export function editedVenues(editing: readonly Entry[]): { named: string[]; unnamed: number } | null {
  if (new Set(editing.map((entry) => entry.venue)).size < 2) return null;
  const named = editing.flatMap((entry) => (entry.venue === null ? [] : [entry.venue]));
  return { named: [...new Set(named)], unnamed: editing.length - named.length };
}

/** An edit's values; its price is implied by the stored amount and units, at the significant figures fillRow keeps. */
function editedState(editing: readonly Entry[], ctx: FormContext): FormState {
  // The Log opens a move row's Edit on the move sheet, never in this form, so an edit's first entry is a purchase or a sale.
  const [first] = editing as readonly [Entry & { kind: TransactionKind }, ...Entry[]];
  const { plan, numberInput } = ctx;
  const fees = editing.flatMap((entry) => (entry.fee === null ? [] : [entry.fee]));
  const rows = editing.map((entry): FormRow => {
    const price =
      entry.amount !== null && isPositive(entry.units)
        ? numberInput.format(
            quotientSignificant<Price>(
              entry.amount,
              entry.units,
              PRICE_FIGURES,
              MINOR_UNITS[plan.payCurrency],
              'half-even',
            ),
            MINOR_UNITS[plan.payCurrency],
          )
        : '';
    return {
      ...emptyRow(plan, entry.coin),
      source: entry.id,
      amount: entry.amount === null ? '' : numberInput.format(entry.amount, 2),
      units: numberInput.format(entry.units),
      price,
      derived: 'price',
    };
  });
  return {
    kind: first.kind,
    date: first.date,
    slot: first.slot,
    fee: fees.length === 0 ? '' : numberInput.format(sum(fees), 2),
    // Entries at different venues open the field empty, so it never reads as if all were at the first one's.
    venue: editedVenues(editing) === null ? (first.venue ?? '') : '',
    note: first.note,
    rows,
  };
}

/**
 * A new transaction's defaults (the focus slot, the last fee and venue, the planned parts), or an edit's values. Coins
 * added (`held`) open with no date, venue, fee or price, since none can be assumed (DOMAIN §2.2), and their venue is
 * never another transaction's default.
 */
export function initialState(
  kind: TransactionKind,
  editing: readonly Entry[],
  slot: MonthKey | undefined,
  ctx: FormContext,
): FormState {
  if (editing.length > 0) return editedState(editing, ctx);
  const { plan, entries, today, numberInput } = ctx;
  const live = liveEntries(entries);
  const fee = defaultFee(live);
  const venue = lastVenue(live) ?? '';
  if (kind === 'held') {
    const rows = plan.coins.map((coin) => emptyRow(plan, coin.id));
    return { kind, date: '', slot: null, fee: '', venue: '', note: '', rows };
  }
  // Every held coin in the portfolio's order (DOMAIN §3.6), as saveTransaction accepts; with nothing held the
  // plan's coins, so a sale typed anyway meets the save's sell-exceeds-held message rather than an empty form.
  const held = coinsWithEntries(plan, live).filter((coin) => isPositive(heldUnits(live, coin)));
  const sellable = held.length > 0 ? held : plan.coins.map((coin) => coin.id);
  const rows =
    kind === 'dca' || kind === 'lump'
      ? plannedRows(kind, ctx)
      : kind === 'sell'
        ? sellable.map((coin) => emptyRow(plan, coin))
        : plan.coins.map((coin) => buyRow(coin.id, null, ctx));
  return {
    kind,
    date: today,
    slot: kind === 'dca' ? (slot ?? focusSlot(slotStatuses(plan, live, today), today)?.key ?? null) : null,
    fee: fee === null ? '' : numberInput.format(fee, 2),
    venue,
    note: '',
    rows,
  };
}

/** One field of one row typed, and that row filled again (`fillFrom`); the other rows are kept as they are. */
export function editRow(
  state: FormState,
  index: number,
  field: FillField,
  typed: string,
  numberInput: NumberInput,
  currency: CurrencyCode,
): FormState {
  const rows = state.rows.map((row, at) => (at === index ? fillFrom(row, field, typed, numberInput, currency) : row));
  return { ...state, rows };
}

/**
 * The typed text read into a draft for `saveTransaction`, or every field it cannot read. A derived field its two
 * sources do not both back (one reads as empty, zero or unreadable) never reaches a save. Derived units: when they
 * read as positive the row passes them without its amount, else it passes its amount beside them. A derived amount:
 * when it reads as positive the row passes it without its units, else it passes the units alone. Either way the save
 * refuses the row (`amount-and-units`) as it refuses one field alone, rather than skipping a row the person sees
 * filled, and skips it only when nothing shows. Units that round to 0 read as none to the save, so they never take
 * the amount's place.
 */
export function toDraft(state: FormState, numberInput: NumberInput): Result<TransactionDraft, FieldIssue[]> {
  const issues: FieldIssue[] = [];
  const date = CalendarDateSchema.safeParse(state.date);
  if (!date.success) issues.push({ field: 'date', error: 'date-invalid' });
  const parse = <T extends Money | Units>(typed: string, field: string): T | null => {
    if (typed.trim() === '') return null;
    const parsed = numberInput.parse<T>(typed);
    if (parsed.ok) return parsed.value;
    issues.push({ field, error: parsed.error });
    return null;
  };
  const rows = state.rows.map((row, at) => {
    const amount = parse<Money>(row.amount, `rows.${at}.amount`);
    const units = parse<Units>(row.units, `rows.${at}.units`);
    const { coin, derived, source: entry } = row;
    const other = derived === 'units' ? amount : units;
    if (derived === null || derived === 'price' || (positive(other) && positive(read<Price>(row.price, numberInput)))) {
      return { coin, entry, amount, units };
    }
    if (derived === 'units') return { coin, entry, amount: positive(units) ? null : amount, units };
    return positive(amount) ? { coin, entry, amount, units: null } : { coin, entry, amount: null, units };
  });
  const fee = parse<Money>(state.fee, 'fee');
  if (!date.success || issues.length > 0) return err(issues);
  const venue = state.venue.trim();
  const { kind, slot } = state;
  return ok({ kind, date: date.data, slot, fee, note: state.note.trim(), venue: venue === '' ? null : venue, rows });
}

/**
 * The transaction-wide fields an edit changed: the form shows a grouped row's first note, its fees summed, and its venue
 * when all its entries share one (else none).
 */
export type EditedFields = { readonly fee: boolean; readonly venue: boolean; readonly note: boolean };

/** Which of the fee, venue and note the person changed since the form opened, read as `toDraft` reads them. */
export function changedFields(initial: FormState, current: FormState): EditedFields {
  const changed = (field: 'fee' | 'venue' | 'note') => initial[field].trim() !== current[field].trim();
  return { fee: changed('fee'), venue: changed('venue'), note: changed('note') };
}

/** What `keepUnchanged` reads beside the saved entries: the form as saved, its draft and the entries it edited. */
export type SavedEdit = {
  readonly current: FormState;
  readonly draft: TransactionDraft;
  readonly editing: readonly Entry[];
  readonly changed: EditedFields;
};

/** A row the save keeps, as `rowsOrError` reads it: coins held may have no cost, or a cost of 0 (DOMAIN §6). */
const filled = (kind: TransactionDraft['kind'], { amount, units }: TransactionDraft['rows'][number]): boolean =>
  units !== null &&
  isPositive(units) &&
  (kind === 'held' ? amount === null || !isNegative(amount) : amount !== null && isPositive(amount));

/**
 * The entries `saveTransaction` returned for `draft` with every field the person left unchanged taken from the
 * entry each row was loaded from (its source), so an edit of a row that groups several saves keeps each one's venue,
 * note and fee (DOMAIN §6). The save keeps a row's own entry, and gives a row without one (its coin changed) an
 * unused entry of its coin or a fresh one (`rowEntries`), so the source follows the row, never the saved id: the
 * save returns one entry per filled row in the draft's order, then the soft-deleted entries no row took, which stay as
 * it returned them. A row added in the edit has no source and gets no fee while the fee is unchanged; a changed field
 * stays as `saveTransaction` set it on every entry, the fee split by amount. An amount or units equal in value to the source's keep the text it stored
 * (DOMAIN §2.2), which the number input reads back without its trailing zeros. A new transaction (nothing being
 * edited) is given back as saved, its prefilled fee kept.
 */
export function keepUnchanged(saved: readonly Entry[], { current, draft, editing, changed }: SavedEdit): Entry[] {
  if (editing.length === 0) return [...saved];
  const sources = draft.rows.flatMap((row, at) =>
    filled(draft.kind, row) ? [rowSource(editing, current.rows[at])] : [],
  );
  const stored = <T extends Money | Units | null>(value: T, before: T | undefined): T =>
    value !== null && before !== undefined && before !== null && compare(value, before) === 0 ? before : value;
  return saved.map((entry, at) => {
    if (at >= sources.length) return entry;
    const source = sources[at];
    return {
      ...entry,
      amount: stored(entry.amount, source?.amount),
      units: stored(entry.units, source?.units),
      ...(changed.fee ? {} : { fee: source?.fee ?? null }),
      ...(changed.venue || source === undefined ? {} : { venue: source.venue }),
      ...(changed.note || source === undefined ? {} : { note: source.note }),
    };
  });
}

/** What a save reads beside the stored entries and the draft: the save's context and the form as opened and as saved. */
export type FormSave = Omit<SaveContext, 'entries'> & { readonly initial: FormState; readonly current: FormState };

/**
 * The entries to store for `draft`, saved on the entries as stored when the store's queue runs it, with what an edit
 * left unchanged kept; null when an entry being edited is no longer live (another tab deleted it), so a save never
 * brings it back.
 */
export function saveOn(
  entries: readonly Entry[],
  draft: TransactionDraft,
  { initial, current, ...context }: FormSave,
): Result<Entry[], ActionError> | null {
  const live = context.editing.map((each) => entries.find((entry) => entry.id === each.id && entry.deletedAt === null));
  if (!live.every((entry): entry is Entry => entry !== undefined)) return null;
  const saved = saveTransaction(draft, { ...context, entries, editing: live });
  if (!saved.ok) return saved;
  return ok(keepUnchanged(saved.value, { current, draft, editing: live, changed: changedFields(initial, current) }));
}

/** What the move line before Save reads: the entries as stored, the save's context, and the country's matching. */
export type MoveShortContext = {
  readonly entries: readonly Entry[];
  readonly save: FormSave;
  readonly holding: HoldingContext;
};

/**
 * The stored moves the entries `saveOn` would store leave short outside their destination (`movesLeftShort`, docs/
 * DOMAIN.md §3.7), earliest first; none while the save refuses or an edited entry is gone. Never refuses the save.
 */
export function moveShortLines(
  draft: TransactionDraft,
  { entries, save, holding }: MoveShortContext,
): readonly MoveShortfall[] {
  const saved = saveOn(entries, draft, save);
  if (saved?.ok !== true) return [];
  return [...movesLeftShort(entries, saved.value, holding)].sort((a, b) => a.date.localeCompare(b.date));
}

/** A field under "Venue and note" whose message a save's refusal shows under it. */
export type DetailField = 'venue' | 'note';

/** The field a refused save names, so its message sits under that field (CONTENT-STYLE §1 rule 8); null for the form. */
export function detailFieldOf(error: ActionError): DetailField | null {
  if (error.code === 'venue-too-long') return 'venue';
  return error.code === 'note-too-long' ? 'note' : null;
}

/** Figures in prose (DESIGN §5 rule 7): all at the places the most precise one needs, at most the coin's `decimals`. */
export function proseDigits(decimals: number, ...values: Decimal[]): number {
  return Math.min(decimals, Math.max(0, ...values.map(decimalPlaces)));
}

/**
 * An action error in words: a refused month names it, a sale over the holdings names the excess and the units held
 * on the sale's `date`, a move's fee left short names that move's own date and the units held before it, and the cap
 * is a grouped figure (docs/DOMAIN.md §6 "Save an entry", CONTENT-STYLE §4).
 */
export function actionMessage(error: ActionError, plan: Plan, format: Formatters, date: CalendarDate): ErrorMessage {
  if ('slot' in error) return errorMessage({ ...error, slot: format.month(error.slot) });
  if (error.code === 'too-many-entries') return errorMessage({ ...error, max: figure(format, error.max) });
  if (error.code === 'fee-exceeds-held') {
    const digits = proseDigits(decimalsOf(plan, error.coin), error.fee, error.held);
    return errorMessage({
      ...error,
      held: format.units(error.held, error.coin, isPositive(error.held) ? digits : 0), // a zero holding reads 0
      fee: format.units(error.fee, error.coin, digits),
      date: format.date(error.date),
    });
  }
  if (error.code !== 'sell-exceeds-held') return errorMessage(error);
  const excess = minus(error.sold, error.held);
  const digits = proseDigits(decimalsOf(plan, error.coin), excess, error.held);
  return errorMessage({
    code: error.code,
    excess: format.units(excess, error.coin, digits),
    held: format.units(error.held, error.coin, isPositive(error.held) ? digits : 0), // a zero holding reads 0
    date: format.date(date),
  });
}
