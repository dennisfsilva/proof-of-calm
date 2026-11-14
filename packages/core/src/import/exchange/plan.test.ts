import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, date, instant, money, month, units } from '../../../test/builders';
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
import type { CoinId } from '../../schema/ids';
import type { Plan } from '../../schema/plan';
import type { Movement } from './kraken';
import { type ExchangeImportPlan, planExchangeImport } from './plan';
import { readTradeRepublic, TR_READ } from './trade-republic';

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

  it('step 3, the starting amount: the purchases within 15 days of the first buy are left out and named', () => {
    const lump = anEntry({ kind: 'lump', slot: null, date: date('2026-03-01'), source: 'one-tap' });
    const plan = planExchangeImport(FILE, { plan: STARTING_PLAN, entries: [...STORED.entries, lump] }, CHOICES, LISBON);
    expect(plan.startingAmount).toEqual({ purchases: 2, firstBuy: '2026-03-01' });
    expect(idsOf(plan.entries)).not.toContain(testId(M.M04.key));
    expect(plan.replaced.flatMap((replacement) => replacement.estimates)).not.toContainEqual(lump);
    expect(plan.held?.coins[0]?.purchases).toBe(3);
    expect(golden.startingAmount).toBeNull();
  });

  it("step 5, the late tap: October's estimate dated 3 Nov takes 2 Nov's purchase, and November stays open", () => {
    expect(golden.entries.find((entry) => entry.id === testId(M.M19.key))?.slot).toBe('2026-10');
    expect(golden.entries.find((entry) => entry.id === testId(M.M21.key))?.slot).toBe('2026-11');
    // Tapped on time, October's due date and estimate reach 16 Oct only: the estimate stays, and 2 Nov and 5 Nov are
    // both November's monthly buys.
    const onTime = { ...S.S3, date: date('2026-10-01') };
    const entries = STORED.entries.map((entry) => (entry === S.S3 ? onTime : entry));
    const plan = planExchangeImport(FILE, { plan: PLAN, entries }, CHOICES, LISBON);
    expect(plan.replaced.flatMap((replacement) => replacement.estimates)).not.toContainEqual(onTime);
    expect(plan.entries.find((entry) => entry.id === testId(M.M19.key))?.slot).toBe('2026-11');
    expect(plan.entries.find((entry) => entry.id === testId(M.M21.key))?.slot).toBe('2026-11');
  });

  it("step 5, Carla's venue: the replacement takes the import's venue and the estimate's note", () => {
    const replacement = golden.entries.find((entry) => entry.id === testId(M.M16.key));
    expect([S.S1.venue, replacement?.venue, replacement?.note]).toEqual(['Bitvavo', 'Kraken', 'card']);
  });

  it("step 2, Ana's July: a hand monthly buy typed in November claims July's purchase, which looks recorded", () => {
    expect(golden.recorded).toEqual([
      { dates: ['2026-08-22'], coin: 'BTC', units: '0.0008', amount: '50', count: 1, entry: S.S6 },
      { dates: ['2026-07-01'], coin: 'BTC', units: '0.00161', amount: '99', count: 1, entry: S.S5 },
    ]);
    expect(idsOf(golden.entries)).not.toContain(testId(M.M12.key));
    expect(idsOf(golden.entries)).not.toContain(testId(M.M15.key));
  });

  describe('step 2 before step 5: a purchase a hand entry records is never imported again', () => {
    // October's one tap for BTC (E) and a hand extra buy of 0.0008 BTC on 21 Sept (H); the file buys on 20 Sept (P1)
    // and on 2 Oct (P2). P1 is within October's due date's reach (16 Sept to 16 Oct) and 1 day from H's date.
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

  it('step 4, Greta not ticked: the purchases and receipts on or before her coins added are left out', () => {
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

  it('step 4, Greta ticked: the same purchases are added, months filled, and the receipt at no cost', () => {
    const plan = planExchangeImport(FILE, STORED, { ...CHOICES, addHeld: true }, LISBON);
    expect(plan.held?.added).toBe(true);
    expect(plan.entries).toEqual(
      expect.arrayContaining([
        added(M.M03, 'dca', '2026-03'),
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

// The order after the design check (2026-11-13, ADR-0056 Corrections): every step that leaves a purchase out runs
// before any step that stores one, and a month's estimates are replaced only by a date of that month. Each case runs
// once with the whole file and once with a prefix stored first, as the write would store it.
describe('planExchangeImport, in one import or two', () => {
  const PLAIN = aPlan({ firstBuy: date('2026-03-01'), lastBuy: date('2026-12-01') });
  const STARTING = { ...PLAIN, startingAmount: money('500') };
  const buy = (ref: string, at: string, line: number) =>
    trade(ref, 'purchase', 'BTC', at, { units: '0.0010', amount: '70', fee: '0.70' }, line);
  const tap = (slot: string, day: string, note: string) =>
    anEntry({ slot: month(slot), date: date(day), note, source: 'one-tap', venue: 'Bitvavo' });
  const held = (day: string) =>
    anEntry({ kind: 'held', slot: null, date: date(day), amount: null, units: units('0.05'), venue: 'Ledger' });
  const id = (movement: Movement) => testId(movement.key);
  const gone = (plan: ExchangeImportPlan) => plan.replaced.flatMap((each) => idsOf(each.estimates));
  const kinds = (plan: ExchangeImportPlan) => plan.entries.map((entry) => `${entry.id}:${entry.kind}:${entry.slot}`);
  const liveIds = (entries: readonly Entry[]) => idsOf(entries.filter((entry) => entry.deletedAt === null)).sort();
  /** What the write does with a plan: tombstones the estimates it replaces and adds its entries. */
  const store = (entries: readonly Entry[], plan: ExchangeImportPlan) => {
    const tombstoned = new Set(gone(plan));
    return [
      ...entries.map((entry) => (tombstoned.has(entry.id) ? { ...entry, deletedAt: NOW } : entry)),
      ...plan.entries,
    ];
  };
  function paths(
    plan: Plan,
    log: readonly Entry[],
    file: readonly Movement[],
    prefix: readonly Movement[],
    ticked = false,
    context = LISBON,
  ) {
    const run = (entries: readonly Entry[], movements: readonly Movement[], addHeld = ticked) =>
      planExchangeImport({ ...FILE, movements, leftOut: [] }, { plan, entries }, { ...CHOICES, addHeld }, context);
    const once = run(log, file);
    const first = run(log, prefix);
    const then = run(store(log, first), file);
    const oneLog = liveIds(store(log, once));
    return { once, first, then, run, oneLog, twoLog: liveIds(store(store(log, first), then)) };
  }

  describe("round 2's repro: E, October's tap, and G, a `held` entry of 25 Sept; the file buys on 20 and 28 Sept", () => {
    const E = tap('2026-10', '2026-10-01', 'E');
    const G = held('2026-09-25');
    const [P3, P4] = [buy('P3', '2026-09-20', 2), buy('P4', '2026-09-28', 4)];

    it('unticked, one import adds P4 and tombstones E; [P3] stored first adds nothing, then the whole file adds P4', () => {
      const { once, first, then, oneLog, twoLog } = paths(PLAN, [E, G], [P3, P4], [P3]);
      expect([kinds(once), gone(once), once.held?.coins[0]?.purchases]).toEqual([[`${id(P4)}:dca:2026-10`], [E.id], 1]);
      expect([first.entries, gone(first), first.held?.coins[0]?.purchases]).toEqual([[], [], 1]);
      expect([kinds(then), gone(then), twoLog]).toEqual([[`${id(P4)}:dca:2026-10`], [E.id], oneLog]);
    });

    it('ticked, one import and two add P3 and P4 and tombstone E, with the same live Log', () => {
      const { once, first, then, oneLog, twoLog } = paths(PLAN, [E, G], [P3, P4], [P3], true);
      expect([idsOf(once.entries).sort(), gone(once)]).toEqual([[id(P3), id(P4)].sort(), [E.id]]);
      expect([[...idsOf(first.entries), ...idsOf(then.entries)].sort(), [...gone(first), ...gone(then)]]).toEqual([
        [id(P3), id(P4)].sort(),
        [E.id],
      ]);
      expect(twoLog).toEqual(oneLog);
    });
  });

  describe('the held rule in one import: no estimate takes a purchase dated on or before a `held` entry', () => {
    it("September's tap and a `held` entry of 1 Sept, three fills on 17 Aug: nothing is added or tombstoned", () => {
      const fills = [1, 2, 3].map((n) => buy(`F${n}`, `2026-08-17T10:0${n}:00Z`, 2 * n));
      const log = [tap('2026-09', '2026-09-01', 'ESep'), held('2026-09-01')];
      const { once, first, then } = paths(PLAIN, log, fills, fills.slice(0, 1));
      expect([once.entries, first.entries, then.entries]).toEqual([[], [], []]);
      expect([gone(once), gone(first), gone(then)]).toEqual([[], [], []]);
      expect([once.held?.coins[0]?.purchases, first.held?.coins[0]?.purchases]).toEqual([3, 1]);
    });

    it('a March tap of 18 Mar and a `held` entry of 20 Mar, two fills on 17 Mar: unticked, both are held back', () => {
      const fills = [buy('M17a', '2026-03-17T10:00:00Z', 2), buy('M17b', '2026-03-17T10:05:00Z', 4)];
      const { once } = paths(PLAIN, [tap('2026-03', '2026-03-18', 'EMar'), held('2026-03-20')], fills, []);
      expect([once.entries, gone(once), once.held?.coins[0]?.purchases]).toEqual([[], [], 2]);
    });
  });

  it("July's tap and a `held` entry of 29 Jun, purchases on 29 and 30 Jun: 30 Jun replaces the tap either way", () => {
    const [J29, J30] = [buy('J29', '2026-06-29', 2), buy('J30', '2026-06-30', 4)];
    const E = tap('2026-07', '2026-07-01', 'EJul');
    const { once, first, then, oneLog, twoLog } = paths(PLAIN, [E, held('2026-06-29')], [J29, J30], [J29]);
    expect([kinds(once), gone(once)]).toEqual([[`${id(J30)}:dca:2026-07`], [E.id]]);
    expect([idsOf(first.entries), idsOf(then.entries), twoLog]).toEqual([[], [id(J30)], oneLog]);
  });

  describe('the live Log: a month is replaced only by a date of that month, the same in one import or two', () => {
    it("the second fill of 3 Jul is June's monthly buy in two imports as in one, and July's tap stays", () => {
      const fills = [buy('Q1', '2026-07-03T10:00:00Z', 2), buy('Q2', '2026-07-03T10:05:00Z', 4)];
      const [june, july] = [tap('2026-06', '2026-07-02', 'EJun'), tap('2026-07', '2026-07-01', 'EJul')];
      const { once, then, oneLog, twoLog } = paths(PLAIN, [june, july], fills, fills.slice(0, 1));
      expect([gone(once), kinds(once)]).toEqual([[june.id], fills.map((fill) => `${id(fill)}:dca:2026-06`)]);
      expect([kinds(then), gone(then)]).toEqual([[`${id(fills[1] as Movement)}:dca:2026-06`], []]);
      expect(then.entries.map((entry) => entry.note)).toEqual(['EJun']);
      expect([twoLog, oneLog.includes(july.id)]).toEqual([oneLog, true]);
    });

    it("April's tap dated 19 Apr and May's dated 1 May, purchases on 5 and 20 Apr: both are April's", () => {
      const [A05, A20] = [buy('A05', '2026-04-05', 2), buy('A20', '2026-04-20', 4)];
      const [april, may] = [tap('2026-04', '2026-04-19', 'EApr'), tap('2026-05', '2026-05-01', 'EMay')];
      const { once, oneLog, twoLog } = paths(PLAIN, [april, may], [A05, A20], [A20]);
      expect([gone(once), kinds(once)]).toEqual([[april.id], [`${id(A05)}:dca:2026-04`, `${id(A20)}:dca:2026-04`]]);
      expect(twoLog).toEqual(oneLog);
    });

    it("September's tap dated 24 Sept and October's dated 1 Oct: a tombstoned tap still dates its month", () => {
      const [S05, S22] = [buy('S05', '2026-09-05', 2), buy('S22', '2026-09-22', 4)];
      const [sept, oct] = [tap('2026-09', '2026-09-24', 'ESep'), tap('2026-10', '2026-10-01', 'EOct')];
      const { once, then, oneLog, twoLog } = paths(PLAIN, [sept, oct], [S05, S22], [S05]);
      expect([gone(once), kinds(once)]).toEqual([[sept.id], [`${id(S05)}:dca:2026-09`, `${id(S22)}:dca:2026-09`]]);
      expect([kinds(then), twoLog]).toEqual([[`${id(S22)}:dca:2026-09`], oneLog]);
    });

    it("February's and March's taps of 2027, purchases on 17 Jan and 14 Feb: only February's tap is tombstoned", () => {
      const plan = { ...PLAIN, lastBuy: date('2027-12-01') };
      const [J17, F14] = [buy('K0117', '2027-01-17', 2), buy('K0214', '2027-02-14', 4)];
      const [feb, mar] = [tap('2027-02', '2027-02-01', 'EFeb'), tap('2027-03', '2027-03-01', 'EMar')];
      const march = { ...LISBON, today: date('2027-03-15') };
      const { once, first, then, oneLog, twoLog } = paths(plan, [feb, mar], [J17, F14], [J17], false, march);
      expect([gone(once), gone(first), gone(then), twoLog]).toEqual([[feb.id], [feb.id], [], oneLog]);
    });

    it('two October taps of 1 Oct, two fills on 1 Oct: one `replaced` item holds both taps, by both fills', () => {
      const fills = [buy('D1', '2026-10-01T10:00:00Z', 2), buy('D2', '2026-10-01T10:05:00Z', 4)];
      const taps = [tap('2026-10', '2026-10-01', 'E1'), tap('2026-10', '2026-10-01', 'E2')];
      const { once, first, oneLog, twoLog } = paths(PLAIN, taps, fills, fills.slice(0, 1));
      expect(once.replaced).toEqual([{ estimates: taps, by: fills.map(id) }]);
      expect([gone(first), twoLog]).toEqual([idsOf(taps), oneLog]);
    });
  });

  it("unticked, then ticked: 18 Jun replaces June's tap, and the ticked file leaves the Log one ticked import leaves", () => {
    const [T13, T18] = [buy('T13', '2026-06-13', 2), buy('T18', '2026-06-18', 4)];
    const [june, july] = [tap('2026-06', '2026-06-20', 'EJun'), tap('2026-07', '2026-07-01', 'EJul')];
    const log = [june, july, held('2026-06-15')];
    const { run } = paths(PLAIN, log, [T13, T18], []);
    const no = run(log, [T13, T18], false);
    expect([kinds(no), gone(no), no.held?.coins[0]?.purchases]).toEqual([[`${id(T18)}:dca:2026-06`], [june.id], 1]);
    const yes = run(store(log, no), [T13, T18], true);
    const ticked = run(log, [T13, T18], true);
    expect([gone(ticked), kinds(ticked)]).toEqual([[june.id], [`${id(T13)}:dca:2026-06`, `${id(T18)}:dca:2026-06`]]);
    expect(liveIds(store(store(log, no), yes))).toEqual(liveIds(store(log, ticked)));
    expect(liveIds(store(log, ticked))).toContain(july.id);
  });

  it("Carla's October tap dated 20 Oct and November's of 2 Nov: 1 Oct and 18 Oct both replace October's", () => {
    const [C01, C18] = [buy('C1001', '2026-10-01', 2), buy('C1018', '2026-10-18', 4)];
    const [october, november] = [tap('2026-10', '2026-10-20', 'EOct'), tap('2026-11', '2026-11-02', 'ENov')];
    const { once } = paths(PLAIN, [october, november], [C01, C18], []);
    expect(once.replaced).toEqual([{ estimates: [october], by: [id(C01), id(C18)] }]);
    expect(kinds(once)).toEqual([`${id(C01)}:dca:2026-10`, `${id(C18)}:dca:2026-10`]);
  });

  it("Kai's extra typed on 15 Mar claims 14 Mar before the first buy's 15 days, and 17 Mar is added", () => {
    const typed = anEntry({ kind: 'extra', slot: null, date: date('2026-03-15'), note: 'X15' });
    const [T14, T17] = [buy('T0314', '2026-03-14', 2), buy('T0317', '2026-03-17', 4)];
    const { once } = paths(STARTING, [typed], [T14, T17], []);
    expect([once.recorded.map((each) => each.dates), idsOf(once.entries), once.startingAmount]).toEqual([
      [['2026-03-14']],
      [id(T17)],
      null,
    ]);
  });

  it("Kraken's 2 May then Trade Republic's 4 May, and the reverse, give two monthly buys for May", () => {
    const kraken = { ...FILE, movements: [buy('K0502', '2026-05-02T09:00:00Z', 2)], leftOut: [] };
    const cells = ['2026-05-04T08:00:00.000Z', 'TRADING', 'BUY', 'CRYPTO', 'BTC', '0.0010', '-70.00', '-1.00', ''];
    const tr = readTradeRepublic(TR_READ, [[...cells, 'EUR', '00000000-0000-4000-8000-000000000001']]);
    const run = (file: typeof FILE, entries: readonly Entry[]) =>
      planExchangeImport(file, { plan: PLAIN, entries }, CHOICES, LISBON);
    const [k, t] = [kraken.movements[0], tr.movements[0]].map((each) => `${id(each as Movement)}:dca:2026-05`);
    const krakenFirst = run(kraken, []);
    const trFirst = run(tr, []);
    expect([kinds(krakenFirst), kinds(run(tr, store([], krakenFirst)))]).toEqual([[k], [t]]);
    expect([kinds(trFirst), kinds(run(kraken, store([], trFirst)))]).toEqual([[t], [k]]);
  });

  it('a hand monthly buy for March, typed on 10 Nov, claims 2 Mar, and 9 Nov fills November', () => {
    const typed = anEntry({ slot: month('2026-03'), date: date('2026-11-10'), note: 'HMar' });
    const [J02, J09] = [buy('J0302', '2026-03-02', 2), buy('J1109', '2026-11-09', 4)];
    const { once } = paths(STARTING, [typed], [J02, J09], []);
    expect([once.recorded.map((each) => each.dates), kinds(once), once.startingAmount]).toEqual([
      [['2026-03-02']],
      [`${id(J09)}:dca:2026-11`],
      null,
    ]);
  });

  // Q1 and Q2 of the month-claims design (2026-11-14): every purchase date of a month is its monthly buy, and a hand
  // monthly buy claims its month's dates by its own amount. P1, P2 and P3 are the design walk's people.
  describe('every date of a month is its monthly buy; a hand monthly buy claims by its amount', () => {
    const P2_PLAN = { ...PLAIN, buyDay: 15, firstBuy: date('2026-02-15') };
    const paid = (ref: string, at: string, amount: string, line: number) =>
      trade(ref, 'purchase', 'BTC', at, { units: '0.0008', amount, fee: '0.50' }, line);
    const typedFor = (slot: string, day: string, amount: string, note = 'H') =>
      anEntry({ slot: month(slot), date: date(day), amount: money(amount), note });
    const claims = (plan: ExchangeImportPlan) => plan.recorded.map((each) => [each.entry.note, each.dates]);

    it('P2: executions on 2 Mar and 16 Mar, due day 15, are both March monthly buys', () => {
      const [D02, D16] = [paid('P2-0302', '2026-03-02', '49.93', 2), paid('P2-0316', '2026-03-16', '49.93', 4)];
      const { once } = paths(P2_PLAN, [], [D02, D16], []);
      expect(kinds(once)).toEqual([`${id(D02)}:dca:2026-03`, `${id(D16)}:dca:2026-03`]);
    });

    it('P1: the 31 Mar Saveback and the 2 Apr execution both fill April, in one import and after an export from 1 Apr', () => {
      const [M31, A02] = [paid('P1-0331', '2026-03-31', '5.47', 2), paid('P1-0402', '2026-04-02', '49.93', 4)];
      const { once, then, oneLog, twoLog } = paths(PLAIN, [], [M31, A02], [A02]);
      expect(kinds(once)).toEqual([`${id(M31)}:dca:2026-04`, `${id(A02)}:dca:2026-04`]);
      expect([kinds(then), twoLog]).toEqual([[`${id(M31)}:dca:2026-04`], oneLog]);
    });

    it("20 May and 1 Jun are both June's monthly buys beside 10 May's May", () => {
      const fills = [buy('Y0510', '2026-05-10', 2), buy('Y0520', '2026-05-20', 4), buy('Y0601', '2026-06-01', 6)];
      const { once } = paths(PLAIN, [], fills, []);
      expect(kinds(once)).toEqual(fills.map((fill, n) => `${id(fill)}:dca:2026-0${n === 0 ? 5 : 6}`));
    });

    it('a skipped month takes extra buys unless the Log holds a tombstoned estimate of the coin for it', () => {
      const skips = [{ id: testId('skip'), slot: month('2026-06'), note: '', createdAt: NOW }];
      const plan = { ...PLAIN, skips };
      const J02 = buy('J0602', '2026-06-02', 2);
      const tombstoned = { ...tap('2026-06', '2026-06-01', 'EJun'), deletedAt: NOW };
      expect(kinds(paths(plan, [], [J02], []).once)).toEqual([`${id(J02)}:extra:null`]);
      const { once } = paths(plan, [tombstoned], [J02], []);
      expect([kinds(once), once.entries[0]?.note, once.replaced]).toEqual([[`${id(J02)}:dca:2026-06`], 'EJun', []]);
    });

    it("every monthly buy of a month takes its first estimate's note, live or tombstoned, after a prefix import", () => {
      const [O01, O03] = [buy('N1001', '2026-10-01', 2), buy('N1003', '2026-10-03', 4)];
      const taps = [tap('2026-10', '2026-10-01', 'card'), tap('2026-10', '2026-10-02', 'second')];
      const { once, first, then, oneLog, twoLog } = paths(PLAIN, taps, [O01, O03], [O01]);
      expect([gone(first), kinds(then), gone(then)]).toEqual([idsOf(taps), [`${id(O03)}:dca:2026-10`], []]);
      expect([...once.entries, ...then.entries].map((entry) => entry.note)).toEqual(['card', 'card', 'card']);
      expect(twoLog).toEqual(oneLog);
    });

    it('a coin at 0 % takes only extra buys, but every date of a month its estimate names is a monthly buy', () => {
      const sol = (ref: string, day: string, line: number) =>
        trade(ref, 'purchase', 'SOL', day, { units: '0.5', amount: '50', fee: '0.50' }, line);
      const fills = [sol('L1101', '2026-11-01', 2), sol('L1104', '2026-11-04', 4)];
      expect(kinds(paths(PLAN, [], fills, []).once)).toEqual(fills.map((fill) => `${id(fill)}:extra:null`));
      const estimate = { ...tap('2026-11', '2026-11-01', 'ESol'), coin: 'SOL' as CoinId };
      const { once } = paths(PLAN, [estimate], fills, []);
      expect([kinds(once), gone(once)]).toEqual([fills.map((fill) => `${id(fill)}:dca:2026-11`), [estimate.id]]);
    });

    it('P2 typed €100 claims both executions (€99.86)', () => {
      const [D02, D16] = [paid('P2-0302', '2026-03-02', '49.93', 2), paid('P2-0316', '2026-03-16', '49.93', 4)];
      const { once } = paths(P2_PLAN, [typedFor('2026-03', '2026-03-15', '100')], [D02, D16], []);
      expect([once.entries, once.recorded.map(({ dates, amount, count }) => [dates, amount, count])]).toEqual([
        [],
        [[['2026-03-02', '2026-03-16'], '99.86', 2]],
      ]);
    });

    it('P1 typed €50 claims €49.93 and leaves the €5.47 Saveback to April', () => {
      const [M31, A02] = [paid('P1-0331', '2026-03-31', '5.47', 2), paid('P1-0402', '2026-04-02', '49.93', 4)];
      const { once } = paths(PLAIN, [typedFor('2026-04', '2026-04-02', '50')], [M31, A02], []);
      expect([once.recorded.map((each) => [each.dates, each.amount]), kinds(once)]).toEqual([
        [[['2026-04-02'], '49.93']],
        [`${id(M31)}:dca:2026-04`],
      ]);
    });

    it("the audit's €100 / €60, €90, €30 case: an export ending on the 12th, then the whole file, stores the 12th and 13th as one import does", () => {
      const fills = [
        paid('A1011', '2026-10-11', '60', 2),
        paid('A1012', '2026-10-12', '90', 4),
        paid('A1013', '2026-10-13', '30', 6),
      ];
      const [O11, O12, O13] = fills as [Movement, Movement, Movement];
      const { once, first, then, oneLog, twoLog } = paths(PLAIN, [typedFor('2026-10', '2026-10-11', '100')], fills, [
        O11,
        O12,
      ]);
      expect([claims(once), kinds(once)]).toEqual([
        [['H', ['2026-10-11']]],
        [`${id(O12)}:dca:2026-10`, `${id(O13)}:dca:2026-10`],
      ]);
      expect([claims(first), kinds(first), claims(then), kinds(then)]).toEqual([
        [['H', ['2026-10-11']]],
        [`${id(O12)}:dca:2026-10`],
        [['H', ['2026-10-11']]],
        [`${id(O13)}:dca:2026-10`],
      ]);
      expect(twoLog).toEqual(oneLog);
    });

    it('P3 June typed on 26 Jun claims 26 Jun by its 3 days', () => {
      const J26 = paid('P3-0626', '2026-06-26', '50', 2);
      const { once } = paths(PLAIN, [typedFor('2026-06', '2026-06-26', '50')], [J26], []);
      expect([claims(once), once.entries]).toEqual([[['H', ['2026-06-26']]], []]);
    });

    it('monthly buys claim before other hand entries', () => {
      const extra = anEntry({ kind: 'extra', slot: null, date: date('2026-09-30'), note: 'X' });
      const fills = [paid('B0928', '2026-09-28', '20', 2), paid('B1001', '2026-10-01', '70', 4)];
      const { once } = paths(PLAIN, [typedFor('2026-10', '2026-10-03', '70'), extra], fills, []);
      expect([claims(once), once.entries]).toEqual([
        [
          ['X', ['2026-09-28']],
          ['H', ['2026-10-01']],
        ],
        [],
      ]);
    });

    it('a pre-plan execution within the first month’s reach is its monthly buy', () => {
      const fills = [buy('V0301', '2026-03-01', 2), buy('V0310', '2026-03-10', 4)];
      const { once } = paths({ ...PLAIN, buyDay: 10, firstBuy: date('2026-03-10') }, [], fills, []);
      expect(kinds(once)).toEqual(fills.map((fill) => `${id(fill)}:dca:2026-03`));
    });
  });
});
