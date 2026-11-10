import { describe, expect, it } from 'vitest';
import {
  aMove,
  anEntry,
  aPlan,
  asV2Plan,
  BTC,
  date,
  ETH,
  id,
  instant,
  money,
  month,
  PreviousBuildPlanSchema,
  previousBuildBackupGate,
  split,
  units,
} from '../../test/builders';
import {
  ENTRY_NOTE_MAX_LENGTH,
  IMPORT_MAX_BYTES,
  MAX_ENTRIES,
  MAX_SLOTS,
  NOTE_MAX_LENGTH,
  VENUE_MAX_LENGTH,
} from '../constants';
import { liveEntries } from '../plan/statuses';
import { BACKUP_FORMAT, type BackupFile } from '../schema/backup';
import type { Entry } from '../schema/entry';
import { applyImport, exportBackup, exportFileName, type ImportResult, readBackup, writtenBackup } from './backup';

const plan = aPlan();
const kept = anEntry();
const deleted = anEntry({ deletedAt: instant('2026-02-01T10:00:00Z') });
const exportedAt = instant('2026-10-16T10:00:00+01:00');
const now = instant('2026-10-17T08:00:00Z');
const roundTrip = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe('exportBackup (docs/DOMAIN.md §3.13)', () => {
  it('writes the plan and the entries that are not deleted, in the Proof of Calm format', () => {
    expect(exportBackup(plan, [kept, deleted], exportedAt)).toEqual({
      format: BACKUP_FORMAT,
      schemaVersion: 5,
      exportedAt,
      plan,
      entries: [kept],
    });
  });

  it('writes a plan with nothing recorded as a version 2 file with the v2 plan, which reads back exactly', () => {
    const exported = exportBackup(plan, [kept, deleted], exportedAt);
    const written = writtenBackup(exported);
    expect(written).toStrictEqual({ ...exported, schemaVersion: 2, plan: asV2Plan(plan) });
    expect(PreviousBuildPlanSchema.parse(written.plan)).toStrictEqual(written.plan);
    expect(readBackup(roundTrip(written))).toStrictEqual({ ok: true, value: exported });
  });

  it('writes an acknowledged plan as a version 3 file, unchanged, which reads back exactly', () => {
    const acknowledged = aPlan({ riskAcknowledgedAt: instant('2026-10-22T09:00:00+01:00'), riskWordingVersion: 1 });
    const exported = exportBackup(acknowledged, [kept], exportedAt);
    expect(writtenBackup(exported)).toStrictEqual({ ...exported, schemaVersion: 3 });
    expect(readBackup(roundTrip(writtenBackup(exported)))).toStrictEqual({ ok: true, value: exported });
  });

  it('writes version 4 only with a held entry, whatever the plan records, and reads it back exactly', () => {
    const held = anEntry({ kind: 'held', slot: null, amount: null, units: units('0.5') });
    const acknowledged = aPlan({ riskAcknowledgedAt: instant('2026-10-22T09:00:00+01:00'), riskWordingVersion: 1 });
    for (const withPlan of [plan, acknowledged]) {
      const exported = exportBackup(withPlan, [kept, held], exportedAt);
      expect(writtenBackup(exported)).toStrictEqual({ ...exported, schemaVersion: 4 });
      expect(readBackup(roundTrip(writtenBackup(exported)))).toStrictEqual({ ok: true, value: exported });
    }
    // A deleted held entry is never exported, so it raises nothing.
    const gone = { ...held, deletedAt: instant('2026-02-01T10:00:00Z') };
    expect(writtenBackup(exportBackup(plan, [kept, gone], exportedAt)).schemaVersion).toBe(2);
  });

  it('writes v5 only with a move', () => {
    const move = aMove();
    const held = anEntry({ kind: 'held', slot: null, amount: null, units: units('0.5') });
    for (const entries of [
      [kept, move],
      [kept, held, move],
    ]) {
      const exported = exportBackup(plan, entries, exportedAt);
      expect(writtenBackup(exported)).toStrictEqual(exported);
      expect(writtenBackup(exported).schemaVersion).toBe(5);
      expect(readBackup(roundTrip(writtenBackup(exported)))).toStrictEqual({ ok: true, value: exported });
    }
    // A deleted move is never exported, so it raises nothing; no other kind carries `to` or `received`.
    const gone = { ...move, deletedAt: instant('2026-02-01T10:00:00Z') };
    expect(writtenBackup(exportBackup(plan, [kept, held, gone], exportedAt)).schemaVersion).toBe(4);
    expect(writtenBackup(exportBackup(plan, [kept, gone], exportedAt)).schemaVersion).toBe(2);
    for (const entry of writtenBackup(exportBackup(plan, [kept, held], exportedAt)).entries) {
      expect(Object.keys(entry)).not.toContain('to');
      expect(Object.keys(entry)).not.toContain('received');
    }
  });

  it('the previous build answers newer-version to a v5 file', () => {
    const held = anEntry({ kind: 'held', slot: null, amount: null, units: units('0.5') });
    const withMove = writtenBackup(exportBackup(plan, [kept, aMove()], exportedAt));
    expect(previousBuildBackupGate(withMove)).toEqual({ code: 'newer-version', schemaVersion: 5 });
    // Every file without a move stays at a version that build reads.
    for (const entries of [[kept], [kept, held]]) {
      expect(previousBuildBackupGate(writtenBackup(exportBackup(plan, entries, exportedAt)))).toBeNull();
    }
  });

  it('names the files by kind and day', () => {
    expect(exportFileName('proof-of-calm', 'backup', date('2026-10-16'))).toBe('proof-of-calm-backup-2026-10-16.json');
    expect(exportFileName('proof-of-calm', 'log', date('2026-10-16'))).toBe('proof-of-calm-log-2026-10-16.csv');
  });
});

