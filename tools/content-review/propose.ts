// The content review's git work, so the agent needs no git and no gh (docs/CONTENT-OPS.md §3; the skill's
// allowed-tools pre-approve this script and no git, gh or web rule; pdf.ts, the fetching tool, asks the owner
// on each run). `start` fetches, prints the review branch's PR record and checks for a clean tree at origin/main.
// `finish` refuses a HEAD that is not origin/main, a failed fetch and a failed gh (without --dry) before it touches
// anything, then stages everything, refuses a path outside content data, a mode, a binary, a deletion, an entry not
// at agent-draft, a draft problem and a draft row that does not match the staged diff (rows.ts), and on a refusal puts the index back as it found it before any
// commit or push. Otherwise
// it renders the body from the draft through body.ts, commits on agent/content-review-<date>, pushes and
// opens the pull request with needs-owner and content-review; it never merges. `--dry` stops after the
// body. git and gh run through execFileSync's argv arrays only, never a shell.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDraft, renderBody } from './body.ts';
import { type ChangedPath, DATA_PATHS, outsideData, reviewers } from './check.ts';
import {
  type HeadAt,
  headProblems,
  type PullRequest,
  parseRecord,
  recordState,
  reviewDate,
  startProblems,
} from './resume.ts';
import { leafChanges, rowProblems } from './rows.ts';

export const branchName = (today: string): string => `agent/content-review-${today}`;

/**
 * The staged change from `git diff --cached --raw -z --no-renames HEAD` and `--numstat -z`: each raw record
 * is `:<old mode> <new mode> <old> <new> <status>` NUL path NUL; a numstat of `-` counts is a binary.
 */
export function parseRaw(raw: string, numstat: string): ChangedPath[] {
  const binaries = new Set(
    numstat
      .split('\0')
      .filter((record) => record.startsWith('-\t-\t'))
      .map((record) => record.slice(4)),
  );
  const fields = raw.split('\0');
  const paths: ChangedPath[] = [];
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const [, mode = '', , , status = ''] = (fields[i] ?? '').slice(1).split(' ');
    const path = fields[i + 1] ?? '';
    const file: ChangedPath = status === 'D' ? { path, deleted: true } : { path, mode };
    if (binaries.has(path)) file.binary = true;
    paths.push(file);
  }
  return paths;
}

/** Every reason to refuse the staged change; empty when finish may go on. */
export function finishProblems(
  paths: readonly ChangedPath[],
  reviewerLines: readonly string[],
  bodyProblems: readonly string[],
): string[] {
  const problems = [...outsideData(paths), ...reviewerLines, ...bodyProblems];
  if (paths.length === 0) problems.push('nothing staged: the review changed no content data');
  return problems;
}

/** gh's arguments: create only, with both labels; nothing here merges, auto-merges or uses --admin. */
export function prArgs(today: string, countries: readonly string[], bodyFile: string): string[] {
  const title = `Content review of ${today}: ${countries.length > 0 ? countries.join(', ') : 'all'}`;
  return [
    ...['pr', 'create', '--base', 'main', '--head', branchName(today), '--title', title],
    ...['--body-file', bodyFile, '--label', 'needs-owner', '--label', 'content-review'],
  ];
}

const run = (command: 'git' | 'gh', args: string[]): string =>
  execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

/** A ref's commit, or empty when it does not exist. */
const rev = (ref: string): string => {
  try {
    return run('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).trim();
  } catch {
    return '';
  }
};

/** A file's text at a git object (`HEAD:<path>`, `:<path>` for the index), or undefined when absent. */
const shown = (spec: string): string | undefined => {
  try {
    return execFileSync('git', ['show', spec], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return undefined;
  }
};

/** A JSON file at a git object, or undefined when absent or not JSON. */
const staged = (spec: string): unknown => {
  try {
    return JSON.parse(shown(spec) ?? '');
  } catch {
    return undefined;
  }
};

/** Each staged data file with its changed leaves, or a module's two sources, for rows.ts. */
const changedLeaves = (kept: readonly string[]) =>
  kept
    .filter((file) => DATA_PATHS.some((pattern) => pattern.test(file)))
    .map((file) =>
      file.endsWith('.mdx')
        ? { file, before: shown(`HEAD:${file}`), after: shown(`:${file}`) }
        : { file, leaves: leafChanges(staged(`HEAD:${file}`), staged(`:${file}`)) },
    );

/** The local date today's branch is named after. */
function localToday(): string {
  const date = new Date();
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, '0'))
    .join('-');
}

