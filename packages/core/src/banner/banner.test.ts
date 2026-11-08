import { describe, expect, it } from 'vitest';
import { anEntry, date, instant } from '../../test/builders';
import { type BannerState, backupNeeded, bannerFor } from './banner';

const today = date('2026-10-30');
const state = (overrides: Partial<BannerState>): BannerState => ({
  today,
  redDay: null,
  ruleChange: null,
  backupNeeded: false,
  dismissed: [],
  ...overrides,
});
const everything = state({
  redDay: { start: date('2026-10-28'), last: date('2026-10-29') },
  ruleChange: { version: 4 },
  backupNeeded: true,
});

describe('bannerFor (docs/DOMAIN.md §3.11, ADR-0013)', () => {
  it('shows one banner: Red day, then a rule change, then backup needed', () => {
    expect(bannerFor(everything)).toEqual({ kind: 'red-day', key: 'red-day:2026-10-28' });
    expect(bannerFor({ ...everything, redDay: null })).toEqual({ kind: 'rule-change', key: 'rule-change:4' });
    expect(bannerFor(state({ backupNeeded: true }))).toEqual({
      kind: 'backup-needed',
      key: 'backup-needed:2026-10-30',
    });
    expect(bannerFor(state({}))).toBeNull();
  });

  it('passes over a banner dismissed for its episode', () => {
    expect(bannerFor({ ...everything, dismissed: ['red-day:2026-10-28'] })?.kind).toBe('rule-change');
    expect(bannerFor({ ...everything, dismissed: ['red-day:2026-09-01'] })?.kind).toBe('red-day');
  });

  it('keeps a dismissed backup banner away for 90 days', () => {
    const backup = state({ backupNeeded: true, dismissed: ['backup-needed:2026-08-01'] });
    expect(bannerFor({ ...backup, today: date('2026-10-29') })).toBeNull();
    expect(bannerFor({ ...backup, today: date('2026-10-30') })?.kind).toBe('backup-needed');
    expect(bannerFor(state({ backupNeeded: true, dismissed: ['backup-needed:soon'] }))?.kind).toBe('backup-needed');
  });
});

describe('backupNeeded (docs/DOMAIN.md §3.11, ADR-0004)', () => {
  const entries = [anEntry({})];
  const prefs = (lastBackupAt: string | null, changedAt: string | null) => ({
    lastBackupAt: lastBackupAt === null ? null : instant(lastBackupAt),
    changedAt: changedAt === null ? null : instant(changedAt),
  });

  it('asks for a copy once entries exist and none was ever exported', () => {
    expect(backupNeeded(entries, prefs(null, null), false)).toBe(true);
    expect(backupNeeded([], prefs(null, null), false)).toBe(false);
    expect(
      backupNeeded([{ ...anEntry({}), deletedAt: instant('2026-10-01T10:00:00Z') }], prefs(null, null), false),
    ).toBe(false);
  });

  it('asks again when the data changed after the last export, comparing moments', () => {
    expect(backupNeeded(entries, prefs('2026-10-16T09:00:00Z', '2026-10-16T09:30:00Z'), false)).toBe(true);
    // 10:00+02:00 is 08:00Z: the change came before the export.
    expect(backupNeeded(entries, prefs('2026-10-16T09:00:00Z', '2026-10-16T10:00:00+02:00'), false)).toBe(false);
    expect(backupNeeded(entries, prefs('2026-10-16T09:00:00Z', null), false)).toBe(false);
  });

  it('never asks when an account keeps the data', () => {
    expect(backupNeeded(entries, prefs(null, null), true)).toBe(false);
  });
});