describe('readBackup (docs/DOMAIN.md §3.13)', () => {
  const file = exportBackup(plan, [kept], exportedAt);

  it('reads its own export back', () => {
    expect(readBackup(roundTrip(file))).toEqual({ ok: true, value: file });
  });

  it('reads a v3 export of an acknowledged plan back exactly', () => {
    const acknowledged = aPlan({ riskAcknowledgedAt: instant('2026-10-22T09:00:00+01:00'), riskWordingVersion: 2 });
    const exported = exportBackup(acknowledged, [kept], exportedAt);
    expect(readBackup(roundTrip(exported))).toEqual({ ok: true, value: exported });
  });

  it('imports a v2 file of the previous build as v3, with no acknowledgement', () => {
    const previous = { ...file, schemaVersion: 2, plan: asV2Plan(plan) };
    expect(readBackup(roundTrip(previous))).toEqual({ ok: true, value: file });
    expect(file.plan).toMatchObject({ riskAcknowledgedAt: null, riskWordingVersion: 0 });
    // A v2 file holding a v2 plan that does not read is still reported by place and code.
    const damaged = { ...previous, plan: { ...asV2Plan(plan), split: split({ BTC: '70', ETH: '20' }) } };
    expect(readBackup(roundTrip(damaged))).toEqual({
      ok: false,
      error: { code: 'invalid-backup', issues: ['plan.split: split-sum'] },
    });
  });

  it('does not recognise anything else', () => {
    for (const other of [null, 'text', 42, [], { version: 4, purchases: [] }, { format: 'other-app' }]) {
      expect(readBackup(other)).toEqual({ ok: false, error: { code: 'not-recognised' } });
    }
  });

  it('says when the file comes from a newer version of the app', () => {
    expect(readBackup({ ...(roundTrip(file) as object), schemaVersion: 6 })).toEqual({
      ok: false,
      error: { code: 'newer-version', schemaVersion: 6 },
    });
  });

  it('reads v2, v3 and v4 files', () => {
    const acknowledged = aPlan({ riskAcknowledgedAt: instant('2026-10-22T09:00:00+01:00'), riskWordingVersion: 1 });
    const v3 = exportBackup(acknowledged, [kept], exportedAt);
    for (const version of [3, 4]) {
      expect(readBackup({ ...(roundTrip(v3) as object), schemaVersion: version })).toStrictEqual({
        ok: true,
        value: v3,
      });
    }
    const v2 = { ...(roundTrip(file) as object), schemaVersion: 2, plan: roundTrip(asV2Plan(plan)) };
    expect(readBackup(v2)).toStrictEqual({ ok: true, value: file });
  });

  it('lists what is wrong with a damaged backup, by code and place', () => {
    const damaged = { ...file, plan: { ...plan, split: split({ BTC: '70', ETH: '20' }) } };
    const result = readBackup(roundTrip(damaged));
    expect(result).toEqual({ ok: false, error: { code: 'invalid-backup', issues: ['plan.split: split-sum'] } });
  });

  it('refuses a file that holds the same entry twice, which no export writes', () => {
    const twice = { ...file, entries: [kept, kept] };
    const result = readBackup(roundTrip(twice));
    expect(result).toEqual({ ok: false, error: { code: 'invalid-backup', issues: ['entries: duplicate-id'] } });
  });
});

