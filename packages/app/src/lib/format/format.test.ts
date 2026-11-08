import type { CalendarDate, Decimal, Instant, MonthKey } from '@proofofcalm/core';
import { describe, expect, it, vi } from 'vitest';
import { createFormatters, createNumberInput } from '.';

const d = (value: string) => value as Decimal;
const NBSP = '\u00a0';
/** Dates are written with no-break spaces between their parts (docs/CONTENT-STYLE.md §4). */
const nb = (text: string) => text.replaceAll(' ', NBSP);
// English copy is British (docs/CONTENT-STYLE.md: 1 November, 16 Oct 2026), so its UI locale is en-GB.
const en = createFormatters('en-IE', 'en-GB');
const pt = createFormatters('pt-PT', 'pt-PT');
const de = createFormatters('de-DE', 'de');

describe('money (docs/DESIGN.md §5)', () => {
  it('places the symbol and groups digits as the locale does, from the exact decimal', () => {
    expect(en.money(d('12345.67'), 'EUR')).toBe('€12,345.67');
    expect(pt.money(d('12345.67'), 'EUR')).toBe(`12${NBSP}345,67${NBSP}€`);
    expect(pt.money(d('1234.56'), 'EUR')).toBe(`1234,56${NBSP}€`);
    expect(de.money(d('12345.67'), 'EUR')).toBe(`12.345,67${NBSP}€`);
  });

  it('rounds half to even for display, with whole euros on request', () => {
    expect(en.money(d('1234.565'), 'EUR')).toBe('€1,234.56');
    expect(en.money(d('1234.575'), 'EUR')).toBe('€1,234.58');
    expect(en.money(d('0.1234567890123456789'), 'EUR')).toBe('€0.12');
    expect(en.money(d('1262.5'), 'EUR', { decimals: 0 })).toBe('€1,262');
  });

  it('writes the minus as U+2212, signs signed values, and never signs zero', () => {
    expect(en.money(d('-12.3'), 'EUR')).toBe('\u2212€12.30');
    expect(de.money(d('-12.3'), 'EUR')).toBe(`\u221212,30${NBSP}€`);
    expect(en.money(d('4.1'), 'EUR', { signed: true })).toBe('+€4.10');
    expect(en.money(d('-0.004'), 'EUR')).toBe('€0.00');
    expect(en.money(d('0'), 'EUR', { signed: true })).toBe('€0.00');
  });

  it('builds one Intl formatter per set of options and reuses it, since a screen formats hundreds of values', () => {
    const formatters = createFormatters('en-IE', 'en-GB');
    const built = vi.spyOn(Intl, 'NumberFormat');
    try {
      expect(formatters.money(d('1'), 'EUR', { decimals: 0 })).toBe('€1');
      expect(formatters.money(d('2'), 'EUR', { decimals: 0 })).toBe('€2');
      expect(built).toHaveBeenCalledTimes(1);
    } finally {
      built.mockRestore();
    }
  });

  it('builds each date and time formatter once and reuses it, since the chart reserve writes dozens', () => {
    const formatters = createFormatters('en-IE', 'en-GB');
    const at = '2026-07-28T10:00:00.000Z' as Instant;
    const now = '2026-10-27T10:00:00.000Z' as Instant;
    const write = () => [
      formatters.date('2026-07-28' as CalendarDate),
      formatters.time(at, 'Europe/London', now),
      formatters.instantDate(at, 'Europe/London'),
    ];
    const first = write();
    const built = vi.spyOn(Intl, 'DateTimeFormat');
    try {
      expect(write()).toEqual(first);
      expect(built).not.toHaveBeenCalled();
    } finally {
      built.mockRestore();
    }
  });
});

describe('units, percentages and multiples', () => {
  it('fixes the decimals per asset and joins the code with a no-break space', () => {
    expect(en.units(d('0.0123456789'), 'BTC', 8)).toBe(`0.01234568${NBSP}BTC`);
    expect(en.units(d('0.1'), 'SOL', 4)).toBe(`0.1000${NBSP}SOL`);
    expect(de.units(d('2.5'), 'ETH', 6)).toBe(`2,500000${NBSP}ETH`);
  });

  it('formats a 0–100 percentage with one decimal, or none for shares', () => {
    expect(en.percent(d('18.7004'))).toBe('18.7%');
    expect(en.percent(d('-12.35'), { signed: true })).toBe('\u221212.4%');
    expect(en.percent(d('2.5'), { signed: true })).toBe('+2.5%');
    expect(en.percent(d('70'), { decimals: 0 })).toBe('70%');
    expect(de.percent(d('-12.3'))).toBe(`\u221212,3${NBSP}%`);
    // Half-even: 0.05 % rounds down to 0.0 %, 0.15 % up to 0.2 %.
    expect(en.percent(d('0.05'))).toBe('0.0%');
    expect(en.percent(d('0.15'))).toBe('0.2%');
    expect(en.percent(d('100'))).toBe('100.0%');
  });

  it('writes a multiple with U+00D7 and no space', () => {
    expect(en.multiple(d('1.8945'))).toBe('1.89\u00d7');
    expect(de.multiple(d('4.04'))).toBe('4,04\u00d7');
  });
});

