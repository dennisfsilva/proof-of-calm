// The content review guard (docs/CONTENT-OPS.md §1, §3). The review agent's output is untrusted data: it may
// change only content data, deletes nothing, and every change it makes carries agent-draft; the PR may also
// remove a visual baseline, the owner's step when `lastReviewed` changed its screen (§8). It never
// re-implements `pnpm validate:content` (CI's run holds the schemas), so it may refuse too much. ci.yml's
// verify job runs the base commit's copy of `pr-files` on every PR; it enforces on an agent/ head or --enforce.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type ChangedPath = { path: string; previous?: string; mode?: string; binary?: boolean; deleted?: boolean };

/** The only paths the agent may change: one file name of lowercase letters, digits and hyphens per folder. */
export const DATA_PATHS: readonly RegExp[] = ['jurisdictions', 'rules', 'facts', 'templates', 'cycles', 'learn'].map(
  (dir) => new RegExp(`^packages/content/${dir}/[a-z0-9][a-z0-9-]*\\.${dir === 'learn' ? 'mdx' : 'json'}$`),
);

const isData = (path: string) => DATA_PATHS.some((pattern) => pattern.test(path));

const REMOVAL = 'the draft names the removal and the owner deletes it';

/**
 * A visual baseline of the web e2e suite. The owner's `lastReviewed` changes the screens that print it, so
 * the owner deletes their baselines on the review PR (docs/CONTENT-OPS.md §8); only `prFiles` accepts that
 * removal, and `propose.ts finish` still refuses every deletion.
 */
const BASELINE = /^apps\/web\/e2e\/[a-z0-9][a-z0-9.-]*-snapshots\/[a-z0-9][a-z0-9-]*\.png$/;

/** Every changed path that is not content data, or is deleted, with the reason; empty when the change is confined. */
export function outsideData(paths: readonly ChangedPath[]): string[] {
  const problems: string[] = [];
  for (const { path, previous, mode, binary, deleted } of paths) {
    for (const name of [path, previous]) {
      if (name === undefined) continue;
      if (name.split(/[\\/]/).includes('..') || /^(?:[/\\]|[A-Za-z]:)/.test(name))
        problems.push(`${name}: not a relative path`);
      else if (!isData(name))
        problems.push(name === path ? `${name}: not content data` : `${path}: renamed from ${name}, not content data`);
    }
    if (mode !== undefined && mode !== '100644') problems.push(`${path}: mode ${mode}, only 100644`);
    if (binary) problems.push(`${path}: a binary change`);
    if (deleted) problems.push(`${path}: removed; ${REMOVAL}`);
  }
  return problems;
}

/**
 * The files API's statuses the agent's PR may show; `removed`, and `renamed` from a data path, are deletions
 * (a removed baseline PNG excepted), any other (`changed`: a mode) is refused.
 */
const STATUSES = new Set(['added', 'modified', 'renamed', 'removed']);

/**
 * The step's listing judged: `path<TAB>previous<TAB>status` lines from the PR files API. It always reports,
 * and refuses only on an agent/ head or with --enforce (the step adds it for the content-review label).
 */
export function prFiles(
  head: string,
  flags: readonly string[],
  listing: string,
): { lines: string[]; refused: boolean } {
  const rows = listing
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [path = '', previous = '', status = ''] = line.split('\t');
      if (status === 'removed' && BASELINE.test(path)) return [];
      const file: ChangedPath = previous ? { path, previous } : { path };
      if (status === 'removed') file.deleted = true;
      const problems = STATUSES.has(status) ? [] : [`${path}: status ${status}, only added, modified or renamed`];
      // A rename takes its old name out of the tree: a data file renamed away (to data or not) is a removal.
      if (status === 'renamed' && isData(previous)) problems.push(`${previous}: removed; ${REMOVAL}`);
      return [...outsideData([file]), ...problems];
    });
  const problems = rows.flat();
  // The files API lists at most 3,000 files: a listing shorter than the PR's count hides the rest.
  const at = flags.indexOf('--expect');
  const expect = at < 0 ? undefined : (flags[at + 1] ?? '');
  if (expect !== undefined && !(/^\d+$/.test(expect) && Number(expect) === rows.length))
    problems.unshift(`${rows.length} files listed, ${expect} changed`);
  if (rows.length === 0) problems.push('no files listed');
  const enforce = head.startsWith('agent/') || flags.includes('--enforce');
  const failing = rows.filter((problems) => problems.length > 0).length;
  const mode = enforce ? 'enforced' : 'not an agent branch: not enforced';
  return {
    lines: [...problems, `${failing} of ${rows.length} files fail the guard (${mode})`],
    refused: enforce && problems.length > 0,
  };
}

