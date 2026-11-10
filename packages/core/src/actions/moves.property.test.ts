import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, BTC, date, ETH, id, instant, money, units } from '../../test/builders';
import { compareDates, compareInstants } from '../dates/calendar';
import { compare, max, minus, plus, type Units } from '../money/decimal';
import type { Entry } from '../schema/entry';
import type { CoinId } from '../schema/ids';
import { saveMove } from './moves';

// docs/DOMAIN.md §6 "Record a move" (research Q9): a move sends at most the units held just before it in the
// matching order (§3.7), whatever the later sales; the oracle folds the coin's live entries by hand.

const DAYS = [date('2026-01-05'), date('2026-02-05'), date('2026-03-05')];
const QUANTITIES = ['0.001', '0.002', '0.003'] as const;
const FEES = ['0', '0.0005'] as const;
const STAMPS = [
  instant('2026-01-01T09:00:00+00:00'),
  instant('2026-01-01T09:00:00+00:00'),
  instant('2026-02-01T09:00:00+00:00'),
];
const now = instant('2026-03-20T10:00:00+00:00');
const IDS = Array.from({ length: 12 }, id);

type Spec = {
  readonly kind: 'extra' | 'held' | 'sell' | 'move';
  readonly coin: CoinId;
  readonly day: number;
  readonly quantity: (typeof QUANTITIES)[number];
  readonly fee: (typeof FEES)[number];
  readonly stamp: number;
  readonly deleted: boolean;
};
type Draft = { readonly day: number; readonly sent: (typeof QUANTITIES)[number]; readonly fee: (typeof FEES)[number] };

const spec: fc.Arbitrary<Spec> = fc.record({
  kind: fc.constantFrom('extra' as const, 'held' as const, 'sell' as const, 'move' as const),
  coin: fc.constantFrom(BTC.id, BTC.id, ETH.id),
  day: fc.nat(DAYS.length - 1),
  quantity: fc.constantFrom(...QUANTITIES),
  fee: fc.constantFrom(...FEES),
  stamp: fc.nat(STAMPS.length - 1),
  deleted: fc.boolean(),
});
const draftSpec: fc.Arbitrary<Draft> = fc.record({
  day: fc.nat(DAYS.length - 1),
  sent: fc.constantFrom(...QUANTITIES),
  fee: fc.constantFrom(...FEES),
});

function entryOf(each: Spec, index: number): Entry {
  const at = STAMPS[each.stamp] ?? now;
  const base = {
    id: IDS[index] ?? id(),
    kind: each.kind,
    date: DAYS[each.day] ?? date('2026-01-05'),
    coin: each.coin,
    units: units(each.quantity),
    slot: null,
    venue: 'Kraken',
    createdAt: at,
    updatedAt: at,
    deletedAt: each.deleted ? at : null,
  };
  if (each.kind === 'move') {
    return anEntry({ ...base, amount: null, to: 'Ledger', received: minus(units(each.quantity), units(each.fee)) });
  }
  return anEntry({ ...base, amount: each.kind === 'held' ? null : money('100') });
}

const RANK = { extra: 0, held: 0, move: 1, sell: 2 } as const;

/** The units of BTC held just before a new move on `day`: the live entries before it in the matching order, never below 0. */
function heldBefore(entries: readonly Entry[], day: number): Units {
  const on = DAYS[day] ?? date('2026-01-05');
  const rank = (entry: Entry) => RANK[entry.kind as keyof typeof RANK];
  const before = entries
    .filter((entry) => entry.deletedAt === null && entry.coin === BTC.id)
    .filter((entry) => compareDates(entry.date, on) < 0 || (entry.date === on && rank(entry) <= RANK.move))
    .sort(
      (a, b) =>
        compareDates(a.date, b.date) ||
        rank(a) - rank(b) ||
        compareInstants(a.createdAt, b.createdAt) ||
        (a.id < b.id ? -1 : Number(a.id > b.id)),
    );
  let held = units('0');
  for (const entry of before) {
    const change =
      entry.kind === 'sell'
        ? minus(units('0'), entry.units)
        : entry.kind === 'move'
          ? minus(entry.received ?? entry.units, entry.units)
          : entry.units;
    held = max(plus(held, change), units('0'));
  }
  return held;
}

function check(specs: readonly Spec[], drafted: Draft): void {
  const entries = specs.map(entryOf);
  const sent = units(drafted.sent);
  const result = saveMove(
    {
      coin: BTC.id,
      date: DAYS[drafted.day] ?? date('2026-01-05'),
      from: 'Kraken',
      to: 'Ledger',
      sent,
      received: minus(sent, units(drafted.fee)),
      note: '',
    },
    { plan: aPlan(), entries, editing: [], ids: [id()], now, source: 'manual' },
  );
  const held = heldBefore(entries, drafted.day);
  const refused = !result.ok && result.error.code === 'move-exceeds-held';
  expect(refused).toBe(compare(sent, held) > 0);
  if (refused) expect(result.error).toEqual({ code: 'move-exceeds-held', coin: BTC.id, held, sent });
}

const of = (kind: Spec['kind'], day: number, quantity: Spec['quantity'], extra: Partial<Spec> = {}): Spec => ({
  kind,
  coin: BTC.id,
  day,
  quantity,
  fee: '0',
  stamp: 0,
  deleted: false,
  ...extra,
});

describe('saveMove (docs/DOMAIN.md §6, research Q9)', () => {
  it('saveMove refuses exactly when sent exceeds the units held at its place', () => {
    fc.assert(fc.property(fc.array(spec, { maxLength: IDS.length }), draftSpec, check), {
      examples: [
        // A purchase, a move and a sale on the move's date: the sale comes after it, the stored move before it.
        [
          [of('extra', 1, '0.003'), of('move', 1, '0.002', { fee: '0.0005' }), of('sell', 1, '0.002')],
          { day: 1, sent: '0.003', fee: '0' },
        ],
        // A sale already short: the units held stop at 0 (the clamp), then the purchase counts in full.
        [[of('sell', 0, '0.003'), of('extra', 1, '0.002')], { day: 1, sent: '0.002', fee: '0' }],
        [[of('sell', 0, '0.003'), of('extra', 1, '0.002')], { day: 1, sent: '0.003', fee: '0' }],
        // A held entry counts as a purchase.
        [[of('held', 0, '0.002')], { day: 2, sent: '0.003', fee: '0.0005' }],
        // A tombstone counts for nothing.
        [[of('extra', 0, '0.003', { deleted: true }), of('extra', 0, '0.001')], { day: 0, sent: '0.002', fee: '0' }],
        // Sent exactly equal to held saves.
        [[of('extra', 0, '0.002')], { day: 0, sent: '0.002', fee: '0.0005' }],
      ],
    });
  });
});
