// Moving units between venues (docs/DOMAIN.md §6, ADR-0054): one entry of kind `move`, its fee in the coin the units
// sent less the units received. The form that writes one is the shell's; this module validates and builds it.
import { ENTRY_NOTE_MAX_LENGTH, VENUE_MAX_LENGTH } from '../constants';
import type { CalendarDate } from '../dates/calendar';
import { compare, decimalPlaces, isPositive, minus, type Units } from '../money/decimal';
import { liveEntries } from '../plan/statuses';
import { runningHeld, venueUnits } from '../portfolio/lots';
import { coinsWithEntries } from '../portfolio/portfolio';
import { defined, err, ok, type Result } from '../result';
import { type Entry, MAX_UNIT_DECIMALS } from '../schema/entry';
import type { CoinId, EntityId } from '../schema/ids';
import { overCap } from './cap';
import { type SaveContext, stampOver, storedOver, uncoveredSale } from './entries';
import type { ActionError } from './errors';

/** A move as the form gives it: `from` null for the units bought with no venue named. */
export type MoveDraft = {
  readonly coin: CoinId;
  readonly date: CalendarDate;
  readonly from: string | null;
  readonly to: string;
  readonly sent: Units;
  readonly received: Units;
  readonly note: string;
};

function draftError(draft: MoveDraft, context: SaveContext): ActionError | null {
  const { coin, from, to, sent, received } = draft;
  if (!isPositive(sent) || !isPositive(received)) return { code: 'amount-and-units', coin };
  if (!coinsWithEntries(context.plan, liveEntries(context.entries)).includes(coin)) {
    return { code: 'unknown-coin', coin };
  }
  if (decimalPlaces(sent) > MAX_UNIT_DECIMALS || decimalPlaces(received) > MAX_UNIT_DECIMALS) {
    return { code: 'units-precision', coin };
  }
  if (compare(received, sent) > 0) return { code: 'received-exceeds-sent' };
  if (to === from) return { code: 'same-venue' };
  if (draft.note.length > ENTRY_NOTE_MAX_LENGTH) return { code: 'note-too-long', max: ENTRY_NOTE_MAX_LENGTH };
  if ([from ?? '', to].some((venue) => venue.length > VENUE_MAX_LENGTH)) {
    return { code: 'venue-too-long', max: VENUE_MAX_LENGTH };
  }
  return null;
}

/** The units of the coin held just before `move` in the matching order (`runningHeld`), the entries edited left out. */
function heldBefore(others: readonly Entry[], move: Entry): Units {
  let held = '0' as Units;
  for (const step of runningHeld([...others, move], move.coin)) {
    if (step.entry === move) break;
    held = step.held;
  }
  return held;
}

/**
 * Validates a move and returns the entries to write: the move, and the other edited entries soft-deleted. An edit keeps
 * the move's id, creation time and source and stamps it after its stored stamp. A new move sends at most the units held
 * just before it; an edit that keeps the coin is refused only when it sends more beyond them than the stored move did over
 * the same other entries, so a move left short by an earlier-dated sale still takes a new note (§3.7: no worse than
 * before); an edit to another coin is judged as a new move of that coin. A source
 * venue that holds fewer is not refused (`sourceShort`): the rest comes from the other venues.
 * `context.editing` holds the move being edited, or nothing for a new one. Throws a RangeError for an empty `to`, which
 * the form never sends.
 */
export function saveMove(draft: MoveDraft, context: SaveContext): Result<Entry[], ActionError> {
  const problem = draftError(draft, context);
  if (problem !== null) return err(problem);
  if (draft.to.length === 0) throw new RangeError('A move names its destination');
  const existing = context.editing.find((entry) => entry.kind === 'move');
  const move: Entry = {
    id: existing?.id ?? defined(context.ids[0], 'a fresh id'),
    kind: 'move',
    date: draft.date,
    coin: draft.coin,
    amount: null,
    units: draft.sent,
    fee: null,
    note: draft.note,
    slot: null,
    venue: draft.from,
    to: draft.to,
    received: draft.received,
    source: existing?.source ?? context.source,
    createdAt: existing?.createdAt ?? context.now,
    updatedAt: existing === undefined ? context.now : stampOver(context.now, existing),
    deletedAt: null,
  };
  const removed = context.editing
    .filter((entry) => entry !== existing)
    .map((entry) => {
      const at = stampOver(context.now, entry);
      return { ...entry, deletedAt: at, updatedAt: at };
    });
  const editing = new Set(context.editing.map((entry) => entry.id));
  const others = context.entries.filter((entry) => !editing.has(entry.id));
  const held = heldBefore(others, move);
  const short = minus(draft.sent, held);
  // The stored move's excess is the baseline only in its own coin: an edit to another coin is judged as a new move.
  const baseline = existing?.coin === draft.coin ? minus(existing.units, heldBefore(others, existing)) : null;
  if (isPositive(short) && (baseline === null || compare(short, baseline) > 0))
    return err({ code: 'move-exceeds-held', coin: draft.coin, held, sent: draft.sent });
  const written = [move, ...removed];
  const refused =
    uncoveredSale(context.entries, written) ?? overCap(context.entries, storedOver(context.entries, written));
  return refused === null ? ok(written) : err(refused);
}

/**
 * How many of the units sent the source venue lacks at the end of the move's date (`venueUnits`); null when it holds
 * them. `except` is the move being edited, left out so its own units count back at its source.
 */
export function sourceShort(entries: readonly Entry[], draft: MoveDraft, except: EntityId | null): Units | null {
  const others = entries.filter((entry) => entry.id !== except);
  const there = venueUnits(others, draft.coin, draft.date).find((place) => place.venue === draft.from);
  const short = minus(draft.sent, there?.units ?? ('0' as Units));
  return isPositive(short) ? short : null;
}

/** A live move of the same coin, date, venues and units, never `except` (the move being edited): the shell asks first. */
export function sameMove(entries: readonly Entry[], draft: MoveDraft, except: EntityId | null): EntityId | null {
  const same = liveEntries(entries).find(
    (entry) =>
      entry.id !== except &&
      entry.kind === 'move' &&
      entry.coin === draft.coin &&
      entry.date === draft.date &&
      entry.venue === draft.from &&
      entry.to === draft.to &&
      compare(entry.units, draft.sent) === 0 &&
      compare(defined(entry.received, 'received'), draft.received) === 0,
  );
  return same?.id ?? null;
}