const parse = (path: string, text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${path}: not valid JSON`);
  }
};

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;

/**
 * Whether every changed profile, template, cycles file and module, and every fact entry that differs by
 * `key`, carries `reviewedBy: agent-draft`, so the owner's flip is the review; a deleted file or fact entry
 * is refused (`after` undefined: deleted). The generated rules files carry no reviewer; a path outside
 * content data is outsideData's.
 */
export function reviewerProblems(path: string, before: string | undefined, after: string | undefined): string[] {
  if (before === after || !isData(path)) return [];
  if (after === undefined) return [`${path}: deleted; ${REMOVAL}`];
  const dir = path.split('/')[2];
  const draft = (by: unknown, what: string) =>
    by === 'agent-draft' ? [] : [`${what}: reviewedBy is ${String(by)}, not agent-draft`];
  try {
    if (dir === 'learn') {
      // Every reviewedBy line of the front matter only, so a body line cannot stand in for it.
      const front = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(after.replace(/\r\n/g, '\n'))?.[1] ?? '';
      const values = [...front.matchAll(/^reviewedBy:[ \t]*(.*?)[ \t]*$/gm)].map((match) => match[1]);
      const all = values.length > 0 && values.every((value) => value === 'agent-draft');
      return draft(all ? 'agent-draft' : values.join(', ') || 'missing', path);
    }
    if (dir === 'jurisdictions') return draft(field(field(parse(path, after), 'status'), 'reviewedBy'), path);
    if (dir === 'templates' || dir === 'cycles') return draft(field(parse(path, after), 'reviewedBy'), path);
    if (dir !== 'facts') return [];
    const entries = parse(path, after);
    if (!Array.isArray(entries)) return [`${path}: not a list of facts`];
    const old = new Map<unknown, string>();
    const previous = before === undefined ? [] : parse(path, before);
    for (const entry of Array.isArray(previous) ? previous : []) old.set(field(entry, 'key'), JSON.stringify(entry));
    const kept = new Set(entries.map((entry) => field(entry, 'key')));
    return [
      ...[...old.keys()].filter((key) => !kept.has(key)).map((key) => `${path}: fact ${String(key)} deleted`),
      ...entries
        .filter((entry) => old.get(field(entry, 'key')) !== JSON.stringify(entry))
        .flatMap((entry) => draft(field(entry, 'reviewedBy'), `${path}: fact ${String(field(entry, 'key'))}`)),
    ];
  } catch (error) {
    return [(error as Error).message];
  }
}

/** reviewerProblems for each path, the old file from `git show <base>:<path>`; a path missing here is deleted. */
export function reviewers(base: string, paths: readonly string[]): string[] {
  const show = (path: string) => {
    const git = spawnSync('git', ['show', `${base}:${path}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return git.status === 0 ? git.stdout : undefined;
  };
  return paths.flatMap((path) =>
    reviewerProblems(path, show(path), existsSync(path) ? readFileSync(path, 'utf8') : undefined),
  );
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [command, base, ...rest] = process.argv.slice(2);
  let step: { lines: string[]; refused: boolean } | undefined;
  if (command === 'pr-files' && base !== undefined) step = prFiles(base, rest, readFileSync(0, 'utf8'));
  else if (command === 'reviewers' && base !== undefined && rest.length > 0) {
    const problems = reviewers(base, rest);
    step = { lines: [...problems, `reviewers: ${problems.length} problems`], refused: problems.length > 0 };
  }
  if (!step) {
    console.error(
      'usage: check.ts pr-files <head-ref> [--enforce] [--expect <n>] < path<TAB>previous<TAB>status lines',
    );
    console.error('       check.ts reviewers <base-ref> <paths…>');
    process.exit(2);
  }
  for (const line of step.lines) console.log(line);
  process.exit(step.refused ? 1 : 0);
}
