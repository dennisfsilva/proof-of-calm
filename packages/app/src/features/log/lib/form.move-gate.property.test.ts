import {
  type CoinId,
  type Entry,
  type HoldingContext,
  type MoveShortfall,
  movesLeftShort,
  type TransactionDraft,
} from '@proofofcalm/core';
import { aMove, anEntry, aPlan, BTC, date, ETH, id, instant, units } from '@proofofcalm/core/testing';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createNumberInput } from '../../../lib/format';
import { type FormState, initialState, type MoveShortContext, moveShortLines, saveOn, toDraft } from './form';

// The move line's gate (docs/ENGINEERING.md §4, "The Log at the cap") changes nothing the line shows: over stored
// purchases, sales and live and deleted moves of two coins on a few days, and new transactions, edits of one entry
// (its coin or date changed) and grouped edits of two or three sales of one coin with one row cleared, the gated
// moveShortLines gives what the ungated one gave.

const en = createNumberInput('en-GB');
const plan = aPlan();
const now = instant('2026-10-20T10:00:00.000Z');

/** moveShortLines as it was before the gate: the save, then movesLeftShort, whatever the moves' dates. */
function ungated(draft: TransactionDraft, { entries, save, holding }: MoveShortContext): readonly MoveShortfall[] {
  const saved = saveOn(entries, draft, save);
  if (saved?.ok !== true) return [];
  return [...movesLeftShort(entries, saved.value, holding)].sort((a, b) => a.date.localeCompare(b.date));
}

const day = fc.integer({ min: 1, max: 6 }).map((d) => `2026-01-0${d}`);
const coin = fc.constantFrom<CoinId>(BTC.id, ETH.id);
const venue = fc.constantFrom('Kraken', 'Ledger', null);
const stamp = (on: string, hour: number) => instant(`${on}T0${hour}:00:00+00:00`);

const stored = fc.oneof(
  fc
    .record({ on: day, hour: fc.nat(9), coin, venue, quantity: fc.constantFrom('0.001', '0.002') })
    .map(({ on, hour, quantity, ...rest }) =>
      anEntry({ ...rest, kind: 'extra', slot: null, date: date(on), units: units(quantity), createdAt: stamp(on, hour) }),
    ),
  fc
    .record({ on: day, hour: fc.nat(9), coin, venue, quantity: fc.constantFrom('0.001') })
    .map(({ on, hour, quantity, ...rest }) =>
      anEntry({ ...rest, kind: 'sell', slot: null, date: date(on), units: units(quantity), createdAt: stamp(on, hour) }),
    ),
  fc
    .record({ on: day, hour: fc.nat(9), coin, venue, sent: fc.constantFrom('0.002', '0.003'), deleted: fc.boolean() })
    .map(({ on, hour, coin, venue, sent, deleted }) =>
      aMove({
        coin,
        date: date(on),
        venue,
        to: venue === 'Kraken' ? 'Ledger' : 'Kraken',
        units: units(sent),
        received: units(sent === '0.002' ? '0.0019' : '0.0029'),
        createdAt: stamp(on, hour),
        deletedAt: deleted ? now : null,
      }),
    ),
);

/** Two or three sales of one coin saved together, as the Log groups them into one row. */
const group = fc
  .record({ on: day, coin, venue, size: fc.integer({ min: 2, max: 3 }) })
  .map(({ on, coin, venue, size }) =>
    Array.from({ length: size }, () =>
      anEntry({ kind: 'sell', slot: null, coin, date: date(on), units: units('0.001'), venue, createdAt: stamp(on, 5) }),
    ),
  );

/** What the person types: the date, the venue, and per row its units, a coin to change it to, or the row cleared. */
const typed = fc.record({
  on: day,
  venue: fc.constantFrom('Kraken', 'Ledger', ''),
  rows: fc.array(fc.record({ quantity: fc.constantFrom('0.001', '0.002', ''), coin: fc.option(coin) }), {
    minLength: 3,
    maxLength: 3,
  }),
});

