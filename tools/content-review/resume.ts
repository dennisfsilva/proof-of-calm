// Where a review's HEAD stands and what GitHub records for the review's branch (docs/CONTENT-OPS.md §3): the
// refusals of a HEAD that is not origin/main, the nine names of a day, the branch's pull requests as gh lists
// them, and `decide`, what finish does on a review branch (docs/research/review-resume.md). Pure functions;
// propose.ts runs git and gh and feeds them.

/** The date a review branch is named after; undefined for any branch reviewNames does not make. */
export const reviewDate = (branch: string): string | undefined =>
  /^agent\/content-review-(\d{4}-\d{2}-\d{2})(?:-[2-9])?$/.exec(branch)?.[1];

/** The names a review of `date` may take, in order: the first is free unless a branch or a PR holds it. */
export const reviewNames = (date: string): string[] =>
  ['', '-2', '-3', '-4', '-5', '-6', '-7', '-8', '-9'].map((suffix) => `agent/content-review-${date}${suffix}`);

/**
 * Where HEAD stands: its commit, its branch (empty when detached), how many of its commits origin/main lacks,
 * and `git status --porcelain` (any line is a change, so empty means clean).
 */
export interface HeadAt {
  sha: string;
  branch: string;
  ahead: number;
  status: string;
}

/**
 * Start and finish (without --dry) both refuse a HEAD that is not the local origin/main. No refusal advises a
 * detach while HEAD holds commits origin/main lacks: that would take those edits out of the tree.
 */
export function headProblems(at: HeadAt, originMain: string): string[] {
  if (originMain === '') return ['origin/main is missing: fetch it'];
  if (at.sha === originMain) return [];
  const [head, main] = [at.sha.slice(0, 8), originMain.slice(0, 8)];
  if (at.ahead > 0)
    return [
      `HEAD ${head} ${at.branch === '' ? '(detached)' : `on branch ${at.branch}`} holds ${at.ahead} commits that ` +
        `origin/main ${main} lacks: save its edits, and only then switch back to origin/main`,
    ];
  return [`HEAD ${head} is not origin/main ${main}: run git switch --detach origin/main`];
}

const changedPaths = (status: string): number => status.split('\n').filter((line) => line.trim() !== '').length;
const dirtyLine = (changed: number) => `the working tree is not clean: ${changed} paths changed or untracked`;

/**
 * Start refuses a dirty tree and a HEAD that is not origin/main. A dirty tree beside a draft
 * (.content-review/draft.json) is a review whose finish has not gone through.
 */
export function startProblems(at: HeadAt, originMain: string, drafted: boolean): string[] {
  const changed = changedPaths(at.status);
  const waits = drafted ? ": a review's edits wait: run finish again" : '';
  return [...(changed > 0 ? [`${dirtyLine(changed)}${waits}`] : []), ...headProblems(at, originMain)];
}

/** One pull request of this repository from the review's branch, as `gh pr list --state all` lists it. */
export interface PullRequest {
  number: number;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  url: string;
  labels: string[];
}

const STATES = ['OPEN', 'CLOSED', 'MERGED'] as const;

/**
 * `gh pr list --json number,state,url,isCrossRepository,labels`'s output without the PRs whose head is in
 * another repository (the list holds forks' PRs from a branch of the same name, which never speak for the
 * review), each label by its name; undefined when not that shape.
 */
export function parseRecord(json: string): PullRequest[] | undefined {
  let list: unknown;
  try {
    list = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (!Array.isArray(list)) return undefined;
  const record: PullRequest[] = [];
  for (const item of list as unknown[]) {
    const pr = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    const state = STATES.find((known) => known === pr.state);
    const { number, url, isCrossRepository: fork, labels: list } = pr;
    if (typeof number !== 'number' || !state || typeof url !== 'string' || typeof fork !== 'boolean') return undefined;
    const labels = Array.isArray(list) ? list.map((label: { name?: unknown } | null) => label?.name) : [0];
    if (!labels.every((name) => typeof name === 'string')) return undefined;
    if (!fork) record.push({ number, state, url, labels });
  }
  return record;
}

/** One line per pull request of the review's branch: its number, state and URL. */
export const recordState = (branch: string, record: readonly PullRequest[]): string[] =>
  record.map((pr) => `${branch}: #${pr.number} ${pr.state.toLowerCase()}, ${pr.url}`);

/**
 * HEAD on review branch R: origin/R's commit after the pruned fetch ('' when absent), whether HEAD is origin/R
 * or its ancestor, and R's PR record.
 */
export interface ReviewAt {
  branch: string;
  head: HeadAt;
  originR: string;
  withinR: boolean;
  record: PullRequest[];
}

export type Step = 'commit' | 'push' | 'pr';

/** What finish does on R: the steps it resumes, the PR that lacks needs-owner, what it prints, its exit code. */
export interface Decision {
  steps: Step[];
  label: number | undefined;
  lines: string[];
  code: 0 | 1;
}

/**
 * The PR record decides first: an open PR is R's proposal (finish commits and pushes nothing; with a clean
 * tree and HEAD at or behind origin/R it adds a missing needs-owner and exits 0); a merged or closed one is
 * done. With no PR only a part-way failure resumes. No line names a reset, a deletion, a force push or a close.
 */
export function decide(at: ReviewAt): Decision {
  const { branch, head, originR, withinR, record } = at;
  const changed = changedPaths(head.status);
  const dirty = changed > 0 ? [dirtyLine(changed)] : [];
  const lines = recordState(branch, record);
  const leave = changed === 0 ? ['to start another review, run git switch --detach origin/main'] : [];
  const refuse = (more: string[]): Decision => ({ steps: [], label: undefined, lines: [...lines, ...more], code: 1 });
  const open = record.find((pr) => pr.state === 'OPEN');
  if (open && changed === 0 && withinR) {
    const label = open.labels.includes('needs-owner') ? undefined : open.number;
    return { steps: [], label, lines: [...lines, ...leave], code: 0 };
  }
  const [sha, tip] = [head.sha.slice(0, 8), originR.slice(0, 8)];
  const remote = originR === '' ? `origin/${branch} is missing` : `origin/${branch} is ${tip}`;
  if (open) {
    const past = originR === '' ? remote : `HEAD ${sha} is not origin/${branch} ${tip} or behind it`;
    return refuse([...dirty, ...(withinR ? [] : [past])]);
  }
  if (record.length > 0)
    return refuse([`${branch}: its pull request is not open; finish never pushes this branch again`, ...leave]);
  const one = head.ahead === 1;
  const steps: Step[] | undefined =
    head.ahead === 0 && changed > 0 && originR === ''
      ? ['commit', 'push', 'pr']
      : one && changed === 0 && originR === ''
        ? ['push', 'pr']
        : one && originR === head.sha
          ? ['pr']
          : undefined;
  if (steps)
    return {
      steps,
      label: undefined,
      lines: [`${branch}: no pull request yet; finish goes on: ${steps.join(', ')}`],
      code: 0,
    };
  return refuse([
    `${branch}: no pull request; HEAD ${sha} holds ${head.ahead} commits that origin/main lacks; ${remote}`,
    ...dirty,
  ]);
}
