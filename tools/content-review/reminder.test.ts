import { describe, expect, it } from 'vitest';
import { dueDate, issueBody, issueTitle, noticeDue, reminderAction, sessionNotice } from './reminder.ts';

const full = (date: string) => ({ date, scope: 'full' as const });
const second = { date: '2027-01-15', scope: 'jurisdictions' as const };
const issue = (number: number, state: string, createdAt: string, closedAt: string | null = null) => ({
  number,
  state,
  createdAt,
  closedAt,
});

describe('dueDate', () => {
  it('names nothing before the first due date', () => {
    expect(dueDate('2026-11-11')).toBeUndefined();
    expect(dueDate('2026-12-31')).toBeUndefined();
  });

  it('gives the latest due date on or before the day across the year', () => {
    expect(dueDate('2027-01-01')).toEqual(full('2027-01-01'));
    expect(dueDate('2027-01-14')).toEqual(full('2027-01-01'));
    expect(dueDate('2027-01-15')).toEqual(second);
    expect(dueDate('2027-03-31')).toEqual(second);
    expect(dueDate('2027-04-01')).toEqual(full('2027-04-01'));
    expect(dueDate('2027-07-01')).toEqual(full('2027-07-01'));
    expect(dueDate('2027-12-31')).toEqual(full('2027-10-01'));
    expect(dueDate('2028-01-01')).toEqual(full('2028-01-01'));
  });

  it('refuses a day that is not YYYY-MM-DD', () => {
    expect(() => dueDate('1 April 2027')).toThrow(/YYYY-MM-DD/);
  });
});

describe('noticeDue', () => {
  it('waits two days after a due date before the session notice counts it', () => {
    expect(noticeDue('2027-04-02')).toEqual(second);
    expect(noticeDue('2027-04-03')).toEqual(full('2027-04-01'));
  });
});

describe('issueTitle', () => {
  it('writes the date as the app does, and names the second pass', () => {
    expect(issueTitle(full('2027-04-01'))).toBe('Content review due: 1 Apr 2027');
    expect(issueTitle(second)).toBe('Content review due: 15 Jan 2027 (second pass on the countries)');
  });
});

describe('issueBody', () => {
  it('names the skill, the schedule and the owner’s review', () => {
    const body = issueBody(full('2027-07-01'));
    expect(body).toContain('/review-content');
    expect(body).toContain('docs/CONTENT-OPS.md §2');
    expect(body).toContain('docs/CONTENT-OPS.md §8');
    expect(body).toContain('1 Jul 2027');
    expect(body).toMatch(/^1\. .*\n2\. .*\n3\. Close this issue/m);
  });

  it('limits the second pass to the countries', () => {
    expect(issueBody(second)).toContain('country codes');
    expect(issueBody(full('2027-01-01'))).not.toContain('country codes');
  });
});

describe('reminderAction', () => {
  const due = full('2027-04-01');

  it('opens an issue when none covers the due date', () => {
    expect(reminderAction(due, [])).toEqual({ kind: 'open' });
    expect(reminderAction(due, [issue(4, 'CLOSED', '2027-01-15T06:30:00Z', '2027-02-01T10:00:00Z')])).toEqual({
      kind: 'open',
    });
  });

  it('comments on an issue still open from an earlier date', () => {
    expect(reminderAction(due, [issue(4, 'OPEN', '2027-01-15T06:30:00Z')])).toEqual({ kind: 'comment', number: 4 });
  });

  it('does nothing twice for the same date', () => {
    expect(reminderAction(due, [issue(9, 'OPEN', '2027-04-01T06:30:00Z')])).toEqual({ kind: 'none', number: 9 });
    expect(reminderAction(due, [issue(9, 'CLOSED', '2027-04-01T06:30:00Z', '2027-04-20T08:00:00Z')])).toEqual({
      kind: 'none',
      number: 9,
    });
  });
});

describe('sessionNotice', () => {
  it('points to the open reminder issue', () => {
    expect(sessionNotice(full('2027-04-01'), [issue(9, 'OPEN', '2027-04-01T06:30:00Z')])).toBe(
      'Content review due (#9): run /review-content when you have an hour; close #9 when its PR is merged.',
    );
    expect(sessionNotice(undefined, [issue(3, 'open', '2026-12-01T09:00:00Z')])).toContain('(#3)');
  });

  it('says so when no reminder issue was opened for a due date', () => {
    const notice = sessionNotice(full('2027-04-01'), [
      issue(4, 'CLOSED', '2027-01-15T06:30:00Z', '2027-02-01T10:00:00Z'),
    ]);
    expect(notice).toContain('due since 1 Apr 2027');
    expect(notice).toContain('no reminder issue was opened');
    expect(notice).toContain('content-review-reminder.yml');
  });

  it('stays quiet when the due date was handled or nothing is due', () => {
    expect(
      sessionNotice(full('2027-04-01'), [issue(9, 'CLOSED', '2027-04-01T06:30:00Z', '2027-04-20T08:00:00Z')]),
    ).toBeUndefined();
    // An issue open across the due date and closed after it covered that date too.
    expect(sessionNotice(second, [issue(7, 'CLOSED', '2027-01-01T06:30:00Z', '2027-01-16T08:00:00Z')])).toBeUndefined();
    expect(sessionNotice(undefined, [])).toBeUndefined();
  });
});
