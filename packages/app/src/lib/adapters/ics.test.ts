import { addMonthsClamped, type CalendarDate, type Entry, isOpen, type Plan, slotStatuses } from '@proofofcalm/core';
import { anEntry, aPlan, date, id, instant, month } from '@proofofcalm/core/testing';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type CalendarReminder, calendarReminder } from './ics';

const LINK = 'https://proofofcalm.com/today';

function reminder(plan: Plan, overrides: Partial<CalendarReminder> = {}): string | null {
  return calendarReminder({
    plan,
    entries: [],
    today: date('2026-10-17'),
    summary: 'Proof of Calm: buy day',
    description: 'Record it.',
    url: LINK,
    uid: 'plan-1@proofofcalm.com',
    stamp: instant('2026-10-17T09:30:00.000Z'),
    ...overrides,
  });
}

const ics = (lines: readonly string[]) => `${lines.join('\r\n')}\r\n`;

const body = (summary = 'Proof of Calm: buy day', description = 'Record it.\\n\\nhttps://proofofcalm.com/today') => [
  `SUMMARY:${summary}`,
  `DESCRIPTION:${description}`,
  `URL:${LINK}`,
  'TRANSP:TRANSPARENT',
  'BEGIN:VALARM',
  'ACTION:DISPLAY',
  `DESCRIPTION:${summary}`,
  'TRIGGER:PT0S',
  'END:VALARM',
  'END:VEVENT',
];

const HEADER = ['BEGIN:VCALENDAR', 'PRODID:-//Proof of Calm//Calendar reminder//EN', 'VERSION:2.0'];

