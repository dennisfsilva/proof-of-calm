import { type CalendarDate, type EntityId, endBuying, type Instant, type Plan, pausePlan } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { reminderFile, reminderGap } from './reminder';

// The plan's calendar file (ADR-0003 Readings), made by onboarding's reminder step and Settings: one monthly
// series on the buy day from the next open one to the last, its UID the plan's id, with no coin or amount.

const plan = fixtureSnapshot().plan as Plan;
const NOW = '2026-10-20T10:00:00.000Z' as Instant;
const WORDS = { summary: 'Your buy day', description: 'It is your buy day. Open Proof of Calm to record it.' };
const day = (text: string) => text as CalendarDate;

describe('reminderFile', () => {
  it("names the plan's id as the UID and repeats monthly on the buy day to the last buy", () => {
    const file = reminderFile(plan, day('2026-10-20'), NOW, WORDS);
    expect(file).toMatch(new RegExp(`^UID:${plan.id}\\r$`, 'm'));
    expect(file).toMatch(/^DTSTART:20261105T090000\r$/m);
    expect(file).toContain('RRULE:FREQ=MONTHLY;BYMONTHDAY=5;UNTIL=20270305T090000');
    expect(file).toContain('SUMMARY:Your buy day');
    expect(file).toContain('URL:https://');
  });

  it('carries no amount, currency or coin', () => {
    const file = reminderFile(plan, day('2026-10-20'), NOW, WORDS) ?? '';
    const withoutIds = file.replace(/^UID:.*$/gm, '');
    expect(withoutIds).not.toMatch(/\b1,?000\b|\b100\b|EUR|€|BTC|ETH|Bitcoin|Ethereum/);
  });

  it('starts after a buy day already recorded when given the entries', () => {
    const { entries } = fixtureSnapshot();
    expect(reminderFile(plan, day('2026-09-01'), NOW, WORDS)).toMatch(/^DTSTART:20260905T090000\r$/m);
    expect(reminderFile(plan, day('2026-09-01'), NOW, WORDS, entries)).toMatch(/^DTSTART:20261005T090000\r$/m);
  });

  it('gives no file once the last buy has passed', () => {
    expect(reminderFile(plan, day('2027-03-06'), NOW, WORDS)).toBeNull();
  });
});

describe('reminderGap', () => {
  // Integration read finding 1 (#221): during an open pause no file is made, and the buy days are paused, not gone.
  it('is paused when the buy days left fall in a pause, so no file is made', () => {
    const paused = pausePlan(plan, {
      from: day('2026-10-20'),
      until: null,
      note: '',
      id: '00000000-0000-4000-8000-000000003000' as EntityId,
      now: NOW,
    });
    if (!paused.ok) throw new Error(paused.error.code);
    expect(reminderFile(paused.value, day('2026-10-20'), NOW, WORDS)).toBeNull();
    expect(reminderGap(paused.value, [], day('2026-10-20'))).toBe('paused');
  });

  it('is none-left once the last buy has passed', () => {
    expect(reminderGap(plan, [], day('2027-03-06'))).toBe('none-left');
  });

  // Integration read finding 3 (#225): after an end the person learns that a calendar file keeps its events.
  it('is ended once buying ended, so no buy day is left', () => {
    const ended = endBuying(plan, day('2026-10-20'), NOW);
    if (!ended.ok) throw new Error(ended.error.code);
    expect(reminderFile(ended.value, day('2026-10-21'), NOW, WORDS)).toBeNull();
    expect(reminderGap(ended.value, [], day('2026-10-21'))).toBe('ended');
  });

  // Review finding (#227): an ended plan cannot be resumed, so a pause over its last buy day still answers ended.
  it('is ended when buying ended on a buy day inside an open pause', () => {
    const paused = pausePlan(plan, {
      from: day('2026-10-20'),
      until: null,
      note: '',
      id: '00000000-0000-4000-8000-000000003000' as EntityId,
      now: NOW,
    });
    if (!paused.ok) throw new Error(paused.error.code);
    const ended = endBuying(paused.value, day('2026-11-05'), NOW);
    if (!ended.ok) throw new Error(ended.error.code);
    expect(reminderFile(ended.value, day('2026-11-05'), NOW, WORDS)).toBeNull();
    expect(reminderGap(ended.value, [], day('2026-11-05'))).toBe('ended');
  });

  // Integration read finding (#227): the end keeps today's buy day open in the app, but the calendar file goes.
  it('is ended on the day of an end that falls on an open buy day', () => {
    const ended = endBuying(plan, day('2026-11-05'), NOW);
    if (!ended.ok) throw new Error(ended.error.code);
    expect(reminderFile(ended.value, day('2026-11-05'), NOW, WORDS)).toBeNull();
    expect(reminderGap(ended.value, [], day('2026-11-05'))).toBe('ended');
  });
});
