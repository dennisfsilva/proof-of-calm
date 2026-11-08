// The account-free reminder of M1 (docs/ROADMAP.md M1 onboarding "Add to calendar", ADR-0003): an
// iCalendar file (RFC 5545) with an event on every open buy day from the next one (docs/DOMAIN.md §3.12
// nextBuyReminder) to the last, at 09:00 floating time, which a calendar shows at 09:00 wherever the
// person is. The words and the link come in localised; the UID and DTSTAMP are injected.
import {
  type CalendarDate,
  dateParts,
  type Entry,
  type Instant,
  instantFromEpochMs,
  isOpen,
  nextBuyReminder,
  type Plan,
  type SlotStatus,
  slotStatuses,
} from '@proofofcalm/core';
import { BRAND } from '../brand';
import { epochMs } from './clock';

export type CalendarReminder = {
  readonly plan: Plan;
  readonly entries: readonly Entry[];
  readonly today: CalendarDate;
  /** The event's title, localised by the shell with the product's name. */
  readonly summary: string;
  readonly description: string;
  /** Where the event leads (the Today screen); also added to the description, which every calendar shows. */
  readonly url: string;
  /** Globally unique; one per plan lets a calendar recognise the series when the file is added again. */
  readonly uid: string;
  /** When the file is made; DTSTAMP is written in UTC. */
  readonly stamp: Instant;
};

const CRLF = '\r\n';
const MAX_OCTETS = 75;
const BUY_TIME = 'T090000';

/**
 * The .ics text, or null when no buy day is left. The buy days form one monthly series whose start is
 * on the buy day, as RFC 5545 §3.8.5.3 requires for a well-defined set; the plan's first slot, due on the
 * first buy rather than the buy day, becomes an event of its own. Handled days inside the series
 * (skipped, paused, already recorded) are excluded, and the series ends on the last open buy day.
 */
export function calendarReminder(input: CalendarReminder): string | null {
  const { plan, entries, today } = input;
  const next = nextBuyReminder(plan, entries, today);
  if (next === null) return null;
  const ahead = slotStatuses(plan, entries, today).filter((slot) => slot.due >= next.due);
  const open = ahead.filter((slot) => isOpen(slot.status));
  const onBuyDay = (slot: SlotStatus) => dateParts(slot.due).day === plan.buyDay;
  const series = open.filter(onBuyDay);
  const events = open
    .filter((slot) => !onBuyDay(slot))
    .map((slot) => event(input, `${slot.key}-${input.uid}`, slot.due, []));
  const [first] = series;
  const last = series.at(-1);
  if (first !== undefined && last !== undefined) {
    const recurrence =
      first === last
        ? []
        : [
            `RRULE:FREQ=MONTHLY;BYMONTHDAY=${plan.buyDay};UNTIL=${floating(last.due)}`,
            ...exdate(ahead.filter((slot) => slot.due > first.due && slot.due < last.due && !isOpen(slot.status))),
          ];
    events.push(event(input, input.uid, first.due, recurrence));
  }
  const lines = [
    'BEGIN:VCALENDAR',
    `PRODID:-//${text(BRAND.name)}//Calendar reminder//EN`,
    'VERSION:2.0',
    ...events.flat(),
    'END:VCALENDAR',
  ];
  return lines.map(fold).join(CRLF) + CRLF;
}

function event(input: CalendarReminder, uid: string, due: CalendarDate, recurrence: readonly string[]): string[] {
  const link = new URL(input.url).href;
  const description = input.description === '' ? link : `${input.description}\n\n${link}`;
  return [
    'BEGIN:VEVENT',
    `UID:${text(uid)}`,
    `DTSTAMP:${utc(input.stamp)}`,
    `DTSTART:${floating(due)}`,
    'DURATION:PT15M',
    ...recurrence,
    `SUMMARY:${text(input.summary)}`,
    `DESCRIPTION:${text(description)}`,
    `URL:${link}`,
    // A reminder, not an appointment: the person stays free in their calendar.
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${text(input.summary)}`,
    'TRIGGER:PT0S',
    'END:VALARM',
    'END:VEVENT',
  ];
}

function exdate(handled: readonly SlotStatus[]): string[] {
  return handled.length === 0 ? [] : [`EXDATE:${handled.map((slot) => floating(slot.due)).join(',')}`];
}

/** 09:00 on the day with no zone: floating time (RFC 5545 §3.3.5, form 1). */
function floating(date: CalendarDate): string {
  return `${date.replaceAll('-', '')}${BUY_TIME}`;
}

/** The instant in UTC, basic format, whole seconds (DTSTAMP must be UTC, §3.8.7.2). */
function utc(instant: Instant): string {
  return `${instantFromEpochMs(epochMs(instant)).slice(0, 19).replace(/[-:]/g, '')}Z`;
}

/**
 * A TEXT value (§3.3.11): backslash, semicolon and comma escaped, each line break as \n, and the other
 * control characters, which TEXT cannot hold, dropped (a tab may stay).
 */
function text(value: string): string {
  const escaped = value.replace(/\r\n?/g, '\n').replace(/[\\;,]/g, (char) => `\\${char}`);
  return [...escaped.replaceAll('\n', '\\n')]
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code === 9 || (code >= 32 && code !== 127);
    })
    .join('');
}

/** At most 75 octets per line (§3.1); a continuation starts with a space; no character is split. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const pieces: string[] = [];
  let current = '';
  let octets = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (octets + size > MAX_OCTETS) {
      pieces.push(current);
      current = ' ';
      octets = 1;
    }
    current += char;
    octets += size;
  }
  pieces.push(current);
  return pieces.join(CRLF);
}
