// The content review's git work, so the agent needs no git and no gh (docs/CONTENT-OPS.md §3; the skill's
// allowed-tools pre-approve this script and no git, gh or web rule). `start` checks for a clean tree at origin/main. `finish` stages everything,
// refuses a path outside content data, a mode, a binary, a deletion, an entry not at agent-draft and a
// draft problem, and on a refusal puts the index back as it found it before any commit or push. Otherwise
// it renders the body from the draft through body.ts, commits on agent/content-review-<date>, pushes and
// opens the pull request with needs-owner and content-review; it never merges. `--dry` stops after the
// body. git and gh run through execFileSync's argv arrays only, never a shell.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowedDomains, parseDraft, renderBody } from './body.ts';
import { type ChangedPath, outsideData, reviewers } from './check.ts';

export const branchName = (today: string): string => `agent/content-review-${today}`;

/** `git status --porcelain` output and the two commits; any line is a change, so empty means clean. */
export function startProblems(status: string, head: string, originMain: string): string[] {
  const problems: string[] = [];
  const changed = status.split('\n').filter((line) => line.trim() !== '').length;
  if (changed > 0) problems.push(`the working tree is not clean: ${changed} paths changed or untracked`);
  if (originMain === '') problems.push('origin/main is missing: fetch it');
  else if (head !== originMain)
    problems.push(
      `HEAD ${head.slice(0, 8)} is not origin/main ${originMain.slice(0, 8)}: run git switch --detach origin/main`,
    );
  return problems;
}

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

/** The draft rendered into the body; the countries are the only draft text outside it (the PR title). */
function draftBody(draftPath: string): { body: string; countries: string[]; problems: string[] } {
  let text: string;
  try {
    text = readFileSync(draftPath, 'utf8');
  } catch {
    return { body: '', countries: [], problems: [`${draftPath}: no draft to read`] };
  }
  const { draft, problems } = parseDraft(text);
  if (!draft) return { body: '', countries: [], problems: problems.map((problem) => `draft: ${problem}`) };
  const template = readFileSync('.github/PULL_REQUEST_TEMPLATE/content-review.md', 'utf8');
  const domains = allowedDomains(JSON.parse(readFileSync('packages/content/sources.allow.json', 'utf8')));
  const rendered = renderBody(draft, template, domains);
  const codes = draft.countries.filter((code) => !/^[A-Z]{2}$/.test(code));
  return {
    body: rendered.body,
    countries: draft.countries,
    problems: [...rendered.problems, ...codes.map((code) => `draft: country ${JSON.stringify(code)} is not a code`)],
  };
}

/** Stages everything and judges it; the index is put back as found on a refusal, a dry run or an error. */
function finish(dry: boolean, draftPath: string): number {
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
    const drafted = draftBody(draftPath);
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
  const date = new Date();
  const today = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, '0'))
    .join('-');
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
    run('git', ['fetch', '--quiet', 'origin', 'main']);
    const rev = (ref: string) => {
      try {
        return run('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).trim();
      } catch {
        return '';
      }
    };
    const problems = startProblems(run('git', ['status', '--porcelain']), rev('HEAD'), rev('origin/main'));
    for (const problem of problems) console.log(problem);
    console.log(problems.length > 0 ? 'start: refused' : 'start: clean at origin/main');
    process.exit(problems.length > 0 ? 1 : 0);
  }
  if (command === 'finish' && known && draft !== '' && !draft.startsWith('-')) {
    const path = resolve(draft); // against the caller's folder, before the move to the root
    process.chdir(root);
    process.exit(finish(flags.includes('--dry'), path));
  }
  console.error('usage: propose.ts start | finish [--dry] [--draft <path>]');
  process.exit(2);
}
