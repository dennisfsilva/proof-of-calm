import {
  type ActionError,
  type CalendarDate,
  CalendarDateSchema,
  type CoinId,
  CoinIdSchema,
  coinsWithEntries,
  compare,
  type Entry,
  entryRole,
  err,
  heldUnits,
  isPositive,
  liveEntries,
  MAX_UNIT_DECIMALS,
  type MoveDraft,
  minus,
  ok,
  type Plan,
  type Result,
  type SaveContext,
  sameMove,
  saveMove,
  sourceShort,
  type Units,
  type VenueUnits,
  venueUnitsAtMove,
} from '@proofofcalm/core';
import * as z from 'zod/mini';
import { type ErrorMessage, errorMessage } from '../../../lib/errors';
import type { Formatters, NumberInput, NumberInputError } from '../../../lib/format';
import { actionMessage, proseDigits } from './form';

// The move form's state as typed text, and the pure steps between it and a `MoveDraft` (ADR-0034, ADR-0054).

/** The move form as typed; `from` is undefined while no source is chosen. A session draft reads it back (ADR-0020). */
export const MoveFormStateSchema = z.readonly(
  z.object({
    coin: z.string(),
    /** The date input's text: '' while blank or partly typed. */
    date: z.string(),
    from: z.optional(z.nullable(z.string())),
    to: z.string(),
    sent: z.string(),
    received: z.string(),
    /** Whether the person typed the units received; until then they follow the units sent. */
    receivedTyped: z.boolean(),
    note: z.string(),
  }),
);
export type MoveFormState = z.infer<typeof MoveFormStateSchema>;

/**
 * What the drafts adapter keeps of an open move form (ADR-0020): its text, the number locale it was typed in, and its
 * base, the edited move with the moment it was last written ('' for a new move), so a draft typed over a move another
 * tab changed since is not brought back.
 */
export const MoveFormDraftSchema = z.object({ numberLocale: z.string(), base: z.string(), state: MoveFormStateSchema });
export type MoveFormDraft = z.infer<typeof MoveFormDraftSchema>;

/** The draft's entity and base for the form opened on `editing`. */
export const moveDraftKey = (editing: Entry | null) => ({
  entity: editing === null ? 'new' : String(editing.id),
  base: editing === null ? '' : `${editing.id}@${editing.updatedAt}`,
});

const MOVE_FIELDS: readonly (keyof MoveFormState)[] = [
  'coin',
  'date',
  'from',
  'to',
  'sent',
  'received',
  'receivedTyped',
  'note',
];

/** Whether two states read the same in every field: a form left as it opened is no draft. */
export const sameMoveForm = (a: MoveFormState, b: MoveFormState) => MOVE_FIELDS.every((key) => a[key] === b[key]);

/** The draft's text while it fits: typed in this number locale, over the move as stored now, and changing something. */
export function restoredMove(
  draft: MoveFormDraft | null,
  fit: { readonly numberLocale: string; readonly base: string; readonly initial: MoveFormState },
): MoveFormState | null {
  if (draft === null || draft.numberLocale !== fit.numberLocale || draft.base !== fit.base) return null;
  return sameMoveForm(draft.state, fit.initial) ? null : draft.state;
}

export type MoveFormContext = {
  readonly plan: Plan;
  readonly entries: readonly Entry[];
  readonly editing: Entry | null;
  readonly numberInput: NumberInput;
};

export type MoveField = 'coin' | 'date' | 'from' | 'to' | 'sent' | 'received' | 'note';
type MoveIssueCode = 'coin-empty' | 'date-invalid' | 'from-empty' | 'to-empty' | 'sent-zero' | 'received-zero';
export type MoveFieldIssue = { readonly field: MoveField; readonly error: NumberInputError | MoveIssueCode };

/**
 * The coins the Log has held at some time (a live purchase of each), the edited move's coin with them, in the
 * portfolio's order: a move's date comes from a past withdrawal record, and `saveMove` refuses a date with too few units.
 */
