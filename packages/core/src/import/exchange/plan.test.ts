import { describe, expect, it } from 'vitest';
import { anEntry, date, instant, month, units } from '../../../test/builders';
import {
  added,
  BERLIN,
  CHOICES,
  EXPECTED_ENTRIES,
  FILE,
  HUGO,
  LISBON,
  M,
  NOW,
  PLAN,
  R,
  S,
  STARTING_PLAN,
  STORED,
  testId,
  trade,
  zoneDate,
} from '../../../test/exchange/plan-fixture';
import type { Entry } from '../../schema/entry';
import type { Movement } from './kraken';
import { planExchangeImport } from './plan';

// The exchange import's plan (docs/DOMAIN.md §3.13), worked out by hand in plan-fixture.ts: one test per step of
// D2 and per case of D6, each named after the person it serves.

const golden = planExchangeImport(FILE, STORED, CHOICES, LISBON);
const idsOf = (entries: readonly { readonly id: string }[]) => entries.map((entry) => entry.id);

describe('planExchangeImport', () => {
  it('dates an instant in the device zone: 2026-11-04T23:30:00Z is 4 Nov in Lisbon and 5 Nov in Berlin', () => {
    expect(LISBON.dateOf(instant('2026-11-04T23:30:00Z'))).toBe('2026-11-04');
    expect(BERLIN.dateOf(instant('2026-11-04T23:30:00Z'))).toBe('2026-11-05');
    expect(zoneDate('Europe/Berlin')('2026-03-28T23:30:00Z')).toBe('2026-03-29');
  });

  it('adds the golden fixture, each entry from its step', () => {
    expect(golden.entries).toEqual(EXPECTED_ENTRIES);
    expect(golden.replaced).toEqual([
      { estimates: [S.S1], by: [testId(M.M16.key)] },
      { estimates: [S.S2], by: [testId(M.M17.key)] },
      { estimates: [S.S3], by: [testId(M.M19.key)] },
      { estimates: [S.S4], by: [testId(M.M20.key)] },
    ]);
    expect([golden.unitsCut, golden.feesInCoin]).toEqual([1, 1]);
  });

  it('step 1: a row imported earlier and one deleted on this device are not added', () => {
    expect([golden.imported, golden.deleted]).toEqual([1, 1]);
    expect(idsOf(golden.entries)).not.toContain(testId(M.M01.key));
    expect(idsOf(golden.entries)).not.toContain(testId(M.M02.key));
  });

  it('step 2, the starting amount: the purchases within 15 days of the first buy are left out and named', () => {
    const lump = anEntry({ kind: 'lump', slot: null, date: date('2026-03-01'), source: 'one-tap' });
    const plan = planExchangeImport(FILE, { plan: STARTING_PLAN, entries: [...STORED.entries, lump] }, CHOICES, LISBON);
    expect(plan.startingAmount).toEqual({ purchases: 2, firstBuy: '2026-03-01' });
    expect(idsOf(plan.entries)).not.toContain(testId(M.M04.key));
    expect(plan.replaced.flatMap((replacement) => replacement.estimates)).not.toContainEqual(lump);
    expect(plan.held?.coins[0]?.purchases).toBe(3);
    expect(golden.startingAmount).toBeNull();
  });

  it("step 3, the late tap: October's estimate dated 3 Nov takes 2 Nov's purchase, and November stays open", () => {
    expect(golden.entries.find((entry) => entry.id === testId(M.M19.key))?.slot).toBe('2026-10');
    expect(golden.entries.find((entry) => entry.id === testId(M.M21.key))?.slot).toBe('2026-11');
    // Tapped on time, the estimate reaches 16 Oct only: it stays, and 2 Nov fills November.
    const onTime = { ...S.S3, date: date('2026-10-01') };
    const entries = STORED.entries.map((entry) => (entry === S.S3 ? onTime : entry));
    const plan = planExchangeImport(FILE, { plan: PLAN, entries }, CHOICES, LISBON);
    expect(plan.replaced.flatMap((replacement) => replacement.estimates)).not.toContainEqual(onTime);
    expect(plan.entries.find((entry) => entry.id === testId(M.M19.key))?.slot).toBe('2026-11');
    expect(plan.entries.find((entry) => entry.id === testId(M.M21.key))?.kind).toBe('extra');
  });

  it("step 3, Carla's venue: the replacement takes the import's venue and the estimate's note", () => {
    const replacement = golden.entries.find((entry) => entry.id === testId(M.M16.key));
    expect([S.S1.venue, replacement?.venue, replacement?.note]).toEqual(['Bitvavo', 'Kraken', 'card']);
  });

  it("step 4, Ana's July: a hand monthly buy typed in November claims July's purchase, which looks recorded", () => {
    expect(golden.recorded).toEqual([
      { date: '2026-08-22', coin: 'BTC', units: '0.0008', amount: '50', count: 1, entry: S.S6 },
      { date: '2026-07-01', coin: 'BTC', units: '0.00161', amount: '99', count: 1, entry: S.S5 },
    ]);
    expect(idsOf(golden.entries)).not.toContain(testId(M.M12.key));
    expect(idsOf(golden.entries)).not.toContain(testId(M.M15.key));
  });

  describe('step 4 before step 3: a purchase a hand entry records is never imported again', () => {
    // October's one tap for BTC (E) and a hand extra buy of 0.0008 BTC on 21 Sept (H); the file buys on 20 Sept (P1)
    // and on 2 Oct (P2). P1 is inside E's window (16 Sept to 16 Oct) and 1 day from H's date.
    const tapped = anEntry({ slot: month('2026-10'), date: date('2026-10-01'), source: 'one-tap', venue: 'Bitvavo' });
    const typed = anEntry({ kind: 'extra', slot: null, date: date('2026-09-21'), units: units('0.0008') });
    const P1 = trade('TFIX-P1', 'purchase', 'BTC', '2026-09-20', { units: '0.0008', amount: '50', fee: '0.50' }, 2);
    const P2 = trade('TFIX-P2', 'purchase', 'BTC', '2026-10-02', { units: '0.0011', amount: '70', fee: '0.70' }, 4);
    const log = [tapped, typed];
    const fileOf = (movements: readonly Movement[]) => ({ ...FILE, movements, leftOut: [] });
    const run = (entries: readonly Entry[], movements: readonly Movement[]) =>
      planExchangeImport(fileOf(movements), { plan: PLAN, entries }, CHOICES, LISBON);

    it('the hand entry claims its purchase: the estimate stays and nothing is added', () => {
      const plan = run(log, [P1]);
      expect(plan.recorded.map((each) => each.entry.id)).toEqual([typed.id]);
      expect([plan.replaced, plan.entries]).toEqual([[], []]);
    });

    it('a prefix stored, then the whole file, adds what the whole file adds at once: P2 only', () => {
      const once = run(log, [P1, P2]);
      expect(idsOf(once.entries)).toEqual([testId(P2.key)]);
      const first = run(log, [P1]);
      const tombstoned = new Set(first.replaced.flatMap((each) => idsOf(each.estimates)));
      const stored = log.map((entry) => (tombstoned.has(entry.id) ? { ...entry, deletedAt: NOW } : entry));
      const then = run([...stored, ...first.entries], [P1, P2]);
      expect([...idsOf(first.entries), ...idsOf(then.entries)]).toEqual([testId(P2.key)]);
    });
  });

  it('step 5, Greta not ticked: the purchases and receipts on or before her coins added are left out', () => {
    expect(golden.held).toEqual({
      added: false,
      coins: [
        {
          coin: 'BTC',
          purchases: 4,
          units: '0.00251',
          through: '2026-05-01',
          heldUnits: '0.05',
          heldDate: '2026-05-01',
          heldVenue: 'Ledger',
        },
      ],
    });
    for (const movement of [M.M03, M.M05, M.M08, M.M09]) {
      expect(idsOf(golden.entries)).not.toContain(testId(movement.key));
    }
  });

  it('step 5, Greta ticked: the same purchases are added, months filled, and the receipt at no cost', () => {
    const plan = planExchangeImport(FILE, STORED, { ...CHOICES, addHeld: true }, LISBON);
    expect(plan.held?.added).toBe(true);
    expect(plan.entries).toEqual(
      expect.arrayContaining([
        added(M.M03, 'extra', null),
        added(M.M05, 'dca', '2026-04'),
        added(M.M08, 'held', null),
        added(M.M09, 'dca', '2026-05'),
      ]),
    );
    expect(plan.entries).toHaveLength(EXPECTED_ENTRIES.length + 4);
  });

  it("Hugo's three fills of 31 Oct take November in Lisbon and in Berlin", () => {
    const stored = { plan: PLAN, entries: [] };
    const fills = HUGO.movements;
    const lisbon = planExchangeImport(HUGO, stored, CHOICES, LISBON);
    const berlin = planExchangeImport(HUGO, stored, CHOICES, BERLIN);
    expect(lisbon.entries).toEqual(fills.map((fill) => added(fill, 'dca', '2026-11', '', '2026-10-31')));
    expect(berlin.entries).toEqual(fills.map((fill) => added(fill, 'dca', '2026-11', '', '2026-11-01')));
  });

  it('a coin at 0 % takes only extra buys, even on its due date', () => {
    expect(golden.entries.find((entry) => entry.coin === 'SOL')).toEqual(added(M.M22, 'extra', null));
  });

  it('a coin outside the plan is left out and named with the fix', () => {
    expect(golden.leftOut.find((group) => group.reason === 'not-in-plan')).toEqual({
      reason: 'not-in-plan',
      count: 1,
      lines: [45, 46],
      by: [{ key: 'XRP', count: 1, units: '20' }],
    });
  });

  it('USD rows are left out, counted per currency, never converted', () => {
    expect(golden.leftOut.find((group) => group.reason === 'currency')).toEqual({
      reason: 'currency',
      count: 1,
      lines: [47, 48],
      by: [{ key: 'USD', count: 1, units: null }],
    });
    expect(golden.noneInCurrency).toBeNull();
  });

  it("no row in EUR: the plan names the file's currencies", () => {
    const sale = trade('TFIX-U2', 'sale', 'ETH', '2026-07-01', { units: '0.001', amount: '30', fee: '0.30' }, 3, {
      currency: 'USD',
    });
    const usd = [M.M24, sale];
    const plan = planExchangeImport({ ...FILE, movements: [...usd, M.M08], leftOut: [] }, STORED, CHOICES, LISBON);
    expect(plan.noneInCurrency).toEqual(['USD']);
    expect(plan.leftOut).toEqual([
      { reason: 'currency', count: 2, lines: [3, 4, 47, 48], by: [{ key: 'USD', count: 2, units: null }] },
    ]);
    const receiptsOnly = planExchangeImport({ ...FILE, movements: [M.M08], leftOut: [] }, STORED, CHOICES, LISBON);
    expect(receiptsOnly.noneInCurrency).toBeNull();
  });

  it("D5's routes: each left-out row is named by its reason, and a withdrawal by whether the Log has it as a move", () => {
    expect(golden.leftOut.map((group) => [group.reason, group.count, group.lines])).toEqual([
      ['currency', 1, [47, 48]],
      ['not-in-plan', 1, [45, 46]],
      ['reward', 1, [51]],
      ['coin-deposit', 1, [52]],
      ['conversion', 1, [58, 59]],
      ['cash', 1, [55, 56]],
      ['within', 1, [57]],
      ['unpaired', 1, [60]],
      ['unreadable', 1, [61, 62]],
      ['other', 1, [63]],
    ]);
    expect(golden.leftOut.find((group) => group.reason === 'reward')?.by).toEqual([
      { key: 'ETH', count: 1, units: '0.0021' },
    ]);
    expect(golden.leftOut.find((group) => group.reason === 'cash')?.by).toEqual([]);
    expect(golden.withdrawals).toEqual({
      logged: [{ coin: 'BTC', units: '0.0101', count: 1 }],
      notLogged: [{ coin: 'BTC', units: '0.02', count: 1 }],
    });
    // Sent from another venue than the import's, the move is not this withdrawal.
    const elsewhere = planExchangeImport(FILE, STORED, { ...CHOICES, venue: 'Bitstamp' }, LISBON);
    expect(elsewhere.withdrawals).toEqual({ logged: [], notLogged: [{ coin: 'BTC', units: '0.0301', count: 2 }] });
    expect(R.R3.units).toBe('0.0101');
  });

  it('every entry is an import at the chosen venue, created at its trade and updated now', () => {
    const none = planExchangeImport(FILE, STORED, { venue: null, addHeld: false }, LISBON);
    expect(none.entries.every((entry) => entry.venue === null && entry.source === 'import-csv')).toBe(true);
    expect(golden.entries.every((entry) => entry.updatedAt === LISBON.now)).toBe(true);
    expect(month('2026-11')).toBe('2026-11');
  });
});
