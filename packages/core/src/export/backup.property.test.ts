import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, date, id, instant, month } from '../../test/builders';
import { compareInstants, epochDay, instantFromEpochMs } from '../dates/calendar';
import { MINOR_UNITS } from '../money/currency';
import type { Entry } from '../schema/entry';
import { applyImport, exportBackup } from './backup';

const now = instant('2026-10-17T08:00:00Z');
const deletedAt = instant('2026-03-01T10:00:00Z');
const CURRENCIES = Object.keys(MINOR_UNITS) as (keyof typeof MINOR_UNITS)[];

// Each entry is on the device (live or deleted there), in the file (live or a tombstone there), or both.
// Each is a monthly buy of one of four months, or an extra buy with none.
const MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04'] as const;
const placement = fc.record({
  onDevice: fc.boolean(),
  deletedHere: fc.boolean(),
  inFile: fc.boolean(),
  deletedInFile: fc.boolean(),
  month: fc.option(fc.constantFrom(...MONTHS)),
});
type Placement = {
  onDevice: boolean;
  deletedHere: boolean;
  inFile: boolean;
  deletedInFile: boolean;
  month: string | null;
};

function scene(placements: readonly Placement[]) {
  const rows = placements.map((place) => ({
    place,
    entry: place.month === null ? anEntry({ kind: 'extra', slot: null }) : anEntry({ slot: month(place.month) }),
  }));
  const device = rows
    .filter(({ place }) => place.onDevice)
    .map(({ place, entry }) => (place.deletedHere ? { ...entry, deletedAt } : entry));
  // Our export leaves tombstones out; a file written elsewhere may hold them, and the schema accepts them.
  const file = {
    ...exportBackup(aPlan(), [], now),
    entries: rows
      .filter(({ place }) => place.inFile)
      .map(({ place, entry }) => (place.deletedInFile ? { ...entry, deletedAt } : entry)),
  };
  return { device, file };
}

describe('applyImport add-missing properties (docs/DOMAIN.md §3.13, ADR-0019)', () => {
  it('never brings back an entry deleted on this device, adds no tombstone, and counts each live entry once', () => {
    fc.assert(
      fc.property(fc.array(placement, { maxLength: 30 }), (placements) => {
        const { device, file } = scene(placements);
        const result = applyImport({ plan: aPlan(), entries: device }, file, 'add-missing', now);
        const tombstoned = new Set(device.filter((entry) => entry.deletedAt !== null).map((entry) => entry.id));
        const live = result.entries.filter((entry) => entry.deletedAt === null);
        expect(live.filter((entry) => tombstoned.has(entry.id))).toEqual([]);
        const fileLive = file.entries.filter((entry) => entry.deletedAt === null);
        expect(result.added + result.skipped + result.deleted + result.taken).toBe(fileLive.length);
        expect(result.entries.slice(0, device.length)).toEqual(device);
        expect(result.entries.slice(device.length).every((entry) => entry.deletedAt === null)).toBe(true);
      }),
    );
  });

  it('never leaves a month recorded by live monthly buys of both the device and the file, nor adds one to a skipped month', () => {
    fc.assert(
      fc.property(fc.array(placement, { maxLength: 30 }), fc.subarray([...MONTHS]), (placements, skipped) => {
        const { device, file } = scene(placements);
        const skips = skipped.map((slot) => ({ id: id(), slot: month(slot), note: '', createdAt: now }));
        const result = applyImport({ plan: aPlan({ skips }), entries: device }, file, 'add-missing', now);
        const monthOf = (entries: readonly Entry[]) =>
          new Set(
            entries.filter((entry) => entry.deletedAt === null && entry.kind === 'dca').map((entry) => entry.slot),
          );
        const deviceMonths = monthOf(device);
        const added = result.entries.slice(device.length);
        for (const slot of monthOf(added)) {
          expect(deviceMonths.has(slot)).toBe(false);
          expect(skipped.some((skip) => skip === slot)).toBe(false);
        }
        const fileLive = file.entries.filter((entry) => entry.deletedAt === null);
        expect(result.added + result.skipped + result.deleted + result.taken).toBe(fileLive.length);
      }),
    );
  });

  it('adds no entry and keeps the plan when the file’s pay currency differs from this plan’s (§2.1: never converted)', () => {
    const currencies = fc.constantFrom(...CURRENCIES);
    const pair = fc.tuple(currencies, currencies).filter(([here, there]) => here !== there);
    fc.assert(
      fc.property(fc.array(placement, { maxLength: 30 }), pair, (placements, [here, there]) => {
        const { device, file } = scene(placements);
        const current = aPlan({ payCurrency: here });
        const foreign = { ...file, plan: { ...file.plan, payCurrency: there } };
        const result = applyImport({ plan: current, entries: device }, foreign, 'add-missing', now);
        expect(result.refused).toEqual({ code: 'currency-mismatch', file: there, plan: here });
        expect(result.plan).toBe(current);
        expect(result.entries).toEqual(device);
        expect(result.added).toBe(0);
      }),
    );
  });
});

// Instants within three days of the fixed `deletedAt`, so the clock lands before, on and after the stored stamps.
const MARCH = epochDay(date('2026-03-01')) * 86_400_000;
const around = fc.integer({ min: MARCH - 259_200_000, max: MARCH + 259_200_000 }).map(instantFromEpochMs);

describe('applyImport replace properties (docs/DOMAIN.md §3.13, ADR-0021)', () => {
  it('for any clock, stamps every row it writes strictly later than the row as stored', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(placement, around), { maxLength: 30 }), around, (rows, clock) => {
        const { device, file } = scene(rows.map(([place]) => place));
        const stamps = rows.filter(([place]) => place.onDevice).map(([, stamp]) => stamp);
        const stored = device.map((entry, index) => ({ ...entry, updatedAt: stamps[index] ?? entry.updatedAt }));
        const result = applyImport({ plan: aPlan(), entries: stored }, file, 'replace', clock);
        const before = new Map(stored.map((entry) => [entry.id, entry]));
        for (const entry of result.entries) {
          const previous = before.get(entry.id);
          if (previous !== undefined) expect(compareInstants(entry.updatedAt, previous.updatedAt)).toBe(1);
          if (previous?.deletedAt) expect(compareInstants(entry.updatedAt, previous.deletedAt)).toBe(1);
          expect(compareInstants(entry.updatedAt, clock)).toBeGreaterThanOrEqual(0);
        }
      }),
    );
  });
});