const draftKind = fc.constantFrom('new', 'one', 'grouped');
const world = fc.record({
  stored: fc.array(stored, { maxLength: 8 }),
  pivot: day,
  group,
  kind: draftKind,
  newKind: fc.constantFrom('extra' as const, 'sell' as const),
  pick: fc.nat(),
  cleared: fc.nat(2),
  typed,
  holding: fc.record({
    overrides: fc.constant([]),
    lotScope: fc.constantFrom('per-venue' as const, 'global' as const),
    lotRule: fc.constantFrom('fifo' as const, 'lifo' as const),
  }),
});

type Drawn = typeof world extends fc.Arbitrary<infer T> ? T : never;

/** The stored entries, the draft and the save's context of one drawn world. */
function scene(drawn: Drawn): { draft: TransactionDraft; context: MoveShortContext } | null {
  // Each coin's first purchase at Kraken, and a BTC move that sends all of it on to Ledger, so a sale at Kraken or an
  // edit of that purchase on or before the move leaves it short.
  const base = [
    ...[BTC.id, ETH.id].map((each) =>
      anEntry({ kind: 'extra', slot: null, coin: each, date: date('2026-01-01'), units: units('0.003'), venue: 'Kraken' }),
    ),
    aMove({ coin: BTC.id, date: date(drawn.pivot), units: units('0.003'), received: units('0.0029'), createdAt: now }),
  ];
  const grouped = drawn.kind === 'grouped';
  const entries: Entry[] = [...base, ...drawn.stored, ...(grouped ? drawn.group : [])];
  const editable = entries.filter((entry) => entry.deletedAt === null && entry.kind !== 'move');
  const editing = grouped
    ? drawn.group
    : drawn.kind === 'one'
      ? [editable[drawn.pick % editable.length] as Entry]
      : [];
  const ctx = { plan, entries, today: date('2026-10-20'), prices: null, numberInput: en };
  const kind = editing[0]?.kind === 'sell' || (editing.length === 0 && drawn.newKind === 'sell') ? 'sell' : 'extra';
  const initial = initialState(kind, editing, undefined, ctx);
  const opened: FormState['rows'] = editing.length > 0 ? initial.rows : initial.rows.slice(0, 2);
  const rows = opened.map((row, at) => {
    const change = drawn.typed.rows[at];
    if (grouped && at === drawn.cleared % opened.length) return { ...row, amount: '', units: '', derived: null };
    // A grouped edit keeps its coin; an edit of one entry or a new row may take the other.
    const into = grouped ? row.coin : (change?.coin ?? row.coin);
    const quantity = change?.quantity || '0.001';
    return { ...row, coin: into, amount: '50', units: quantity, derived: null };
  });
  const current: FormState = { ...initial, date: drawn.typed.on, venue: drawn.typed.venue, fee: '', rows };
  const draft = toDraft(current, en);
  if (!draft.ok) return null;
  const save = { plan, editing, ids: [id(), id(), id()], now, source: 'manual', initial, current } as const;
  return { draft: draft.value, context: { entries, save, holding: drawn.holding as HoldingContext } };
}

describe('moveShortLines behind its gate', () => {
  it('gives the lines the ungated save and movesLeftShort give', () => {
    fc.assert(
      fc.property(world, (drawn) => {
        const at = scene(drawn);
        if (at === null) return;
        expect(moveShortLines(at.draft, at.context)).toEqual(ungated(at.draft, at.context));
      }),
      { numRuns: 300 },
    );
  });

  // At a fixed seed, so the reach count never fails a random draw (docs/BUILD-PROMPT.md, every outcome drawn).
  it('reaches saves that leave a move short', () => {
    let named = 0;
    fc.assert(
      fc.property(world, (drawn) => {
        const at = scene(drawn);
        if (at !== null && ungated(at.draft, at.context).length > 0) named++;
      }),
      { numRuns: 300, seed: 7 },
    );
    expect(named).toBeGreaterThan(0);
  });
});
