import {
  type CoverRefusal,
  deleteEntries,
  type Entry,
  type EntryKind,
  MAX_ENTRIES,
  type Plan,
  type RestoreRefusal,
  restoreEntries,
  slotsAtDelete,
  storedOver,
  uncoveredSale,
} from '@proofofcalm/core';
import { aMove, anEntry, aPlan, BTC, date, ETH, id, instant, month, units } from '@proofofcalm/core/testing';
import { createTranslator } from 'use-intl/core';
import { describe, expect, it } from 'vitest';
import { createFormatters } from '../../../lib/format';
import log from '../messages/en.json';
import { deleteRefusalTitle, undoRefusalTitle } from './row-refusal';

// The toasts of a Log row's refused delete and Undo (docs/CONTENT-STYLE.md §3, Delete an entry), each from a refusal
// the core gives for the write (DOMAIN §6). A fee or a sale refusal names one entry, so each sentence is checked in the
// four cases of a refusal that names one entry: the write worsens only that entry; the data was short before the write
// (an import); only the units in total run short, not the ones by date; the entry named is the one the write stores.

const f = createFormatters('en-GB', 'en-GB');
const t = createTranslator({ locale: 'en', messages: { log }, namespace: 'log' });
const plan = aPlan();
const AT = instant('2026-10-20T10:00:00.000Z');
const LATER = instant('2026-10-20T10:00:05.000Z');
// Formatted dates join their parts with no-break spaces (CONTENT-STYLE §4).
const [JANUARY, FEBRUARY, MARCH_1, APRIL, MARCH] = [
  '1 Jan 2026',
  '1 Feb 2026',
  '1 Mar 2026',
  '1 Apr 2026',
  'March 2026',
].map((text) => text.replaceAll(' ', '\u00a0'));

const bought = (on: string, held: string, overrides: Partial<Entry> = {}) =>
  anEntry({ kind: 'extra', slot: null, date: date(on), units: units(held), ...overrides });
const sold = (on: string, out: string) => anEntry({ kind: 'sell', slot: null, date: date(on), units: units(out) });
/** A move of 0.01 units whose network fee, in the coin, is 0.0001. */
const moved = (on: string) => aMove({ date: date(on) });

/** The core's refusal of deleting `row` from `entries`. */
function refusedDelete(entries: readonly Entry[], row: readonly Entry[]): CoverRefusal {
  const refusal = uncoveredSale(
    entries,
    deleteEntries(
      entries,
      row.map((entry) => entry.id),
      AT,
    ),
  );
  if (refusal === null) throw new Error('the delete was refused');
  return refusal;
}

/** The core's refusal of the Undo of deleting `row`, after `since` changed the stored entries. */
function refusedUndo(
  entries: readonly Entry[],
  row: readonly Entry[],
  since: (stored: Entry[]) => Entry[] = (stored) => stored,
  planSince: Plan = plan,
): RestoreRefusal {
  const ids = row.map((entry) => entry.id);
  const before = slotsAtDelete(plan, entries, ids, AT);
  const stored = since(storedOver(entries, deleteEntries(entries, before.ids, before.at)));
  const restored = restoreEntries(planSince, stored, ids, before, LATER);
  if (restored.ok) throw new Error('the undo was refused');
  return restored.error;
}

const purchase = (count: number) => ({ kind: 'extra' as EntryKind, count });

