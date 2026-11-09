import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { anEntry, date, instant } from '../../test/builders';
import { RED_DAY } from '../constants';
import { addDays } from '../dates/calendar';
import { type BannerState, backupNeeded, bannerFor, withBannerKey } from './banner';

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

  it('a red-day key from seven days before the start covers the episode, one from eight days before does not', () => {
    const episode = { start: date('2026-10-28'), last: date('2026-10-29') };
    const shown = (dismissed: string[]) => bannerFor(state({ redDay: episode, dismissed }))?.kind ?? null;
    expect(shown(['red-day:2026-10-21'])).toBeNull();
    expect(shown(['red-day:2026-10-20'])).toBe('red-day');
    expect(shown(['red-day:2026-10-30'])).toBeNull();
    // A key dated after today (a clock set back) covers nothing, and neither does a key that is not a date.
    expect(shown(['red-day:2026-10-31'])).toBe('red-day');
    expect(shown(['red-day:soon', 'backup-needed:2026-10-27'])).toBe('red-day');
  });

  it('a new episode after seven clear days shows again', () => {
    // A one-day episode on 20 Oct: a Red day within seven clear days of it would extend it, so the next episode
    // starts on 28 Oct at the earliest, and its cover reaches back to 21 Oct only.
    const first = date('2026-10-20');
    const second = { start: addDays(first, RED_DAY.episodeClearDays + 1), last: date('2026-10-29') };
    expect(second.start).toBe('2026-10-28');
    expect(bannerFor(state({ redDay: second, dismissed: [`red-day:${first}`] }))?.kind).toBe('red-day');
    expect(bannerFor(state({ redDay: second, dismissed: [`red-day:${second.start}`] }))).toBeNull();
  });

  it('a recorded day d covers the episode started on s exactly when s − 7 days <= d <= today', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -400, max: 0 }),
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: -420, max: 20 }),
        (startOffset, lastSpan, recordedOffset) => {
          const start = addDays(today, startOffset);
          const last = addDays(start, Math.min(lastSpan, -startOffset));
          const recorded = addDays(today, recordedOffset);
          const covered = recordedOffset >= startOffset - RED_DAY.coverDays && recordedOffset <= 0;
          const banner = bannerFor(state({ redDay: { start, last }, dismissed: [`red-day:${recorded}`] }));
          expect(banner === null).toBe(covered);
        },
      ),
    );
  });

  it('keeps a dismissed backup banner away for 90 days', () => {
    const backup = state({ backupNeeded: true, dismissed: ['backup-needed:2026-08-01'] });
    expect(bannerFor({ ...backup, today: date('2026-10-29') })).toBeNull();
    expect(bannerFor({ ...backup, today: date('2026-10-30') })?.kind).toBe('backup-needed');
    expect(bannerFor(state({ backupNeeded: true, dismissed: ['backup-needed:soon'] }))?.kind).toBe('backup-needed');
  });
});

describe('withBannerKey (docs/DOMAIN.md §3.11)', () => {
  it('appends the key once and keeps every other key', () => {
    const kept = ['backup-needed:2025-01-01', 'red-day:soon'];
    expect(withBannerKey(kept, 'red-day:2026-10-28', today)).toEqual([...kept, 'red-day:2026-10-28']);
    expect(withBannerKey([...kept, 'red-day:2026-10-28'], 'red-day:2026-10-28', today)).toEqual([
      ...kept,
      'red-day:2026-10-28',
    ]);
  });

  it('drops the red-day keys more than 365 days before today', () => {
    const dismissed = ['red-day:2025-10-29', 'red-day:2025-10-30', 'red-day:2026-09-01'];
    expect(withBannerKey(dismissed, 'red-day:2026-10-28', today)).toEqual([
      'red-day:2025-10-30',
      'red-day:2026-09-01',
      'red-day:2026-10-28',
    ]);
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