describe('applyImport (docs/DOMAIN.md §3.13, ADR-0019)', () => {
  const mine = anEntry({ amount: money('1') });
  const gone = anEntry({ deletedAt: instant('2026-03-01T10:00:00Z') });
  const theirs = anEntry({ amount: money('2'), slot: month('2026-02') });
  const file: BackupFile = exportBackup(aPlan({ why: 'from the backup' }), [theirs, mine], exportedAt);

  it('replaces everything, stamping the imported rows and keeping tombstones for what it removes', () => {
    const result = applyImport({ plan, entries: [mine, gone, kept] }, file, 'replace', now);
    expect(result.plan).toEqual({ ...file.plan, updatedAt: now });
    expect(result.entries).toEqual([
      { ...theirs, updatedAt: now },
      { ...mine, updatedAt: now },
      { ...gone, updatedAt: now },
      { ...kept, deletedAt: now, updatedAt: now },
    ]);
    expect([result.added, result.skipped, result.taken]).toEqual([2, 0, 0]);
  });

  it('restamps the tombstones a replace keeps and leaves their deletedAt, so an undo of that delete refuses', () => {
    const result = applyImport({ plan, entries: [gone] }, file, 'replace', now);
    const tombstone = result.entries.find((entry) => entry.id === gone.id);
    expect(tombstone).toEqual({ ...gone, deletedAt: gone.deletedAt, updatedAt: now });
  });

  it('stamps every row it writes later than the row as stored, whatever this clock says (ADR-0021)', () => {
    // Another tab deleted `ahead` and wrote `written` after this device's clock stepped back.
    const earlier = instant('2026-02-15T10:00:00Z');
    const ahead = anEntry({ deletedAt: instant('2026-03-01T10:00:00Z'), updatedAt: instant('2026-03-01T10:00:00Z') });
    const written = { ...mine, updatedAt: instant('2026-03-01T12:00:00+01:00') };
    const live = anEntry({ updatedAt: instant('2026-03-02T00:00:00Z') });
    const stored = aPlan({ updatedAt: instant('2026-03-01T09:00:00Z') });
    const result = applyImport({ plan: stored, entries: [written, ahead, live, gone] }, file, 'replace', earlier);
    expect(result.plan.updatedAt).toBe('2026-03-01T09:00:00.001Z');
    const stamps = Object.fromEntries(result.entries.map((entry) => [entry.id, [entry.updatedAt, entry.deletedAt]]));
    expect(stamps).toEqual({
      [theirs.id]: [earlier, null],
      [mine.id]: [instant('2026-03-01T11:00:00.001Z'), null],
      [ahead.id]: [instant('2026-03-01T10:00:00.001Z'), ahead.deletedAt],
      // Deleted on this clock, written after the row as stored.
      [live.id]: [instant('2026-03-02T00:00:00.001Z'), earlier],
      [gone.id]: [instant('2026-03-01T10:00:00.001Z'), gone.deletedAt],
    });
  });

  it('does not add a monthly buy for a month recorded or skipped here, and counts it as taken', () => {
    const skip = { id: id(), slot: month('2026-03'), note: '', createdAt: now };
    const here = aPlan({ skips: [skip] });
    const recorded = anEntry({ slot: month('2026-02') });
    const january = anEntry({ slot: month('2026-01') });
    const february = anEntry({ slot: month('2026-02'), coin: ETH.id });
    const march = anEntry({ slot: month('2026-03') });
    const extra = anEntry({ kind: 'extra', slot: null });
    const backup = exportBackup(plan, [january, february, march, extra], exportedAt);
    const result = applyImport({ plan: here, entries: [recorded] }, backup, 'add-missing', now);
    expect(result.entries).toEqual([recorded, { ...january, updatedAt: now }, { ...extra, updatedAt: now }]);
    expect([result.added, result.skipped, result.deleted, result.taken]).toEqual([2, 0, 0, 2]);
  });

  it('adds every coin of a month that is open here, and checks the id before the month', () => {
    const btc = anEntry({ slot: month('2026-05'), coin: BTC.id });
    const eth = anEntry({ slot: month('2026-05'), coin: ETH.id });
    const backup = exportBackup(plan, [btc, eth], exportedAt);
    const open = applyImport({ plan, entries: [] }, backup, 'add-missing', now);
    expect([open.added, open.taken]).toEqual([2, 0]);
    const ownRow = applyImport({ plan, entries: [btc] }, backup, 'add-missing', now);
    expect([ownRow.added, ownRow.skipped, ownRow.taken]).toEqual([0, 1, 1]);
  });

  it('adds only the entries it does not have, by id, and keeps the plan', () => {
    const result = applyImport({ plan, entries: [mine, gone] }, file, 'add-missing', now);
    expect(result.plan).toBe(plan);
    expect(result.entries).toEqual([mine, gone, { ...theirs, updatedAt: now }]);
    expect([result.added, result.skipped, result.deleted]).toEqual([1, 1, 0]);
  });

  it('keeps an entry deleted on this device deleted, and counts it apart from those already here', () => {
    const entries = [anEntry(), anEntry(), anEntry()];
    const backup = exportBackup(plan, entries, exportedAt);
    const [first, ...rest] = entries;
    if (first === undefined) throw new Error('three entries');
    const device = [{ ...first, deletedAt: now }, ...rest];
    const result = applyImport({ plan, entries: device }, backup, 'add-missing', now);
    expect([result.added, result.skipped, result.deleted]).toEqual([0, entries.length - 1, 1]);
    expect(result.entries).toEqual(device);
  });

  it('adds only the live entries of the file: add-missing never deletes, so a tombstone in it is ignored', () => {
    const tombstone = anEntry({ deletedAt: instant('2026-03-01T10:00:00Z') });
    const read = readBackup(roundTrip({ ...file, entries: [tombstone, theirs] }));
    if (!read.ok) throw new Error('a file with a tombstone is read');
    const result = applyImport({ plan, entries: [] }, read.value, 'add-missing', now);
    expect(result.entries).toEqual([{ ...theirs, updatedAt: now }]);
    expect([result.added, result.skipped, result.deleted]).toEqual([1, 0, 0]);
  });

  it('counts nothing as deleted here when it replaces everything', () => {
    const result = applyImport({ plan, entries: [mine, gone] }, file, 'replace', now);
    expect(result.deleted).toBe(0);
  });

  it('adds nothing from a file whose amounts are in another currency, keeps the plan and names both', () => {
    const usd = exportBackup(aPlan({ payCurrency: 'USD' }), [theirs], exportedAt);
    const result = applyImport({ plan, entries: [mine, gone] }, usd, 'add-missing', now);
    expect(result.refused).toEqual({ code: 'currency-mismatch', file: 'USD', plan: 'EUR' });
    expect(result.plan).toBe(plan);
    expect(result.entries).toEqual([mine, gone]);
    expect([result.added, result.skipped, result.deleted, result.taken]).toEqual([0, 0, 0, 0]);
  });

  it('adds as before when the currencies match, and takes the file’s plan and currency on a replace or with none', () => {
    expect(applyImport({ plan, entries: [mine] }, file, 'add-missing', now).refused).toBeNull();
    const usd = exportBackup(aPlan({ payCurrency: 'USD' }), [theirs], exportedAt);
    const replaced = applyImport({ plan, entries: [mine] }, usd, 'replace', now);
    expect([replaced.refused, replaced.plan.payCurrency, replaced.added]).toEqual([null, 'USD', 1]);
    const taken = applyImport({ plan: null, entries: [] }, usd, 'add-missing', now);
    expect([taken.refused, taken.plan.payCurrency, taken.added]).toEqual([null, 'USD', 1]);
  });

  it('refuses an import whose merged entries do not all read as entries, naming them, and applies nothing', () => {
    // A file read by readBackup holds valid entries; a caller that builds one by hand may not.
    const malformed = { ...theirs, units: units('0') };
    const damaged: BackupFile = { ...file, entries: [malformed, mine] };
    for (const mode of ['replace', 'add-missing'] as const) {
      const result = applyImport({ plan, entries: [gone] }, damaged, mode, now);
      expect(result).toEqual({
        plan,
        entries: [gone],
        added: 0,
        skipped: 0,
        deleted: 0,
        taken: 0,
        refused: { code: 'invalid-entries', ids: [theirs.id] },
      });
    }
  });

  it('takes the plan from the file when there is none yet', () => {
    expect(applyImport({ plan: null, entries: [] }, file, 'add-missing', now).plan).toEqual({
      ...file.plan,
      updatedAt: now,
    });
  });
});