function headAt(originMain: string): HeadAt {
  const ahead = originMain === '' ? '0' : run('git', ['rev-list', '--count', 'origin/main..HEAD']);
  return {
    sha: rev('HEAD'),
    branch: run('git', ['branch', '--show-current']).trim(),
    ahead: Number(ahead.trim()),
    status: run('git', ['status', '--porcelain']),
  };
}

/**
 * A command's output, or its exit code, the first line it wrote to stderr and all of stderr (`missing`: not
 * installed).
 */
type Ran = { ok: true; out: string } | { ok: false; code: number | null; line: string; err: string; missing: boolean };
function attempt(command: 'git' | 'gh', args: string[]): Ran {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status === 0) return { ok: true, out: result.stdout };
  const err = result.stderr ?? '';
  const line = err.split('\n').find((text) => text.trim() !== '');
  const missing = (result.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
  return { ok: false, code: result.status, line: line?.trim() ?? String(result.error ?? result.status), err, missing };
}

/**
 * gh cannot authenticate: exit 4 when it holds no token, or GitHub's HTTP 401 in its stderr (exit 1) when the
 * stored token has expired or been revoked. Both are fixed by gh auth login; anything else is a reconnect.
 */
const loggedOut = (ran: { code: number | null; err: string }) => ran.code === 4 || /\bHTTP 401\b/.test(ran.err);

const MAIN = '+refs/heads/main:refs/remotes/origin/main';
const AGENTS = '+refs/heads/agent/*:refs/remotes/origin/agent/*';

/** A pruned fetch of `refspecs`; a failure is git's first line. */
function fetched(refspecs: string[]): string[] {
  const fetch = attempt('git', ['fetch', '--prune', '--quiet', 'origin', ...refspecs]);
  return fetch.ok ? [] : [`git fetch: ${fetch.line}: reconnect, then run it again`];
}

/** A fresh fetch, then the review branch's PR record; a failure is git's or gh's first line and the fix. */
function fresh(review: string, refspecs: string[]): { record: PullRequest[]; problems: string[] } {
  const problems = fetched(refspecs);
  if (problems.length > 0) return { record: [], problems };
  const fields = 'number,state,url,isCrossRepository';
  const list = attempt('gh', ['pr', 'list', '--head', review, '--state', 'all', '--json', fields]);
  const record = list.ok ? parseRecord(list.out) : undefined;
  if (record) return { record, problems: [] };
  if (list.ok) return { record: [], problems: ['gh pr list: printed no PR record: update GitHub CLI'] };
  const [line, fix] = list.missing
    ? ['gh is missing', 'install GitHub CLI and run gh auth login']
    : [list.line, loggedOut(list) ? 'run gh auth login' : 'reconnect'];
  return { record: [], problems: [`gh pr list: ${line}: ${fix}, then run it again`] };
}

/**
 * Fetches origin/main and the agent/ branches, reads the PR record of HEAD's review branch (else today's) and
 * prints it, then refuses a dirty tree or a HEAD that is not origin/main; a failed fetch or gh refuses first.
 */
function start(): number {
  const branch = run('git', ['branch', '--show-current']).trim();
  const review = reviewDate(branch) ? branch : branchName(localToday());
  const read = fresh(review, [MAIN, AGENTS]);
  const originMain = rev('origin/main');
  for (const line of recordState(review, read.record)) console.log(line);
  const problems = read.problems.length > 0 ? read.problems : startProblems(headAt(originMain), originMain);
  for (const problem of problems) console.log(problem);
  console.log(problems.length > 0 ? 'start: refused' : 'start: clean at origin/main');
  return problems.length > 0 ? 1 : 0;
}