describe('deleteRefusalTitle', () => {
  it('names the move the delete leaves without its fee by its own date, and the purchase stays', () => {
    const buy = bought('2026-01-01', '0.01');
    const error = refusedDelete([buy, moved('2026-04-01')], [buy]);
    expect(error).toMatchObject({ code: 'fee-exceeds-held', date: '2026-04-01', written: false });
    expect(deleteRefusalTitle(error, purchase(1), f, t)).toBe(
      `Deleting this purchase would leave your BTC move on ${APRIL} ` +
        'without the units its network fee takes, so the purchase stays. Check that move in the Log.',
    );
  });

  it('over a sale imported short, names the move the delete made worse, not the short sale', () => {
    const buy = bought('2026-03-01', '0.01');
    const entries = [bought('2026-01-01', '0.001'), sold('2026-02-01', '0.002'), buy, moved('2026-04-01')];
    const error = refusedDelete(entries, [buy]);
    expect(error).toMatchObject({ code: 'fee-exceeds-held', date: '2026-04-01', written: false });
    expect(deleteRefusalTitle(error, purchase(1), f, t)).toContain(`BTC move on ${APRIL}`);
  });

  it('when only the units in total run short, names a move dated before the purchase and never says later', () => {
    // The move of 1 February was short by date before the delete (an import); the purchase of 1 March covered it in total.
    const buy = bought('2026-03-01', '0.01');
    const error = refusedDelete([bought('2026-01-01', '0.00005'), moved('2026-02-01'), buy], [buy]);
    expect(error).toMatchObject({ code: 'fee-exceeds-held', date: '2026-02-01', written: false });
    const title = deleteRefusalTitle(error, purchase(1), f, t);
    expect(title).toContain(`BTC move on ${FEBRUARY}`);
    expect(title).not.toMatch(/later/u);
  });

  it("never refuses deleting a move's row, so no delete names a move it stores", () => {
    const move = moved('2026-02-01');
    const entries = [bought('2026-01-01', '0.00005'), move, sold('2026-03-01', '0.001')];
    expect(uncoveredSale(entries, deleteEntries(entries, [move.id], AT))).toBeNull();
  });

  it('says Coins added entries stay, one or several, never that a purchase does', () => {
    const btc = bought('2026-01-01', '0.01', { kind: 'held', amount: null });
    const eth = bought('2026-01-01', '0.1', { kind: 'held', amount: null, coin: ETH.id });
    const entries = [btc, eth, moved('2026-04-01')];
    const held = (count: number) => ({ kind: 'held' as EntryKind, count });
    expect(deleteRefusalTitle(refusedDelete(entries, [btc]), held(1), f, t)).toBe(
      `Deleting this Coins added entry would leave your BTC move on ${APRIL} ` +
        'without the units its network fee takes, so the entry stays. Check that move in the Log.',
    );
    expect(deleteRefusalTitle(refusedDelete(entries, [btc, eth]), held(2), f, t)).toBe(
      `Deleting these 2 Coins added entries would leave your BTC move on ${APRIL} ` +
        'without the units its network fee takes, so the entries stay. Check that move in the Log.',
    );
  });

  it('a delete refused for a sale dated before the purchase names it by its date, never as a later sale', () => {
    // Only the units in total run short: the sale of 1 March finds 0.01 by date, and nothing once 1 April's purchase goes.
    const buy = bought('2026-04-01', '0.01');
    const entries = [sold('2026-01-01', '0.01'), bought('2026-02-01', '0.01'), sold('2026-03-01', '0.01'), buy];
    const error = refusedDelete(entries, [buy]);
    expect(error).toMatchObject({ code: 'sell-exceeds-held', date: '2026-03-01', written: false });
    const title = deleteRefusalTitle(error, purchase(1), f, t);
    expect(title).toBe(
      `Deleting this purchase would leave your BTC sale on ${MARCH_1} ` +
        'without the units it sells, so the purchase stays. Check that sale in the Log.',
    );
    expect(title).not.toMatch(/later/u);
  });

  it("a Coins added row's sale refusal says Coins added entry, never purchase", () => {
    const btc = bought('2026-01-01', '0.01', { kind: 'held', amount: null });
    const eth = bought('2026-01-01', '0.1', { kind: 'held', amount: null, coin: ETH.id });
    const entries = [btc, eth, sold('2026-02-01', '0.01')];
    const held = (count: number) => ({ kind: 'held' as EntryKind, count });
    expect(deleteRefusalTitle(refusedDelete(entries, [btc]), held(1), f, t)).toBe(
      `Deleting this Coins added entry would leave your BTC sale on ${FEBRUARY} ` +
        'without the units it sells, so the entry stays. Check that sale in the Log.',
    );
    expect(deleteRefusalTitle(refusedDelete(entries, [btc, eth]), held(2), f, t)).toBe(
      `Deleting these 2 Coins added entries would leave your BTC sale on ${FEBRUARY} ` +
        'without the units it sells, so the entries stay. Check that sale in the Log.',
    );
  });
});

