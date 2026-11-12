// Where a review's HEAD stands and what GitHub records for the review's branch (docs/CONTENT-OPS.md §3): the
// refusals of a HEAD that is not origin/main, the branch's date, and its pull requests as gh lists them. Pure
// functions; propose.ts runs git and gh and feeds them.

/** The date a review branch is named after; undefined for any branch branchName does not make. */
export const reviewDate = (branch: string): string | undefined =>
  /^agent\/content-review-(\d{4}-\d{2}-\d{2})$/.exec(branch)?.[1];

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

/** Start refuses a dirty tree and a HEAD that is not origin/main. */
export function startProblems(at: HeadAt, originMain: string): string[] {
  const changed = at.status.split('\n').filter((line) => line.trim() !== '').length;
  const dirty = changed > 0 ? [`the working tree is not clean: ${changed} paths changed or untracked`] : [];
  return [...dirty, ...headProblems(at, originMain)];
}

/** One pull request of this repository from the review's branch, as `gh pr list --state all` lists it. */
export interface PullRequest {
  number: number;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  url: string;
}

const STATES = ['OPEN', 'CLOSED', 'MERGED'] as const;

/**
 * `gh pr list --json number,state,url,isCrossRepository`'s output without the PRs whose head is in another
 * repository (the list holds forks' PRs from a branch of the same name, which never speak for the review);
 * undefined when not that shape.
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
    const { number, url, isCrossRepository: fork } = pr;
    if (typeof number !== 'number' || !state || typeof url !== 'string' || typeof fork !== 'boolean') return undefined;
    if (!fork) record.push({ number, state, url });
  }
  return record;
}

/** One line per pull request of the review's branch: its number, state and URL. */
export const recordState = (branch: string, record: readonly PullRequest[]): string[] =>
  record.map((pr) => `${branch}: #${pr.number} ${pr.state.toLowerCase()}, ${pr.url}`);