export function movableCoins(
  ctx: Pick<MoveFormContext, 'plan' | 'entries'> & { readonly editing?: Entry | null },
): CoinId[] {
  const live = liveEntries(ctx.entries);
  const bought = new Set(live.filter((entry) => entryRole(entry.kind) === 'purchase').map((entry) => entry.coin));
  if (ctx.editing) bought.add(ctx.editing.coin);
  return coinsWithEntries(ctx.plan, ctx.editing ? [...live, ctx.editing] : live).filter((coin) => bought.has(coin));
}

/**
 * The venues holding the coin at the move's place on the state's date (`venueUnitsAtMove`: before the date's sales,
 * the edited move left out and kept at its place), the figures `sourceShort` reads; none without both.
 */
export function moveSources(state: MoveFormState, ctx: MoveFormContext): readonly VenueUnits[] {
  const coin = CoinIdSchema.safeParse(state.coin);
  const day = CalendarDateSchema.safeParse(state.date);
  if (!coin.success || !day.success) return [];
  const others = liveEntries(ctx.entries).filter((entry) => entry.id !== ctx.editing?.id);
  return venueUnitsAtMove(others, coin.data, day.data, ctx.editing);
}

/** The source kept while it still holds units, else the only group that does, else none chosen. */
export function withSource(state: MoveFormState, ctx: MoveFormContext): MoveFormState {
  const sources = moveSources(state, ctx);
  if (state.from !== undefined && sources.some((place) => place.venue === state.from)) return state;
  const [only] = sources;
  return { ...state, from: sources.length === 1 && only !== undefined ? only.venue : undefined };
}

/**
 * A new move opens with no date, since none can be assumed (research move-step Q11), and the coin chosen when one coin
 * is held now, else when the Log has held only one; an edit opens on its move's values.
 */
export function initialMoveState(editing: Entry | null, ctx: MoveFormContext): MoveFormState {
  if (editing === null) {
    const coins = movableCoins(ctx);
    const live = liveEntries(ctx.entries);
    const held = coins.filter((coin) => isPositive(heldUnits(live, coin)));
    const [only] = held.length === 1 ? held : coins.length === 1 ? coins : [];
    const empty = { date: '', from: undefined, to: '', sent: '', received: '', receivedTyped: false, note: '' };
    return { ...empty, coin: only ?? '' };
  }
  const received = editing.received ?? editing.units;
  return {
    coin: editing.coin,
    date: editing.date,
    from: editing.venue,
    to: editing.to ?? '',
    sent: ctx.numberInput.format(editing.units),
    received: ctx.numberInput.format(received),
    receivedTyped: compare(received, editing.units) !== 0,
    note: editing.note,
  };
}

/** The units sent typed, and the units received with them until the person typed those. */
export function typeSent(state: MoveFormState, sent: string): MoveFormState {
  return { ...state, sent, received: state.receivedTyped ? state.received : sent };
}

/** The typed text read into a draft for `saveMove`, or every field it cannot read, each under its own field. */
export function moveDraft(state: MoveFormState, numberInput: NumberInput): Result<MoveDraft, MoveFieldIssue[]> {
  const issues: MoveFieldIssue[] = [];
  const coin = CoinIdSchema.safeParse(state.coin);
  if (!coin.success) issues.push({ field: 'coin', error: 'coin-empty' });
  const day = CalendarDateSchema.safeParse(state.date);
  if (!day.success) issues.push({ field: 'date', error: 'date-invalid' });
  if (state.from === undefined) issues.push({ field: 'from', error: 'from-empty' });
  const to = state.to.trim();
  if (to === '') issues.push({ field: 'to', error: 'to-empty' });
  // Empty or 0 is named at the field, so the save's `amount-and-units` never reaches a move.
  const units = (typed: string, field: 'sent' | 'received', zero: MoveIssueCode): Units | null => {
    const parsed = typed.trim() === '' ? null : numberInput.parse<Units>(typed);
    if (parsed !== null && !parsed.ok) issues.push({ field, error: parsed.error });
    else if (parsed === null || !isPositive(parsed.value)) issues.push({ field, error: zero });
    return parsed?.ok === true ? parsed.value : null;
  };
  const sent = units(state.sent, 'sent', 'sent-zero');
  const received = units(state.received, 'received', 'received-zero');
  if (issues.length > 0 || !coin.success || !day.success || state.from === undefined || !sent || !received) {
    return err(issues);
  }
  return ok({ coin: coin.data, date: day.data, from: state.from, to, sent, received, note: state.note.trim() });
}

