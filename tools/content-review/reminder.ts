// The content review's reminder (docs/CONTENT-OPS.md §2, ADR-0037 Deviations): the owner runs
// /review-content by hand. `issue` (content-review-reminder.yml) opens one issue per due date, or
// comments on the one still open; `session` (the SessionStart hook in .claude/settings.json) shows one
// line to the owner while a review is due, and catches a schedule GitHub has paused.
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Due = { date: string; scope: 'full' | 'jurisdictions' };
type Comment = { body: string; authorAssociation?: string; author?: { login?: string } | null };
/** The fields `gh issue list --json` gives for FIELDS. */
type Issue = {
  number: number;
  state: string;
  body?: string | null;
  comments?: Comment[] | null;
  author?: { login?: string } | null;
};

/** No reminder for a date before the reminder existed. */
const FIRST_DUE = '2027-01-01';
/** The session notice waits this many days for the scheduled run, which GitHub can delay. */
const GRACE_DAYS = 2;
/** Month and day of each due date in UTC, as docs/CONTENT-OPS.md §2 lists them. */
const SCHEDULE: [string, Due['scope']][] = [
  ['01-01', 'full'],
  ['01-15', 'jurisdictions'],
  ['04-01', 'full'],
  ['07-01', 'full'],
  ['10-01', 'full'],
];
const LABEL = 'content-review';
/**
 * Who may write a due-date marker, since a forged one silences a date. A comment: the workflow's
 * token or a person with write access (anyone can comment on a public issue). A body: only the
 * workflow's, because the author of any issue a collaborator labels can edit its body.
 * gh reports the token as `app/github-actions` on an issue and `github-actions` on a comment.
 */
const TRUSTED_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const TRUSTED_LOGINS = new Set(['app/github-actions', 'github-actions', 'github-actions[bot]']);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const display = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** `1 Apr 2027`, as the app writes a date (docs/CONTENT-STYLE.md §1). */
const format = (date: string) => display.format(new Date(`${date}T00:00:00Z`));

/** The latest due date on or before `today` (YYYY-MM-DD, UTC), never one before FIRST_DUE. */
export function dueDate(today: string): Due | undefined {
  if (!DAY.test(today)) throw new Error(`"${today}" is not a YYYY-MM-DD day.`);
  const year = Number(today.slice(0, 4));
  const dates = [year - 1, year].flatMap((y) => SCHEDULE.map(([day, scope]) => ({ date: `${y}-${day}`, scope })));
  return dates.filter(({ date }) => date >= FIRST_DUE && date <= today).at(-1);
}

