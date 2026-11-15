import { describe, expect, it } from 'vitest';
import { siteToday } from './today';

// The day the build renders the public pages at (ADR-0045 Deviations of 2026-11-15): `SITE_TODAY` passes
// through core's calendar-date parser, so only a real date reaches the review lines.

const NOW = new Date('2026-11-15T23:30:00-02:00');

describe('siteToday', () => {
  it('is the UTC date of the instant passed in when SITE_TODAY is absent', () => {
    expect(siteToday(undefined, NOW)).toBe('2026-11-16');
    expect(siteToday(undefined, new Date('2026-10-20T00:00:00Z'))).toBe('2026-10-20');
  });

  it('takes a valid SITE_TODAY as it is', () => {
    expect(siteToday('2026-10-20', NOW)).toBe('2026-10-20');
    expect(siteToday('2028-02-29', NOW)).toBe('2028-02-29');
  });

  it.each(['2026-13-45', '2026-02-30', '9999-99-99', '2026-10-2', '', ' 2026-10-20'])(
    'stops the build on SITE_TODAY=%j, naming the variable and the value',
    (value) => {
      expect(() => siteToday(value, NOW)).toThrow(`SITE_TODAY is "${value}", not a calendar date YYYY-MM-DD`);
    },
  );
});