/**
 * The entries to store for `draft`, saved on the entries as stored when the store's queue runs it (as `saveOn` does);
 * null when the move being edited is no longer live (another tab deleted it), so a save never brings it back.
 */
export function saveMoveOn(
  entries: readonly Entry[],
  draft: MoveDraft,
  { editing, ...context }: Omit<SaveContext, 'entries' | 'editing'> & { readonly editing: Entry | null },
): Result<Entry[], ActionError> | null {
  const live = entries.find((entry) => entry.id === editing?.id && entry.deletedAt === null);
  if (editing !== null && live === undefined) return null;
  return saveMove(draft, { ...context, entries, editing: live === undefined ? [] : [live] });
}

/** The network fee the typed units imply (sent less received), shown once both read and it is above 0. */
export function typedFee(state: MoveFormState, numberInput: NumberInput): Units | null {
  const sent = numberInput.parse<Units>(state.sent);
  const received = numberInput.parse<Units>(state.received);
  if (!sent.ok || !received.ok || compare(sent.value, received.value) <= 0) return null;
  return minus(sent.value, received.value);
}

/**
 * The lines beside a readable move that never block its save: how many units the source lacks at the move's place on
 * its date under per-venue lots (`sourceShort`, with what it holds there, the source card's figure), and whether a live
 * identical move is in the Log.
 */
export function moveLines(draft: MoveDraft, ctx: MoveFormContext, perVenue: boolean) {
  const except = ctx.editing?.id ?? null;
  const short = perVenue ? sourceShort(ctx.entries, draft, except) : null;
  return {
    short: short === null ? null : { short, held: minus(draft.sent, short) },
    same: sameMove(ctx.entries, draft, except) !== null,
  };
}

/** The field a refused save names, so its message sits under it (CONTENT-STYLE §1 rule 8); null for the form. */
export function moveErrorField(error: ActionError): MoveField | null {
  switch (error.code) {
    case 'move-exceeds-held':
    case 'units-precision':
    case 'amount-and-units':
      return 'sent';
    case 'received-exceeds-sent':
    case 'sell-exceeds-held':
    case 'fee-exceeds-held':
      return 'received';
    case 'same-venue':
    case 'venue-too-long':
      return 'to';
    case 'note-too-long':
      return 'note';
    case 'unknown-coin':
      return 'coin';
    default:
      return null;
  }
}

/**
 * A move's refusal in words: one over the holdings names the units sent and held on the move's `date`; a later sale it
 * leaves short is its fee's doing, not a sale's, and so is a later move whose own fee it leaves short, named by that
 * move's date; a fee refusal that names the move being saved (`written`) is worded as its own fee, naming no other
 * move; the rest as the entry form words them.
 */
export function moveMessage(error: ActionError, plan: Plan, format: Formatters, date: CalendarDate): ErrorMessage {
  if (error.code === 'sell-exceeds-held') return { key: 'log.move.saleShort', values: { coin: error.coin } };
  if (error.code === 'fee-exceeds-held' && error.written)
    return { key: 'log.move.ownFeeShort', values: { coin: error.coin } };
  if (error.code === 'fee-exceeds-held')
    return { key: 'log.move.feeShort', values: { coin: error.coin, date: format.date(error.date) } };
  if (error.code !== 'move-exceeds-held') return actionMessage(error, plan, format, date);
  const decimals = plan.coins.find((coin) => coin.id === error.coin)?.decimals ?? MAX_UNIT_DECIMALS;
  const digits = proseDigits(decimals, error.sent, error.held);
  return errorMessage({
    code: error.code,
    sent: format.units(error.sent, error.coin, digits),
    held: format.units(error.held, error.coin, isPositive(error.held) ? digits : 0), // a zero holding reads 0
    date: format.date(date),
  });
}