describe('calendarReminder (RFC 5545, docs/ROADMAP.md M1)', () => {
  it('writes one monthly series on the buy day at 09:00 floating time, ending at the last buy', () => {
    const plan = aPlan({ firstBuy: date('2026-11-01'), buyDay: 1, lastBuy: date('2027-04-01') });
    expect(reminder(plan)).toBe(
      ics([
        ...HEADER,
        'BEGIN:VEVENT',
        'UID:plan-1@proofofcalm.com',
        'DTSTAMP:20261017T093000Z',
        'DTSTART:20261101T090000',
        'DURATION:PT15M',
        'RRULE:FREQ=MONTHLY;BYMONTHDAY=1;UNTIL=20270401T090000',
        ...body(),
        'END:VCALENDAR',
      ]),
    );
  });

  it('gives a first buy off the buy day an event of its own, so the series starts on the buy day', () => {
    const plan = aPlan({ firstBuy: date('2026-10-20'), buyDay: 1, lastBuy: date('2027-01-01') });
    expect(reminder(plan)).toBe(
      ics([
        ...HEADER,
        'BEGIN:VEVENT',
        'UID:2026-10-plan-1@proofofcalm.com',
        'DTSTAMP:20261017T093000Z',
        'DTSTART:20261020T090000',
        'DURATION:PT15M',
        ...body(),
        'BEGIN:VEVENT',
        'UID:plan-1@proofofcalm.com',
        'DTSTAMP:20261017T093000Z',
        'DTSTART:20261101T090000',
        'DURATION:PT15M',
        'RRULE:FREQ=MONTHLY;BYMONTHDAY=1;UNTIL=20270101T090000',
        ...body(),
        'END:VCALENDAR',
      ]),
    );
  });

  it('keeps buy day 28 in February, and stamps the file in UTC', () => {
    const plan = aPlan({ firstBuy: date('2027-01-28'), buyDay: 28, lastBuy: date('2027-03-31') });
    const text = reminder(plan, { today: date('2027-01-28'), stamp: instant('2027-01-28T08:15:00.5+01:00') });
    expect(text).toBe(
      ics([
        ...HEADER,
        'BEGIN:VEVENT',
        'UID:plan-1@proofofcalm.com',
        'DTSTAMP:20270128T071500Z',
        'DTSTART:20270128T090000',
        'DURATION:PT15M',
        'RRULE:FREQ=MONTHLY;BYMONTHDAY=28;UNTIL=20270328T090000',
        ...body(),
        'END:VCALENDAR',
      ]),
    );
    expect(calendarDays(text)).toEqual(['2027-01-28', '2027-02-28', '2027-03-28']);
  });

  it('starts from the next open buy day and leaves out the handled ones inside the series', () => {
    const plan = aPlan({
      firstBuy: date('2026-01-15'),
      buyDay: 15,
      lastBuy: date('2027-06-15'),
      skips: [{ id: id(), slot: month('2026-12'), note: 'car repair', createdAt: instant('2026-10-01T09:00:00Z') }],
      pauses: [{ id: id(), from: date('2027-02-01'), until: date('2027-03-31'), note: '' }],
    });
    // October is late (never the reminder) and November is already recorded.
    const entries = [anEntry({ slot: month('2026-11'), date: date('2026-10-16') })];
    const text = reminder(plan, { entries });
    expect(lines(text).filter((line) => /^(DTSTART|RRULE|EXDATE)/.test(line))).toEqual([
      'DTSTART:20270115T090000',
      'RRULE:FREQ=MONTHLY;BYMONTHDAY=15;UNTIL=20270615T090000',
      'EXDATE:20270215T090000,20270315T090000',
    ]);
    expect(calendarDays(text)).toEqual(['2027-01-15', '2027-04-15', '2027-05-15', '2027-06-15']);
  });

  it('ends the series at the last open buy day when the end of the plan is paused', () => {
    const plan = aPlan({
      firstBuy: date('2026-11-01'),
      lastBuy: date('2027-06-01'),
      pauses: [{ id: id(), from: date('2027-02-01'), until: null, note: '' }],
    });
    expect(lines(reminder(plan)).filter((line) => line.startsWith('RRULE'))).toEqual([
      'RRULE:FREQ=MONTHLY;BYMONTHDAY=1;UNTIL=20270101T090000',
    ]);
  });

  it('writes a single event for the last buy day, and nothing once no buy day is left', () => {
    const last = aPlan({ firstBuy: date('2026-01-01'), lastBuy: date('2026-11-01') });
    expect(lines(reminder(last)).filter((line) => /^(DTSTART|RRULE)/.test(line))).toEqual(['DTSTART:20261101T090000']);
    const ended = aPlan({
      firstBuy: date('2026-01-01'),
      lastBuy: date('2026-09-15'),
      endedBuyingOn: date('2026-09-15'),
    });
    expect(reminder(ended)).toBeNull();
    const skippedTail = aPlan({
      firstBuy: date('2026-01-01'),
      lastBuy: date('2026-11-01'),
      skips: [{ id: id(), slot: month('2026-11'), note: '', createdAt: instant('2026-10-01T09:00:00Z') }],
    });
    expect(reminder(skippedTail)).toBeNull();
  });

  it('escapes TEXT values and drops the control characters TEXT cannot hold', () => {
    const plan = aPlan({ firstBuy: date('2026-11-01'), lastBuy: date('2026-11-01') });
    const text = reminder(plan, {
      summary: 'Buy day; BTC, ETH \\ SOL: 09:00',
      description: 'One\r\nTwo\nThree\rFour\u0007\tend',
      uid: 'a,b;c@proofofcalm.com',
    });
    expect(lines(text)).toEqual(
      expect.arrayContaining([
        'UID:a\\,b\\;c@proofofcalm.com',
        'SUMMARY:Buy day\\; BTC\\, ETH \\\\ SOL: 09:00',
        'DESCRIPTION:One\\nTwo\\nThree\\nFour\tend\\n\\nhttps://proofofcalm.com/today',
      ]),
    );
  });

  it('folds lines at 75 octets with a leading space, never inside a character', () => {
    const plan = aPlan({ firstBuy: date('2026-11-01'), lastBuy: date('2026-11-01') });
    const summary = 'b'.repeat(67);
    const text = reminder(plan, { summary, description: `${'a'.repeat(62)}éz`, url: 'https://proofofcalm.com/today' });
    expect(text).toContain(`\r\nSUMMARY:${summary}\r\n`);
    expect(text).toContain(`\r\nDESCRIPTION:${'a'.repeat(62)}\r\n éz\\n\\nhttps://proofofcalm.com/today\r\n`);
    expect(text).toContain(`\r\nDESCRIPTION:${'b'.repeat(63)}\r\n bbbb\r\n`);
  });

  it('keeps every line within 75 octets of valid UTF-8, filled greedily, and unfolds to the original', () => {
    const plan = aPlan({ firstBuy: date('2026-11-01'), lastBuy: date('2026-11-01') });
    const encoder = new TextEncoder();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 300 }), (words) => {
        const text = reminder(plan, { summary: words, description: words }) ?? '';
        expect(text.endsWith('\r\n')).toBe(true);
        const physical = text.slice(0, -2).split('\r\n');
        physical.forEach((line, index) => {
          const bytes = encoder.encode(line);
          expect(bytes.length).toBeLessThanOrEqual(75);
          expect(decoder.decode(bytes)).toBe(line);
          expect(line).not.toMatch(/[\r\n]/);
          const next = physical[index + 1];
          if (next?.startsWith(' ')) {
            const [carried = ''] = [...next.slice(1)];
            expect(bytes.length + encoder.encode(carried).length).toBeGreaterThan(75);
          }
        });
        const summaryLine = lines(text).find((line) => line.startsWith('SUMMARY:')) ?? '';
        expect(unescapeText(summaryLine.slice('SUMMARY:'.length))).toBe(textOf(words));
      }),
    );
  });

  it('shows exactly the open buy days from the next one, read the way RFC 5545 defines the series', () => {
    fc.assert(
      fc.property(planCase(), ({ plan, entries, today }) => {
        const text = reminder(plan, { entries, today });
        const open = slotStatuses(plan, entries, today)
          .filter((slot) => isOpen(slot.status) && slot.due >= today)
          .map((slot) => slot.due);
        expect(text === null ? [] : calendarDays(text)).toEqual(open);
      }),
    );
  });

  it('refuses a link that is not a URL', () => {
    const plan = aPlan({ firstBuy: date('2026-11-01'), lastBuy: date('2026-11-01') });
    expect(() => reminder(plan, { url: '/today' })).toThrow(TypeError);
  });
});