// A plan holds at most MAX_ENTRIES live entries (docs/DOMAIN.md §9), so that its next export reads back.
describe('applyImport, the entry cap (docs/DOMAIN.md §3.13)', () => {
  const extras = (count: number): Entry[] =>
    Array.from({ length: count }, () => anEntry({ kind: 'extra', slot: null }));
  const backup = (entries: Entry[]): BackupFile => ({ ...exportBackup(plan, [], exportedAt), entries });
  const reExport = (result: ImportResult) => readBackup(roundTrip(exportBackup(result.plan, result.entries, now)));
  const mine = extras(6_000);
  const theirs = backup(extras(6_000));

  it('refuses an add that would leave more than 10,000 live entries, and changes nothing', () => {
    const result = applyImport({ plan, entries: mine }, theirs, 'add-missing', now);
    expect(result.refused).toEqual({ code: 'too-many-entries', entries: 12_000, file: 6_000, max: MAX_ENTRIES });
    expect(result.plan).toBe(plan);
    expect(result.entries).toBe(mine);
    expect([result.added, result.skipped, result.deleted, result.taken]).toEqual([0, 0, 0, 0]);
    // The rollback read: the rows as they stay still export to a file that reads back.
    expect(reExport(result).ok).toBe(true);
  });

  it('refuses any import of a file with more live entries than a plan holds, as a DCA plan page file can be', () => {
    // readBackup refuses such a file; the prototype import builds its backup with exportBackup, unread.
    const many = exportBackup(plan, extras(MAX_ENTRIES + 1), exportedAt);
    for (const current of [
      { plan, entries: mine },
      { plan: null, entries: [] },
    ]) {
      for (const mode of ['replace', 'add-missing'] as const) {
        const result = applyImport(current, many, mode, now);
        // Add missing keeps the entries here as well; a replace takes the file's alone.
        const entries = 10_001 + (mode === 'replace' ? 0 : current.entries.length);
        expect(result.refused).toEqual({ code: 'too-many-entries', entries, file: 10_001, max: 10_000 });
        expect([result.entries, result.added]).toEqual([current.entries, 0]);
      }
    }
  });

  it('counts only live entries on an add: tombstones here and the file’s tombstones do not count', () => {
    const gone = extras(3).map((entry) => ({ ...entry, deletedAt: now }));
    const added = applyImport(
      { plan, entries: [...mine, ...gone] },
      backup([...gone, ...extras(4_000)]),
      'add-missing',
      now,
    );
    expect([added.refused, added.added]).toEqual([null, 4_000]);
  });

  it('counts only live entries on a replace: what it removes does not count, at the cap', () => {
    // A full file over one entry here: counting the removed entry's tombstone would make 10,001 and refuse.
    const replaced = applyImport({ plan, entries: extras(1) }, backup(extras(MAX_ENTRIES)), 'replace', now);
    expect([replaced.refused, replaced.added, replaced.entries.length]).toEqual([null, 10_000, 10_001]);
  });

  it.each([
    [9_999, null],
    [10_000, null],
    [10_001, 'too-many-entries'],
  ])(
    'with %i live entries after an add refuses with %s; what it leaves exports a file that reads back',
    (total, code) => {
      const result = applyImport({ plan, entries: mine }, backup(extras(total - mine.length)), 'add-missing', now);
      expect(result.refused?.code ?? null).toBe(code);
      expect(liveEntries(result.entries).length).toBe(code === null ? total : mine.length);
      // The forward read: the next export of what the import leaves is a backup that readBackup takes.
      expect(reExport(result).ok).toBe(true);
    },
  );

  it('round-trips a plan at exactly 10,000 live entries, its tombstones left out, through readBackup', () => {
    const full = [...extras(MAX_ENTRIES), ...extras(2).map((entry) => ({ ...entry, deletedAt: now }))];
    const read = readBackup(roundTrip(exportBackup(plan, full, now)));
    expect(read.ok && read.value.entries.length).toBe(MAX_ENTRIES);
  });
});