describe('digits', () => {
  // The generic profile formats in `und`, which Intl resolves to the device's locale: ar-EG or fa-IR
  // would write Arabic-Indic digits next to a number field that reads ASCII digits only.
  it('writes Western digits in every locale, as the number field reads them back', () => {
    const ar = createFormatters('ar-EG', 'ar-EG');
    const input = createNumberInput('ar-EG');
    const shown = ar.units(d('1234.5'), 'BTC', 1).split(NBSP)[0] ?? '';
    expect(input.parse(shown)).toEqual({ ok: true, value: '1234.5' });
    const instant = '2026-10-16T09:05:00.000Z' as Instant;
    const written = [
      ar.money(d('1234.5'), 'EUR'),
      ar.percent(d('12.5')),
      ar.multiple(d('1.89')),
      ar.date('2026-10-16' as CalendarDate),
      ar.dayMonth('2026-10-16' as CalendarDate),
      ar.month('2026-10' as MonthKey),
      ar.time(instant, 'Africa/Cairo'),
      ar.instantDate(instant, 'Africa/Cairo'),
    ];
    for (const text of written) expect(text).not.toMatch(/[٠-٩۰-۹]/);
  });
});

describe('dates (ADR-0018)', () => {
  it('renders the calendar day itself, whatever the device zone', () => {
    const date = '2026-10-16' as CalendarDate;
    expect(en.date(date)).toBe(nb('16 Oct 2026'));
    expect(pt.date(date)).toBe(nb('16 de outubro de 2026'));
    expect(de.date(date)).toBe(nb('16. Okt. 2026'));
    expect(en.dayMonth('2026-11-01' as CalendarDate)).toBe(nb('1 November'));
    expect(en.month('2026-10' as MonthKey)).toBe(nb('October 2026'));
    expect(pt.month('2026-10' as MonthKey)).toBe(nb('outubro de 2026'));
  });

  // A date never breaks across lines (docs/CONTENT-STYLE.md §4): its parts are joined by no-break spaces.
  it('joins the parts of a date with no-break spaces, and keeps the locale’s own short month', () => {
    expect(en.date('2029-09-01' as CalendarDate)).toBe(`1${NBSP}Sept${NBSP}2029`);
    expect(en.instantDate('2029-09-01T12:00:00.000Z' as Instant, 'UTC')).toBe(`1${NBSP}Sept${NBSP}2029`);
    for (const text of [en.date('2026-10-16' as CalendarDate), en.dayMonth('2026-11-01' as CalendarDate)]) {
      expect(text).not.toContain(' ');
    }
  });
});

// A holding date must never read two ways (ADR-0023, corrections of 2026-10-20): dates in copy carry the
// month name in the UI language, whatever the country, and never digits a reader could take month-first.
describe('dates across countries in one language', () => {
  const MONTH_NAME = /\p{L}{3,}/u;
  const instant = '2027-03-05T12:00:00.000Z' as Instant;

  it('writes a German plan’s dates in English in an English UI', () => {
    const english = createFormatters('de-DE', 'en-GB');
    expect(english.date('2027-03-05' as CalendarDate)).toBe(nb('5 Mar 2027'));
    expect(english.instantDate(instant, 'Europe/Berlin')).toBe(nb('5 Mar 2027'));
    expect(english.date('2027-03-05' as CalendarDate)).not.toMatch(/März|Mär/);
  });

  it('writes the same German plan in German in a German UI', () => {
    expect(createFormatters('de-DE', 'de').date('2027-03-05' as CalendarDate)).toBe(nb('5. März 2027'));
  });

  it('writes a Portuguese plan with the month name in an English UI, not 04/03/2028', () => {
    const english = createFormatters('pt-PT', 'en-GB');
    expect(english.date('2028-03-04' as CalendarDate)).toBe(nb('4 Mar 2028'));
    expect(createFormatters('en-US', 'en-GB').date('2028-03-04' as CalendarDate)).toBe(nb('4 Mar 2028'));
  });

  it('keeps a month name in every UI language, where CLDR’s short month is digits (pt-PT)', () => {
    for (const ui of ['en-GB', 'pt-PT', 'de-DE']) {
      const format = createFormatters('en-US', ui);
      expect(format.date('2028-03-04' as CalendarDate)).toMatch(MONTH_NAME);
      expect(format.instantDate(instant, 'UTC')).toMatch(MONTH_NAME);
    }
    expect(createFormatters('pt-PT', 'pt-PT').date('2028-03-04' as CalendarDate)).toBe(nb('4 de março de 2028'));
  });
});

describe('list', () => {
  // English lists take the serial comma, en-GB included (docs/CONTENT-STYLE.md §1 rule 9); other languages keep
  // their own Intl rule.
  it('joins the items as the UI language does, with its word for and, and English with the serial comma', () => {
    expect(en.list(['BTC'])).toBe('BTC');
    expect(en.list(['BTC', 'ETH'])).toBe('BTC and ETH');
    expect(en.list(['BTC', 'ETH', 'SOL'])).toBe('BTC, ETH, and SOL');
    expect(pt.list(['BTC', 'ETH', 'SOL'])).toBe('BTC, ETH e SOL');
    expect(createFormatters('en-US', 'de').list(['BTC', 'ETH'])).toBe('BTC und ETH');
  });
});