/** The logical lines: folds undone (RFC 5545 §3.1). */
function lines(text: string | null): string[] {
  return (text ?? '').replace(/\r\n /g, '').split('\r\n');
}

/** A TEXT value read back: \\n, \\, \\; and \\, undone. */
function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_match, char: string) => (char === 'n' || char === 'N' ? '\n' : char));
}

/** What the builder keeps of free text: line breaks as one \n, controls other than tab dropped. */
function textOf(value: string): string {
  return [...value.replace(/\r\n?/g, '\n')]
    .filter((char) => char === '\n' || char === '\t' || (char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127))
    .join('');
}

/** The days a calendar shows for this file, for the subset of RFC 5545 the builder writes. */
function calendarDays(text: string | null): string[] {
  const days: string[] = [];
  let event = new Map<string, string>();
  for (const line of lines(text)) {
    const [name = '', value = ''] = line.split(/:(.*)/s);
    if (line === 'BEGIN:VEVENT') event = new Map();
    else if (line === 'END:VEVENT') days.push(...occurrences(event));
    else event.set(name, value);
  }
  return days.sort();
}

function occurrences(event: ReadonlyMap<string, string>): string[] {
  const start = toDate(event.get('DTSTART') ?? '');
  const rule = event.get('RRULE');
  if (rule === undefined) return [start];
  const parts = Object.fromEntries(rule.split(';').map((part) => part.split('=')));
  const until = toDate(parts.UNTIL ?? '');
  const excluded = (event.get('EXDATE') ?? '').split(',').filter(Boolean).map(toDate);
  expect(Number(parts.BYMONTHDAY)).toBe(Number(start.slice(8, 10)));
  const result: string[] = [];
  for (let day = start; day <= until; day = addMonthsClamped(day, 1)) {
    if (!excluded.includes(day)) result.push(day);
  }
  return result;
}

function toDate(value: string): CalendarDate {
  return date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`);
}

/** Plans with a buy day, a first buy on any day, skips, at most one pause and some recorded months. */
function planCase() {
  return fc
    .record({
      start: fc.integer({ min: 0, max: 47 }),
      firstDay: fc.integer({ min: 1, max: 28 }),
      buyDay: fc.integer({ min: 1, max: 28 }),
      months: fc.integer({ min: 0, max: 30 }),
      lastDay: fc.integer({ min: 1, max: 28 }),
      todayOffset: fc.integer({ min: -40, max: 1000 }),
      skipped: fc.uniqueArray(fc.integer({ min: 0, max: 30 }), { maxLength: 4 }),
      done: fc.uniqueArray(fc.integer({ min: 0, max: 30 }), { maxLength: 4 }),
      pause: fc.option(fc.record({ from: fc.integer({ min: 0, max: 30 }), length: fc.option(fc.nat(8)) })),
    })
    .map((spec) => {
      const firstBuy = addMonthsClamped(date('2025-01-01'), spec.start, spec.firstDay);
      const lastBuy = addMonthsClamped(firstBuy, spec.months, spec.lastDay);
      const key = (index: number) => month(addMonthsClamped(firstBuy, index).slice(0, 7));
      const on = (index: number) => addMonthsClamped(firstBuy, index, 1);
      const pause = spec.pause;
      const plan = aPlan({
        firstBuy: lastBuy < firstBuy ? lastBuy : firstBuy,
        lastBuy,
        buyDay: spec.buyDay,
        skips: spec.skipped.map((index) => ({
          id: id(),
          slot: key(index),
          note: '',
          createdAt: instant('2025-01-01T00:00:00Z'),
        })),
        pauses:
          pause === null
            ? []
            : [
                {
                  id: id(),
                  from: on(pause.from),
                  until: pause.length === null ? null : addMonthsClamped(on(pause.from), pause.length, 28),
                  note: '',
                },
              ],
      });
      const entries: Entry[] = spec.done.map((index) => anEntry({ slot: key(index), date: on(index) }));
      const today = date(
        new Date(Date.parse(`${firstBuy}T00:00:00Z`) + spec.todayOffset * 86_400_000).toISOString().slice(0, 10),
      );
      return { plan, entries, today };
    });
}
