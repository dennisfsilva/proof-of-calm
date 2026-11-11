// The content review's reminder (docs/CONTENT-OPS.md §2, ADR-0037 Deviations): the owner runs
// /review-content by hand. `issue` (content-review-reminder.yml) opens one issue per due date, or
// comments on the one still open; `session` (the SessionStart hook in .claude/settings.json) shows one
// line to the owner while a review is due, and catches a schedule GitHub has paused.
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Due = { date: string; scope: 'full' | 'jurisdictions' };
type Issue = { number: number; state: string; createdAt: string; closedAt?: string | null };

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
  ].join('\n');
}

const isOpen = (issue: Issue) => issue.state.toUpperCase() === 'OPEN';
/** An issue open on the due date or opened after it reminded the owner of that date. */
const covers = (issue: Issue, due: Due) =>
  issue.createdAt.slice(0, 10) >= due.date || (issue.closedAt ?? '9999').slice(0, 10) >= due.date;
const newestOpen = (issues: Issue[]) => issues.filter(isOpen).sort((a, b) => b.number - a.number)[0];

/** What the workflow does for a due date: open an issue, comment on the open one, or nothing. */
export function reminderAction(
  due: Due,
  issues: Issue[],
): { kind: 'open' } | { kind: 'comment' | 'none'; number: number } {
  const open = newestOpen(issues);
  if (open) return { kind: open.createdAt.slice(0, 10) >= due.date ? 'none' : 'comment', number: open.number };
  const done = issues.find((issue) => covers(issue, due));
  return done ? { kind: 'none', number: done.number } : { kind: 'open' };
}

/** The line shown to the owner at session start, or undefined. */
export function sessionNotice(due: Due | undefined, issues: Issue[]): string | undefined {
  const open = newestOpen(issues);
  if (open)
    return `Content review due (#${open.number}): run /review-content when you have an hour; close #${open.number} when its PR is merged.`;
  if (!due || issues.some((issue) => covers(issue, due))) return undefined;
  return `Content review due since ${format(due.date)}, and no reminder issue was opened (GitHub pauses scheduled workflows in public repositories after 60 days without activity): run /review-content, or dispatch content-review-reminder.yml.`;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const gh = (args: string[], timeout = 30_000) =>
  execFileSync('gh', args, { cwd: root, encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] });
const listIssues = (timeout?: number): Issue[] =>
  JSON.parse(
    gh(
      [
        'issue',
        'list',
        '--label',
        LABEL,
        '--state',
        'all',
        '--limit',
        '20',
        '--json',
        'number,state,createdAt,closedAt',
      ],
      timeout,
    ),
  );

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
    gh(['issue', 'comment', String(action.number), '--body', `Still due: ${format(due.date)}`]);
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