/** The due date the session notice checks: today's, once the scheduled run has had its grace days. */
export function noticeDue(today: string): Due | undefined {
  const day = new Date(`${today}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - GRACE_DAYS);
  return dueDate(day.toISOString().slice(0, 10));
}

export function issueTitle(due: Due): string {
  const pass = due.scope === 'jurisdictions' ? ' (second pass on the countries)' : '';
  return `Content review due: ${format(due.date)}${pass}`;
}

export function issueBody(due: Due): string {
  const why =
    due.scope === 'full'
      ? `Due on ${format(due.date)}: the quarterly check of every country's rules and every Learn module's facts against their official sources, so the app shows no rule that has changed (docs/CONTENT-OPS.md §2).`
      : `Due on ${format(due.date)}: a second check of the countries' rules, because budget laws land in late December and tax authorities update their pages in the first two weeks of January (docs/CONTENT-OPS.md §2).`;
  const run =
    due.scope === 'full'
      ? 'Open Claude Code in this repository and run `/review-content`.'
      : 'Open Claude Code in this repository and run `/review-content` with the country codes only, separated by commas (one per file in `packages/content/jurisdictions/`).';
  return [
    why,
    '',
    `1. ${run}`,
    '2. Read the draft pull request against the sources it quotes, set `reviewedBy` to `owner` and merge it (docs/CONTENT-OPS.md §8).',
    '3. Close this issue when that pull request is merged.',
    '',
    marker(due),
  ].join('\n');
}

/** The comment on an issue still open when the next due date comes. */
export function stillDueComment(due: Due): string {
  return `Still due: ${format(due.date)}\n\n${marker(due)}`;
}

/** The hidden line that records which due date an issue body or comment reminded the owner of. */
const marker = (due: Due) => `<!-- content-review-due: ${due.date} -->`;
const isOpen = (issue: Issue) => issue.state.toUpperCase() === 'OPEN';
const trusted = (comment: Comment) =>
  TRUSTED_ASSOCIATIONS.has(comment.authorAssociation ?? '') || TRUSTED_LOGINS.has(comment.author?.login ?? '');
/** An issue covers a due date exactly when the workflow's body or a trusted comment carries its marker. */
const carries = (issue: Issue, due: Due) =>
  [
    TRUSTED_LOGINS.has(issue.author?.login ?? '') ? (issue.body ?? '') : '',
    ...(issue.comments ?? []).filter(trusted).map((comment) => comment.body),
  ].some((text) => text.includes(marker(due)));
const newestOpen = (issues: Issue[]) => issues.filter(isOpen).sort((a, b) => b.number - a.number)[0];

/**
 * What the workflow does for a due date: nothing when an issue, open or closed, already carries it;
 * otherwise comment on the open issue, or open one. Safe to run twice (ADR-0037).
 */
export function reminderAction(
  due: Due,
  issues: Issue[],
): { kind: 'open' } | { kind: 'comment' | 'none'; number: number } {
  const done = issues.find((issue) => carries(issue, due));
  if (done) return { kind: 'none', number: done.number };
  const open = newestOpen(issues);
  return open ? { kind: 'comment', number: open.number } : { kind: 'open' };
}

/** The line shown to the owner at session start, or undefined. */
export function sessionNotice(due: Due | undefined, issues: Issue[]): string | undefined {
  const open = newestOpen(issues);
  if (open)
    return `Content review due (#${open.number}): run /review-content when you have an hour; close #${open.number} when its PR is merged.`;
  if (!due || issues.some((issue) => carries(issue, due))) return undefined;
  return `Content review due since ${format(due.date)} with no reminder (GitHub pauses idle schedules): run /review-content now; restart the reminders with gh workflow enable content-review-reminder.yml, then gh workflow run content-review-reminder.yml -f dry_run=false to open its issue.`;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const gh = (args: string[], timeout = 30_000) =>
  execFileSync('gh', args, { cwd: root, encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] });
const FIELDS = 'number,state,body,comments,author';
const listIssues = (timeout?: number): Issue[] =>
  JSON.parse(gh(['issue', 'list', '--label', LABEL, '--state', 'all', '--limit', '20', '--json', FIELDS], timeout));

function issueCommand(args: string[]): void {
  const at = args.indexOf('--today');
  const today = at === -1 ? new Date().toISOString().slice(0, 10) : (args[at + 1] ?? '');
  const due = dueDate(today);
  if (!due) {
    console.log(`No content review due on ${today}.`);
    return;
  }
  if (args.includes('--dry-run')) {
    console.log(`${issueTitle(due)}\n\n${issueBody(due)}`);
    return;
  }
  const action = reminderAction(due, listIssues());
  if (action.kind === 'none') console.log(`#${action.number} already reminds the owner of ${due.date}.`);
  if (action.kind === 'comment') {
    gh(['issue', 'comment', String(action.number), '--body', stillDueComment(due)]);
    console.log(`Commented on #${action.number}.`);
  }
  if (action.kind === 'open') {
    const owner = process.env.GITHUB_REPOSITORY_OWNER;
    if (!owner) throw new Error('GITHUB_REPOSITORY_OWNER is not set.');
    const create = ['issue', 'create', '--title', issueTitle(due), '--body', issueBody(due), '--label', LABEL];
    console.log(gh([...create, '--assignee', owner]).trim());
  }
}

/** The SessionStart hook: any failure (offline, no gh, no login, a timeout) prints nothing. */
function sessionCommand(): void {
  let issues: Issue[];
  try {
    issues = listIssues(5_000);
  } catch {
    return;
  }
  const notice = sessionNotice(noticeDue(new Date().toISOString().slice(0, 10)), issues);
  // systemMessage is shown to the user; the hooks reference documents additionalContext, not this
  // field, as the way into the model's context.
  if (notice) console.log(JSON.stringify({ systemMessage: notice }));
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'issue') issueCommand(rest);
  else if (command === 'session') sessionCommand();
  else {
    console.error('Usage: node tools/content-review/reminder.ts issue [--dry-run] [--today YYYY-MM-DD] | session');
    process.exitCode = 2;
  }
}