describe('undoRefusalTitle', () => {
  it('names the move a restored sale would leave without its fee by its own date', () => {
    const sale = sold('2026-03-01', '0.01');
    const error = refusedUndo([bought('2026-01-01', '0.01'), sale], [sale], (stored) => [
      ...stored,
      moved('2026-04-01'),
    ]);
    expect(error).toMatchObject({ code: 'fee-exceeds-held', date: '2026-04-01', written: false });
    expect(undoRefusalTitle(error, 1, f, t)).toBe(
      `Restoring this entry would leave your BTC move on ${APRIL} ` +
        'without the units its network fee takes, so it stays deleted.',
    );
    expect(undoRefusalTitle(error, 2, f, t)).toBe(
      `Restoring these 2 entries would leave your BTC move on ${APRIL} ` +
        'without the units its network fee takes, so they stay deleted.',
    );
  });

  it('over a sale imported short, names the move the Undo made worse, not the short sale', () => {
    const sale = sold('2026-03-15', '0.01');
    const entries = [bought('2026-01-01', '0.001'), sold('2026-02-01', '0.002'), bought('2026-03-01', '0.01'), sale];
    const error = refusedUndo(entries, [sale], (stored) => [...stored, moved('2026-04-01')]);
    expect(error).toMatchObject({ code: 'fee-exceeds-held', date: '2026-04-01', written: false });
    expect(undoRefusalTitle(error, 1, f, t)).toContain(`BTC move on ${APRIL}`);
  });

  it('an Undo of a sale refused over data imported short says restoring it would leave it without the units it sells', () => {
    // Imported dated before its purchase, deleted, then undone with nothing changed since: no entries changed.
    const sale = sold('2026-01-01', '0.01');
    const error = refusedUndo([sale, bought('2026-02-01', '0.01')], [sale]);
    expect(error).toMatchObject({ code: 'sell-exceeds-held', date: '2026-01-01', written: true });
    expect(undoRefusalTitle(error, 1, f, t)).toBe(
      'Restoring this sale would leave it without the units it sells, so it stays deleted.',
    );
    expect(undoRefusalTitle(error, 2, f, t)).toBe(
      `Restoring these 2 entries would leave your BTC sale on ${JANUARY} without the units it sells, so they stay deleted.`,
    );
  });

  it('when only the units in total run short, names the restored sale, so no fee sentence says later', () => {
    // A restore adds units taken; a step before the restored one keeps its units in total, so a move short only in
    // total is never named: the sale restored after it is.
    const sale = sold('2026-04-01', '0.0001');
    const error = refusedUndo([moved('2026-01-01'), bought('2026-03-01', '0.0001'), sale], [sale]);
    expect(error).toMatchObject({ code: 'sell-exceeds-held', date: '2026-04-01', written: true });
    expect(undoRefusalTitle(error, 1, f, t)).not.toMatch(/later/u);
  });

  it('an Undo of a move refused for a sale names the sale by its date, never "this sale"', () => {
    const move = moved('2026-02-01');
    const error = refusedUndo([bought('2026-01-01', '0.01'), move, sold('2026-03-01', '0.00995')], [move]);
    expect(error).toMatchObject({ code: 'sell-exceeds-held', date: '2026-03-01', written: false });
    const title = undoRefusalTitle(error, 1, f, t);
    expect(title).toBe(
      `Restoring this entry would leave your BTC sale on ${MARCH_1} without the units it sells, so it stays deleted.`,
    );
    expect(title).not.toContain('this sale');
  });

  it('says a move restored short of its own fee stays deleted, naming no other move', () => {
    const move = moved('2026-02-01');
    const entries = [bought('2026-01-01', '0.01'), move];
    const error = refusedUndo(entries, [move], (stored) => [...stored, sold('2026-01-15', '0.01')]);
    expect(error).toMatchObject({ code: 'fee-exceeds-held', date: '2026-02-01', written: true });
    expect(undoRefusalTitle(error, 1, f, t)).toBe(
      'Restoring this move would leave it without the units its network fee takes, so it stays deleted.',
    );
  });

  describe('counts the entries of the row', () => {
    const monthly = (coin: Entry['coin']) =>
      anEntry({ kind: 'dca', date: date('2026-03-01'), slot: month('2026-03'), coin });
    const row = [monthly(BTC.id), monthly(ETH.id)];

    it('after the month was skipped', () => {
      const skipped = { ...plan, skips: [{ id: id(), slot: month('2026-03'), note: '', createdAt: LATER }] };
      const title = (deleted: readonly Entry[]) =>
        undoRefusalTitle(refusedUndo(row, deleted, undefined, skipped), deleted.length, f, t);
      expect(title(row.slice(0, 1))).toBe(`${MARCH} was skipped after you deleted this entry, so it stays deleted.`);
      expect(title(row)).toBe(`${MARCH} was skipped after you deleted these 2 entries, so they stay deleted.`);
    });

    it('after the month was recorded', () => {
      const again = (stored: Entry[]) => [...stored, monthly(BTC.id)];
      expect(undoRefusalTitle(refusedUndo(row, row.slice(0, 1), again), 1, f, t)).toBe(
        `${MARCH} was recorded after you deleted this entry, so it stays deleted.`,
      );
      expect(undoRefusalTitle(refusedUndo(row, row, again), 2, f, t)).toBe(
        `${MARCH} was recorded after you deleted these 2 entries, so they stay deleted.`,
      );
    });

    it('after a backup replaced the plan', () => {
      const replaced = (stored: Entry[]) =>
        stored.map((entry) => (entry.deletedAt === null ? entry : { ...entry, updatedAt: LATER, deletedAt: LATER }));
      expect(undoRefusalTitle(refusedUndo(row, row.slice(0, 1), replaced), 1, f, t)).toBe(
        'A backup replaced your plan after you deleted this entry, so it stays deleted.',
      );
      expect(undoRefusalTitle(refusedUndo(row, row, replaced), 2, f, t)).toBe(
        'A backup replaced your plan after you deleted these 2 entries, so they stay deleted.',
      );
    });

    it('when the plan is full', () => {
      const buys = [bought('2026-01-01', '0.01'), bought('2026-01-02', '0.01')];
      const filled = (stored: Entry[]) => {
        const room = MAX_ENTRIES - stored.filter((entry) => entry.deletedAt === null).length;
        return [...stored, ...Array.from({ length: room }, () => bought('2026-02-01', '0.01'))];
      };
      expect(undoRefusalTitle(refusedUndo(buys, buys.slice(0, 1), filled), 1, f, t)).toBe(
        'Restoring this entry would take the plan past the 10,000 entries a plan holds, so it stays deleted.',
      );
      expect(undoRefusalTitle(refusedUndo(buys, buys, filled), 2, f, t)).toBe(
        'Restoring these 2 entries would take the plan past the 10,000 entries a plan holds, so they stay deleted.',
      );
    });
  });
});
