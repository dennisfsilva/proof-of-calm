import { type Instant, instantFromEpochMs } from '@proofofcalm/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { deviceLocale, epochMs, systemClock, todayIn } from './clock';

const at = (iso: string) => Date.parse(iso);

describe('todayIn (ADR-0018 vectors)', () => {
  it('names the day across the spring DST change in Lisbon and Berlin (29 Mar 2026)', () => {
    expect(todayIn(at('2026-03-29T00:30:00Z'), 'Europe/Lisbon')).toBe('2026-03-29');
    expect(todayIn(at('2026-03-29T22:30:00Z'), 'Europe/Lisbon')).toBe('2026-03-29');
    expect(todayIn(at('2026-03-28T23:30:00Z'), 'Europe/Berlin')).toBe('2026-03-29');
    expect(todayIn(at('2026-03-29T21:30:00Z'), 'Europe/Berlin')).toBe('2026-03-29');
  });

  it('names the day across the autumn DST change (25 Oct 2026)', () => {
    expect(todayIn(at('2026-10-24T23:30:00Z'), 'Europe/Lisbon')).toBe('2026-10-25');
    expect(todayIn(at('2026-10-25T23:30:00Z'), 'Europe/Lisbon')).toBe('2026-10-25');
    expect(todayIn(at('2026-10-24T22:30:00Z'), 'Europe/Berlin')).toBe('2026-10-25');
    expect(todayIn(at('2026-10-25T22:30:00Z'), 'Europe/Berlin')).toBe('2026-10-25');
  });

  it('places one instant on different days either side of midnight', () => {
    expect(todayIn(at('2026-10-16T23:30:00Z'), 'Europe/Berlin')).toBe('2026-10-17');
    expect(todayIn(at('2026-10-16T23:30:00Z'), 'America/Sao_Paulo')).toBe('2026-10-16');
    expect(todayIn(at('2026-10-16T23:30:00Z'), 'Pacific/Kiritimati')).toBe('2026-10-17');
  });

  it('agrees with the UTC day for any instant in UTC', () => {
    fc.assert(
      fc.property(fc.integer({ min: at('1970-01-01T00:00:00Z'), max: at('2200-12-31T23:59:59Z') }), (ms) => {
        expect(todayIn(ms, 'UTC')).toBe(new Date(ms).toISOString().slice(0, 10));
      }),
    );
  });

  it('refuses a timezone that does not exist', () => {
    expect(() => todayIn(0, 'Mars/Olympus_Mons')).toThrow(RangeError);
  });
});

describe('epochMs', () => {
  const instant = (value: string) => value as Instant;

  it('reads every spelling of an instant the core accepts', () => {
    const ms = Date.UTC(2026, 9, 16, 13, 5);
    expect(epochMs(instant('2026-10-16T13:05Z'))).toBe(ms);
    expect(epochMs(instant('2026-10-16T13:05:00Z'))).toBe(ms);
    expect(epochMs(instant('2026-10-16T14:05:00.1+01:00'))).toBe(ms + 100);
    expect(epochMs(instant('2026-10-16T10:05:00.123456789-03:00'))).toBe(ms + 123);
  });

  it('inverts instantFromEpochMs', () => {
    fc.assert(
      fc.property(fc.integer({ min: -62_135_596_800_000, max: 253_402_300_799_999 }), (ms) => {
        expect(epochMs(instantFromEpochMs(ms))).toBe(ms);
      }),
    );
  });

  it('refuses what is not an instant', () => {
    expect(() => epochMs(instant('2026-10-16'))).toThrow(RangeError);
    expect(() => epochMs(instant('2026-10-16T25:00:00Z'))).toThrow(RangeError);
  });
});

describe('systemClock', () => {
  it('reads the injected clock once per call, in its zone', () => {
    let ms = at('2026-10-16T23:30:00Z');
    const clock = systemClock('Europe/Lisbon', () => ms);
    expect([clock.timeZone, clock.now(), clock.today()]).toEqual([
      'Europe/Lisbon',
      '2026-10-16T23:30:00.000Z',
      '2026-10-17',
    ]);
    ms = at('2026-10-17T22:59:59Z');
    expect(clock.today()).toBe('2026-10-17');
  });

  // A write queued behind a read in the same millisecond must stamp a later moment (DOMAIN §3.11).
  it('never gives the same instant twice: on a frozen clock two calls are 1 ms apart', () => {
    const clock = systemClock('Europe/Lisbon', () => at('2026-10-16T23:30:00Z'));
    expect([clock.now(), clock.now()]).toEqual(['2026-10-16T23:30:00.000Z', '2026-10-16T23:30:00.001Z']);
  });

  it('defaults to the device clock and zone', () => {
    const clock = systemClock();
    expect(clock.timeZone.length).toBeGreaterThan(0);
    expect(clock.today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('deviceLocale (docs/JURISDICTIONS.md §3: languages and timezone, never IP)', () => {
  it('reads the ordered languages and the zone', () => {
    expect(deviceLocale({ languages: ['pt-PT', 'en'] }, () => 'Europe/Lisbon')).toEqual({
      languages: ['pt-PT', 'en'],
      timeZone: 'Europe/Lisbon',
    });
  });

  it('falls back to the one language, and to nothing without languages or a zone', () => {
    expect(deviceLocale({ language: 'de-DE' }, () => '')).toEqual({ languages: ['de-DE'], timeZone: null });
    expect(deviceLocale({}, () => undefined)).toEqual({ languages: [], timeZone: null });
  });

  it('defaults to this runtime', () => {
    const { languages, timeZone } = deviceLocale();
    expect(Array.isArray(languages)).toBe(true);
    expect(timeZone === null || timeZone.length > 0).toBe(true);
  });
});
