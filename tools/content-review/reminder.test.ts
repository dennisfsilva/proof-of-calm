import { describe, expect, it } from 'vitest';
import {
  dueDate,
  issueBody,
  issueTitle,
  noticeDue,
  reminderAction,
  sessionNotice,
  stillDueComment,
} from './reminder.ts';

const full = (date: string) => ({ date, scope: 'full' as const });
const second = { date: '2027-01-15', scope: 'jurisdictions' as const };
type Text = { body: string; association?: string; login?: string };
/**
 * The issue's body (the first text, opened by the workflow unless it names another login) and its
 * comments, as `gh issue list --json` gives them.
 */
const issue = (number: number, state: string, [first, ...rest]: Text[]) => ({
  number,
  state,
  author: { login: first?.login ?? 'app/github-actions' },
  body: first?.body ?? '',
  comments: rest.map(({ body, association = 'NONE', login = 'someone' }) => ({
    body,
    authorAssociation: association,
    author: { login },
  })),
});
const opened = (date: string): Text => ({ body: issueBody(full(date)) });
const bot = (body: string): Text => ({ body, login: 'github-actions' });
const owner = (body: string): Text => ({ body, association: 'OWNER', login: 'owner' });

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

describe('the due-date marker', () => {
  it('marks the issue body and the comment with the due date, hidden from the reader', () => {
    expect(issueBody(full('2027-04-01'))).toContain('<!-- content-review-due: 2027-04-01 -->');
    expect(stillDueComment(second)).toContain('<!-- content-review-due: 2027-01-15 -->');
    expect(stillDueComment(second)).toContain('Still due: 15 Jan 2027');
  });
});

describe('reminderAction', () => {
  const due = full('2027-04-01');

  it('opens an issue when none carries the due date', () => {
    expect(reminderAction(due, [])).toEqual({ kind: 'open' });
    expect(reminderAction(due, [issue(4, 'CLOSED', [opened('2027-01-15')])])).toEqual({ kind: 'open' });
  });

  it('opens an issue when the earlier one closed before the due date’s run', () => {
    // #4 was closed at 05:00 UTC on 1 Apr, before that day's 06:23 run: it never reminded of 1 Apr.
    expect(reminderAction(due, [issue(4, 'CLOSED', [opened('2027-01-01')])])).toEqual({ kind: 'open' });
    expect(reminderAction(second, [issue(4, 'CLOSED', [opened('2027-01-01')])])).toEqual({ kind: 'open' });
  });

  it('comments on an issue still open from an earlier date', () => {
    expect(reminderAction(due, [issue(4, 'OPEN', [opened('2027-01-15')])])).toEqual({ kind: 'comment', number: 4 });
  });

  it('does nothing on a re-run once the issue opened or the comment landed', () => {
    expect(reminderAction(due, [issue(9, 'OPEN', [opened('2027-04-01')])])).toEqual({ kind: 'none', number: 9 });
    const commented = issue(4, 'OPEN', [opened('2027-01-01'), bot(stillDueComment(second))]);
    expect(reminderAction(second, [commented])).toEqual({ kind: 'none', number: 4 });
  });

  it('counts an issue closed after the due date’s reminder as covering it', () => {
    expect(reminderAction(due, [issue(9, 'CLOSED', [opened('2027-04-01')])])).toEqual({ kind: 'none', number: 9 });
    const commented = issue(4, 'CLOSED', [opened('2027-01-01'), owner(stillDueComment(second))]);
    expect(reminderAction(second, [commented])).toEqual({ kind: 'none', number: 4 });
  });

  it('ignores a marker in a comment from someone outside the repository', () => {
    const forged = issue(4, 'OPEN', [opened('2027-01-01'), { body: stillDueComment(due), association: 'NONE' }]);
    expect(reminderAction(due, [forged])).toEqual({ kind: 'comment', number: 4 });
  });
});

describe('sessionNotice', () => {
  it('points to the open reminder issue', () => {
    expect(sessionNotice(full('2027-04-01'), [issue(9, 'OPEN', [opened('2027-04-01')])])).toBe(
      'Content review due (#9): run /review-content when you have an hour; close #9 when its PR is merged.',
    );
    expect(sessionNotice(undefined, [issue(3, 'open', [opened('2026-12-01')])])).toContain('(#3)');
  });

  it('says so when no reminder carries the due date, and names the way to restart the reminders', () => {
    // #4 was closed on the morning of 1 Apr, before that day's run.
    const notice = sessionNotice(noticeDue('2027-04-03'), [issue(4, 'CLOSED', [opened('2027-01-01')])]);
    expect(notice).toContain('due since 1 Apr 2027');
    expect(notice).toContain('/review-content');
    expect(notice).toContain('gh workflow enable content-review-reminder.yml');
  });

  it('the paused line names the dispatch that opens the missing issue', () => {
    // Finding 1: neither the skill nor the enable writes 1 Apr's marker, so only the dispatch clears the line.
    const closed = [{ number: 4, state: 'CLOSED', body: '<!-- content-review-due: 2027-01-15 -->', comments: [] }];
    const notice = sessionNotice(noticeDue('2027-04-03'), closed) ?? '';
    const enable = notice.indexOf('gh workflow enable content-review-reminder.yml');
    const run = notice.indexOf('gh workflow run content-review-reminder.yml -f dry_run=false');
    expect(enable).toBeGreaterThan(-1);
    expect(run).toBeGreaterThan(enable);
    expect(notice).toContain('to open its issue');
  });

  it('stays quiet when the due date was reminded of or nothing is due', () => {
    expect(sessionNotice(full('2027-04-01'), [issue(9, 'CLOSED', [opened('2027-04-01')])])).toBeUndefined();
    // An issue open across the second pass, commented on, and closed after it covered that date too.
    const commented = issue(7, 'CLOSED', [opened('2027-01-01'), bot(stillDueComment(second))]);
    expect(sessionNotice(second, [commented])).toBeUndefined();
    expect(sessionNotice(undefined, [])).toBeUndefined();
  });
});

describe('who may mark a due date in an issue body', () => {
  const due = full('2027-04-01');

  it('a marker in the body of an issue the workflow did not open covers no date', () => {
    // Finding 2: a collaborator labels a third party's issue; its author edits the body to add markers.
    const body = 'PT rule changed\n<!-- content-review-due: 2027-04-01 -->';
    const unsigned = [{ number: 12, state: 'CLOSED', body, comments: [] }];
    const someone = [issue(12, 'CLOSED', [{ body, login: 'someone' }])];
    expect(reminderAction(due, unsigned)).toEqual({ kind: 'open' });
    expect(reminderAction(due, someone)).toEqual({ kind: 'open' });
    expect(sessionNotice(due, unsigned)).toContain('due since 1 Apr 2027');
    expect(sessionNotice(due, someone)).toContain('due since 1 Apr 2027');
  });

  it('a body from app/github-actions covers its date', () => {
    const workflow = [issue(9, 'CLOSED', [{ body: issueBody(due), login: 'app/github-actions' }])];
    expect(reminderAction(due, workflow)).toEqual({ kind: 'none', number: 9 });
    expect(sessionNotice(due, workflow)).toBeUndefined();
  });
});
