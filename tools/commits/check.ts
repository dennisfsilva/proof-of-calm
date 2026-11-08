// Conventional commits (ADR-0025, docs/ENGINEERING.md §1.8): checked in CI for every commit of a pull
// request, and by `pnpm gate` for origin/main..HEAD before anything is pushed. A tiny check instead of
// commitlint: the rule is one regular expression.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const TYPES = ['feat', 'fix', 'docs', 'chore', 'test', 'refactor', 'perf', 'ci', 'build', 'style', 'revert'];

const HEADER = new RegExp(`^(${TYPES.join('|')})(\\([a-z0-9][a-z0-9/-]*\\))?!?: \\S.*$`);

/** Returns the problem with a commit subject, or null when it is a conventional commit. */
export function checkSubject(subject: string): string | null {
  if (subject.startsWith('Merge ')) return null;
  if (!HEADER.test(subject)) {
    return `"${subject}" is not a conventional commit: <type>(<scope>)?: <subject>, type one of ${TYPES.join(', ')}.`;
  }
  if (subject.length > 100) return `"${subject.slice(0, 40)}…" is longer than 100 characters.`;
  return null;
}

/** Runs git with these arguments and returns what it prints; throws when git fails. */
export type Git = (args: readonly string[]) => string;

const git: Git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function isCommit(revision: string, run: Git): boolean {
  try {
    run(['rev-parse', '--verify', '--quiet', `${revision}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

/**
 * The problems with the subjects of base..head; an empty range (main itself) has none. A revision this
 * clone lacks, such as an unfetched origin/main, is the one problem, saying what the check needs.
 */
export function checkRange(base: string, head: string, run: Git = git): string[] {
  const missing = [base, head].filter((revision) => !isCommit(revision, run));
  if (missing.length > 0) {
    return missing.map(
      (revision) =>
        `${revision} is not a commit in this clone, so the subjects of ${base}..${head} cannot be read: fetch it first (git fetch origin main).`,
    );
  }
  return run(['log', '--format=%s', `${base}..${head}`])
    .split('\n')
    .filter((line) => line.length > 0)
    .map(checkSubject)
    .filter((problem) => problem !== null);
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [base, head] = process.argv.slice(2);
  if (!base || !head) {
    console.error('usage: node commits/check.ts <base> <head>, e.g. origin/main HEAD');
    process.exit(2);
  }
  const problems = checkRange(base, head);
  for (const problem of problems) console.error(problem);
  process.exit(problems.length > 0 ? 1 : 0);
}
