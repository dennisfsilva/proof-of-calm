import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, BTC, date, id, instant, money, units } from '../../test/builders';
import { minus, sum, type Units } from '../money/decimal';
import { matchLots } from '../portfolio/lots';
import type { Entry } from '../schema/entry';
import { type MoveDraft, saveMove, sourceShort } from './moves';

// docs/DOMAIN.md §6 "Record a move": the units `sourceShort` names are those `matchLots` looks for outside the source
// when it matches the saved move per venue, so the form's short-source line never says more or less than the match
// does. The match takes min(sent, the source's units at the move's place) at the source, the rest elsewhere or unmatched.

const DAYS = [date('2026-01-05'), date('2026-02-05'), date('2026-03-05'), date('2026-04-05')];
const VENUES = ['Kraken', 'Bitvavo', null] as const;
const QUANTITIES = ['0.001', '0.002', '0.003'] as const;
const FEES = ['0', '0.0005'] as const;
const STAMPS = [
  instant('2026-01-01T09:00:00+00:00'),
  instant('2026-01-01T09:00:00+00:00'),
  instant('2026-02-01T09:00:00+00:00'),
];
const now = instant('2026-04-20T10:00:00+00:00');
const IDS = Array.from({ length: 10 }, id);

type Spec = {
  readonly kind: 'extra' | 'sell' | 'move';
  readonly day: number;
  readonly venue: number;
  /** For a move from no venue: Bitvavo rather than Kraken. A move from one of the two goes to the other. */
  readonly toBitvavo: boolean;
  readonly quantity: (typeof QUANTITIES)[number];
  readonly fee: (typeof FEES)[number];
  readonly stamp: number;
};
type Draft = Omit<Spec, 'kind' | 'stamp'>;

const spec: fc.Arbitrary<Spec> = fc.record({
  kind: fc.constantFrom('extra' as const, 'extra' as const, 'sell' as const, 'move' as const),
  day: fc.nat(DAYS.length - 1),
  venue: fc.nat(VENUES.length - 1),
  toBitvavo: fc.boolean(),
  quantity: fc.constantFrom(...QUANTITIES),
  fee: fc.constantFrom(...FEES),
  stamp: fc.nat(STAMPS.length - 1),
});
const draftSpec: fc.Arbitrary<Draft> = fc.record({
  day: fc.nat(DAYS.length - 1),
  venue: fc.nat(VENUES.length - 1),
  toBitvavo: fc.boolean(),
  quantity: fc.constantFrom(...QUANTITIES),
  fee: fc.constantFrom(...FEES),
});

const venueOf = (each: Pick<Spec, 'venue'>) => VENUES[each.venue] ?? null;
const toOf = (each: Pick<Spec, 'venue' | 'toBitvavo'>) => {
  const from = venueOf(each);
  return from === 'Kraken' || (from === null && each.toBitvavo) ? 'Bitvavo' : 'Kraken';
};
const dayOf = (each: Pick<Spec, 'day'>) => DAYS[each.day] ?? date('2026-01-05');

function entryOf(each: Spec, index: number): Entry {
  const at = STAMPS[each.stamp] ?? now;
  const base = {
    id: IDS[index] ?? id(),
    kind: each.kind,
    date: dayOf(each),
    coin: BTC.id,
    units: units(each.quantity),
    slot: null,
    venue: venueOf(each),
    createdAt: at,
    updatedAt: at,
  };
  if (each.kind === 'move') {
    return anEntry({ ...base, amount: null, to: toOf(each), received: minus(units(each.quantity), units(each.fee)) });
  }
  return anEntry({ ...base, amount: money('100') });
}

function draftOf(each: Draft): MoveDraft {
  const sent = units(each.quantity);
  const received = minus(sent, units(each.fee));
  return { coin: BTC.id, date: dayOf(each), from: venueOf(each), to: toOf(each), sent, received, note: '' };
}

/** Saves the draft, new or as an edit of the first entry (a move), and compares; true when the move saved. */
function check(specs: readonly Spec[], drafted: Draft, edit: boolean): boolean {
  const entries = specs.map((each, index) => entryOf(index === 0 && edit ? { ...each, kind: 'move' } : each, index));
  const stored = edit ? (entries[0] ?? null) : null;
  const others = entries.filter((entry) => entry !== stored);
  const draft = draftOf(drafted);
  const editing = stored === null ? [] : [stored];
  const saved = saveMove(draft, { plan: aPlan(), entries, editing, ids: [id()], now, source: 'manual' });
  if (!saved.ok) return false;
  const [move] = saved.value;
  const match = matchLots([...others, ...saved.value], BTC.id, 'per-venue').moves.find((each) => each.id === move?.id);
  const atSource = sum((match?.takes ?? []).filter((take) => take.venue === draft.from).map((take) => take.units));
  const short: Units = sourceShort(entries, draft, stored?.id ?? null) ?? units('0');
  expect(short).toBe(minus(draft.sent, atSource));
  return true;
}

const of = (kind: Spec['kind'], day: number, quantity: Spec['quantity'], extra: Partial<Spec> = {}): Spec => ({
  kind,
  day,
  venue: 0,
  toBitvavo: false,
  quantity,
  fee: '0',
  stamp: 0,
  ...extra,
});
const sent = (day: number, quantity: Draft['quantity'], extra: Partial<Draft> = {}): Draft => ({
  day,
  venue: 0,
  toBitvavo: false,
  quantity,
  fee: '0',
  ...extra,
});

/** The edge positions, each a move that saves: a new move unless the third value says it edits the first entry. */
const EDGES: [Spec[], Draft, boolean][] = [
  // A sale and a purchase at the source on the move's date: the purchase counts, the sale comes after the move.
  [[of('extra', 0, '0.002'), of('extra', 1, '0.001'), of('sell', 1, '0.002')], sent(1, '0.003'), false],
  // A source holding nothing: the units come from those with no venue named.
  [[of('extra', 0, '0.003', { venue: 2 })], sent(1, '0.002', { fee: '0.0005' }), false],
  // Only `to` holds units: the match finds none outside it, and they stay the move's unmatched.
  [[of('extra', 0, '0.003', { venue: 1 })], sent(1, '0.002'), false],
  // An edit of a stored move keeps its place before a later move of its date from the same source.
  [[of('move', 1, '0.002'), of('extra', 0, '0.003'), of('move', 1, '0.001', { stamp: 2 })], sent(1, '0.003'), true],
];

describe('sourceShort (docs/DOMAIN.md §6 "Record a move")', () => {
  it('sourceShort is what matchLots takes outside the source for the saved move', () => {
    const logs = fc.array(spec, { minLength: 1, maxLength: IDS.length });
    fc.assert(
      fc.property(logs, draftSpec, fc.boolean(), (specs, drafted, edit) => {
        check(specs, drafted, edit);
      }),
      { examples: EDGES },
    );
  });

  it('the edge positions all save, so the property compares each of them', () => {
    for (const [specs, drafted, edit] of EDGES) expect(check(specs, drafted, edit)).toBe(true);
  });
});