/** The draft rendered into the body; the countries are the only draft text outside it (the PR title). */
function draftBody(
  draftPath: string,
  changed: ReturnType<typeof changedLeaves>,
): { body: string; countries: string[]; problems: string[] } {
  let text: string;
  try {
    text = readFileSync(draftPath, 'utf8');
  } catch {
    return { body: '', countries: [], problems: [`${draftPath}: no draft to read`] };
  }
  const { draft, problems } = parseDraft(text);
  if (!draft) return { body: '', countries: [], problems: problems.map((problem) => `draft: ${problem}`) };
  const template = readFileSync('.github/PULL_REQUEST_TEMPLATE/content-review.md', 'utf8');
  const allow: unknown = JSON.parse(readFileSync('packages/content/sources.allow.json', 'utf8'));
  const rendered = renderBody(draft, template, allow);
  const codes = draft.countries.filter((code) => !/^[A-Z]{2}$/.test(code));
  return {
    body: rendered.body,
    countries: draft.countries,
    problems: [
      ...rendered.problems,
      ...codes.map((code) => `draft: country ${JSON.stringify(code)} is not a code`),
      ...rowProblems(draft, changed).map((problem) => `draft: ${problem}`),
    ],
  };
}

/**
 * Stages everything and judges it; the index is put back as found on a refusal, a dry run or an error.
 * Without --dry it first refuses, touching nothing, a HEAD that is not the local origin/main (start's
 * check; origin/main is not fetched, so the PR's base is never ahead of what start checked), then a failed
 * fetch of the agent/ branches or a gh that cannot read today's PR record, before any commit it could not
 * propose. --dry also runs in CI's merge checkout, where origin/main is missing, and pushes nothing, so it
 * judges the staged data only.
 */
function finish(dry: boolean, draftPath: string): number {
  const today = localToday();
  const head = dry ? [] : headProblems(headAt(rev('origin/main')), rev('origin/main'));
  const base = dry || head.length > 0 ? head : fresh(branchName(today), [AGENTS]).problems;
  for (const problem of base) console.log(problem);
  if (base.length > 0) {
    console.log(`finish: refused, ${base.length} problems; nothing committed, the index as found`);
    return 1;
  }
  const found = run('git', ['write-tree']).trim();
  let paths: ChangedPath[];
  let problems: string[];
  let body: string;
  let countries: string[];
  try {
    run('git', ['add', '-A']);
    const diff = ['diff', '--cached', '-z', '--no-renames', 'HEAD'];
    paths = parseRaw(run('git', [...diff, '--raw']), run('git', [...diff, '--numstat']));
    const kept = paths.filter((file) => !file.deleted).map((file) => file.path);
    const drafted = draftBody(draftPath, changedLeaves(kept));
    ({ body, countries } = drafted);
    problems = finishProblems(paths, kept.length > 0 ? reviewers('HEAD', kept) : [], drafted.problems);
  } catch (error) {
    run('git', ['read-tree', found]);
    throw error;
  }
  if (problems.length > 0 || dry) run('git', ['read-tree', found]);
  for (const problem of problems) console.log(problem);
  if (problems.length > 0) {
    console.log(`finish: refused, ${problems.length} problems; nothing committed, the index as found`);
    return 1;
  }
  mkdirSync('.content-review', { recursive: true });
  writeFileSync('.content-review/body.md', body);
  if (dry) {
    console.log(`finish --dry: accepted, ${paths.length} paths; the body is in .content-review/body.md`);
    return 0;
  }
  try {
    run('git', ['switch', '--quiet', '--create', branchName(today)]); // fails when today's branch exists
  } catch (error) {
    run('git', ['read-tree', found]);
    throw error;
  }
  run('git', ['commit', '--quiet', '--message', `chore(content): draft the content review of ${today}`]);
  run('git', ['push', '--quiet', '--set-upstream', 'origin', branchName(today)]);
  console.log(run('gh', prArgs(today, countries, '.content-review/body.md')).trim());
  return 0;
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [command, ...flags] = process.argv.slice(2);
  const at = flags.indexOf('--draft');
  const draft = at < 0 ? '.content-review/draft.json' : (flags[at + 1] ?? '');
  const known = flags.every((flag, i) => flag === '--dry' || (at >= 0 && (i === at || i === at + 1)));
  const root = run('git', ['rev-parse', '--show-toplevel']).trim();
  if (command === 'start' && flags.length === 0) {
    process.chdir(root);
    process.exit(start());
  }
  if (command === 'finish' && known && draft !== '' && !draft.startsWith('-')) {
    const path = resolve(draft); // against the caller's folder, before the move to the root
    process.chdir(root);
    process.exit(finish(flags.includes('--dry'), path));
  }
  console.error('usage: propose.ts start | finish [--dry] [--draft <path>]');
  process.exit(2);
}