// Settings reads no file over IMPORT_MAX_BYTES (docs/DOMAIN.md §9), so the cap stays above any file an export writes.
describe('IMPORT_MAX_BYTES (docs/DOMAIN.md §9)', () => {
  const weight = (note: string, venue: string | null, skipNote: string) => {
    const skips = Array.from({ length: MAX_SLOTS }, () => ({
      id: id(),
      slot: month('2026-01'),
      note: skipNote,
      createdAt: now,
    }));
    const entries = Array.from({ length: MAX_ENTRIES }, () => anEntry({ note, venue }));
    // As Settings writes it: the file as written, two-space indented, with a final line break, in UTF-8.
    const text = `${JSON.stringify(writtenBackup(exportBackup(aPlan({ skips }), entries, exportedAt)), null, 2)}\n`;
    return new TextEncoder().encode(text).length;
  };

  it('is above the heaviest export of a full plan, every note and venue at its longest and escaped to six bytes', () => {
    // Measured 2026-10-27: about 4.1 MB with no notes, 9.5 MB with every note in plain letters, 36.8 MB escaped.
    expect(weight('', null, '')).toBeLessThan(4_200_000);
    expect(
      weight('n'.repeat(ENTRY_NOTE_MAX_LENGTH), 'v'.repeat(VENUE_MAX_LENGTH), 's'.repeat(NOTE_MAX_LENGTH)),
    ).toBeLessThan(10_000_000);
    const control = '\u0001';
    const heaviest = weight(
      control.repeat(ENTRY_NOTE_MAX_LENGTH),
      control.repeat(VENUE_MAX_LENGTH),
      control.repeat(NOTE_MAX_LENGTH),
    );
    expect(heaviest).toBeLessThan(IMPORT_MAX_BYTES);
    expect(heaviest).toBeGreaterThan(IMPORT_MAX_BYTES * 0.7);
  });
});
