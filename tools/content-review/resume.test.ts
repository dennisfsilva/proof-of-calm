import { describe, expect, it } from 'vitest';
import {
  type Decision,
  decide,
  type HeadAt,
  headProblems,
  type PullRequest,
  parseRecord,
  type ReviewAt,
  recordState,
  reviewDate,
  reviewNames,
  startProblems,
} from './resume.ts';

const [SHA, MAIN, OTHER] = ['a'.repeat(40), 'b'.repeat(40), 'c'.repeat(40)];
const REVIEW = 'agent/content-review-2027-01-01';
const at = (more: Partial<HeadAt>): HeadAt => ({ sha: SHA, branch: '', ahead: 0, status: '', ...more });
const PR_URL = 'https://github.com/o/r/pull/7';
const pr = (state: PullRequest['state'], labels = ['needs-owner', 'content-review']): PullRequest => ({
  ...{ number: 7, state, url: PR_URL, labels },
});
const DIRTY = ' M packages/content/facts/a.json\n';
const OPEN = `${REVIEW}: #7 open, ${PR_URL}`;
const LEAVE = 'to start another review, run git switch --detach origin/main';
/** A review branch R: HEAD one commit past origin/main and equal to origin/R, clean, with no pull request. */
const onR = (more: Partial<ReviewAt>, head: Partial<HeadAt> = {}): ReviewAt => ({
  ...{ branch: REVIEW, head: at({ branch: REVIEW, ahead: 1, ...head }), originR: SHA, withinR: true, record: [] },
  ...more,
});
/** decide's verdict, after checking that no line it prints names a reset, a deletion, a force push or a close. */
function decided(review: ReviewAt): Decision {
  const decision = decide(review);
  for (const line of decision.lines) expect(line).not.toMatch(/\breset\b|delet|\bforce\b|--force|\bclose\b|branch -D/i);
  return decision;
}
const refused = (lines: string[]): Decision => ({ steps: [], label: undefined, lines, code: 1 });

describe('resume', () => {
  it('startProblems refuses a dirty tree and a HEAD that is not origin/main, advising a detach only when safe', () => {
    expect(startProblems(at({ sha: MAIN }), MAIN, false)).toEqual([]);
    const status = ' M packages/content/facts/a.json\n?? notes.txt\n';
    expect(startProblems(at({ sha: MAIN, status }), MAIN, false)).toEqual([
      'the working tree is not clean: 2 paths changed or untracked',
    ]);
    expect(startProblems(at({}), MAIN, false)).toEqual([
      'HEAD aaaaaaaa is not origin/main bbbbbbbb: run git switch --detach origin/main',
    ]);
    expect(startProblems(at({ ahead: 2 }), MAIN, false)).toEqual([
      'HEAD aaaaaaaa (detached) holds 2 commits that origin/main bbbbbbbb lacks: save its edits, ' +
        'and only then switch back to origin/main',
    ]);
    expect(startProblems(at({}), '', false)).toEqual(['origin/main is missing: fetch it']);
  });

  it("startProblems says a review's edits wait when the dirty tree has a draft, and only then", () => {
    expect(startProblems(at({ sha: MAIN, status: DIRTY }), MAIN, true)).toEqual([
      "the working tree is not clean: 1 paths changed or untracked: a review's edits wait: run finish again",
    ]);
    expect(startProblems(at({ sha: MAIN }), MAIN, true)).toEqual([]);
  });

  it('reviewNames gives the nine names of a day in order, each at most 33 characters', () => {
    const names = reviewNames('2027-01-01');
    expect(names).toEqual([REVIEW, ...[2, 3, 4, 5, 6, 7, 8, 9].map((n) => `${REVIEW}-${n}`)]);
    for (const name of names) {
      expect(name.length).toBeLessThanOrEqual(33);
      expect(reviewDate(name)).toBe('2027-01-01');
    }
  });

  it('decide: an open PR at or behind origin/R on a clean tree prints its URL and exits 0, adding a missing label', () => {
    expect(decided(onR({ record: [pr('OPEN')] }))).toEqual({
      steps: [],
      label: undefined,
      lines: [OPEN, LEAVE],
      code: 0,
    });
    expect(decided(onR({ record: [pr('OPEN', ['content-review'])] }))).toEqual({
      ...{ steps: [], label: 7, lines: [OPEN, LEAVE], code: 0 },
    });
    // The owner's flip commits on origin/R, HEAD behind it: the same.
    const behind = onR({ originR: OTHER, record: [pr('CLOSED'), pr('OPEN')] });
    expect(decided(behind)).toEqual({
      ...{ steps: [], label: undefined, lines: [`${REVIEW}: #7 closed, ${PR_URL}`, OPEN, LEAVE], code: 0 },
    });
  });

  it('decide: an open PR on a dirty tree or with HEAD past origin/R prints the URL and the facts and exits 1', () => {
    expect(decided(onR({ record: [pr('OPEN')] }, { status: DIRTY }))).toEqual(
      refused([OPEN, 'the working tree is not clean: 1 paths changed or untracked']),
    );
    expect(decided(onR({ originR: OTHER, withinR: false, record: [pr('OPEN')] }))).toEqual(
      refused([OPEN, `HEAD aaaaaaaa is not origin/${REVIEW} cccccccc or behind it`]),
    );
    expect(decided(onR({ originR: '', withinR: false, record: [pr('OPEN')] }))).toEqual(
      refused([OPEN, `origin/${REVIEW} is missing`]),
    );
  });

  it('decide refuses a merged or a closed PR, pushing nothing', () => {
    const done = `${REVIEW}: its pull request is not open; finish never pushes this branch again`;
    expect(decided(onR({ record: [pr('MERGED')] }))).toEqual(refused([`${REVIEW}: #7 merged, ${PR_URL}`, done, LEAVE]));
    expect(decided(onR({ originR: '', withinR: false, record: [pr('CLOSED')] }, { status: DIRTY }))).toEqual(
      refused([`${REVIEW}: #7 closed, ${PR_URL}`, done]),
    );
  });

  it('decide resumes only a part-way failure: commit, push and PR; push and PR; the PR', () => {
    const resumes = (steps: Decision['steps']): Decision => ({
      ...{ steps, label: undefined, lines: [`${REVIEW}: no pull request yet; finish goes on: ${steps.join(', ')}`] },
      code: 0,
    });
    const edits = onR({ originR: '', withinR: false }, { sha: MAIN, ahead: 0, status: DIRTY });
    expect(decided(edits)).toEqual(resumes(['commit', 'push', 'pr']));
    expect(decided(onR({ originR: '', withinR: false }))).toEqual(resumes(['push', 'pr']));
    expect(decided(onR({}))).toEqual(resumes(['pr']));
  });

  it('decide refuses every other state without a PR, with the facts', () => {
    const facts = (ahead: number, remote: string) =>
      `${REVIEW}: no pull request; HEAD aaaaaaaa holds ${ahead} commits that origin/main lacks; origin/${REVIEW} ${remote}`;
    expect(decided(onR({ originR: '', withinR: false }, { ahead: 2 }))).toEqual(refused([facts(2, 'is missing')]));
    expect(decided(onR({ originR: OTHER, withinR: false }))).toEqual(refused([facts(1, 'is cccccccc')]));
    expect(decided(onR({ originR: '', withinR: false }, { status: DIRTY }))).toEqual(
      refused([facts(1, 'is missing'), 'the working tree is not clean: 1 paths changed or untracked']),
    );
    expect(decided(onR({ originR: '', withinR: false }, { ahead: 0 }))).toEqual(refused([facts(0, 'is missing')]));
  });

  it('headProblems names the branch that holds commits origin/main lacks and never advises a detach for it', () => {
    const problems = headProblems(at({ branch: REVIEW, ahead: 1 }), MAIN);
    expect(problems).toEqual([
      `HEAD aaaaaaaa on branch ${REVIEW} holds 1 commits that origin/main bbbbbbbb lacks: save its edits, ` +
        'and only then switch back to origin/main',
    ]);
    expect(problems.join('\n')).not.toMatch(/--detach|reset|--force|delete/);
    expect(headProblems(at({ sha: MAIN, status: '?? notes.txt\n' }), MAIN)).toEqual([]);
  });

  it("parseRecord reads gh's PR list with its labels, drops pull requests from forks and refuses any other shape", () => {
    const labels = [{ id: 'L1', name: 'needs-owner', color: 'ededed' }, { name: 'content-review' }];
    const ours = { number: 7, state: 'MERGED', url: PR_URL, isCrossRepository: false, labels };
    const fork = {
      number: 8,
      state: 'OPEN',
      url: 'https://github.com/o/r/pull/8',
      isCrossRepository: true,
      labels: [],
    };
    expect(parseRecord(JSON.stringify([fork, ours]))).toEqual([pr('MERGED')]);
    expect(parseRecord(JSON.stringify([{ ...ours, labels: [] }]))).toEqual([pr('MERGED', [])]);
    expect(parseRecord(JSON.stringify([fork]))).toEqual([]);
    expect(parseRecord('[]')).toEqual([]);
    const { isCrossRepository: _, ...unmarked } = ours;
    const { labels: __, ...unlabelled } = ours;
    const malformed = ['', '[', 'not json', '{}', 'null', '[1]', '[null]'];
    const shapes: unknown[] = [
      { ...ours, state: 'DRAFT' },
      { ...ours, number: '7' },
      { ...ours, url: 7 },
      unmarked,
      unlabelled,
    ];
    shapes.push({ ...ours, labels: [{ name: 7 }] }, { ...ours, labels: ['needs-owner'] }, { ...ours, labels: {} });
    for (const bad of [...malformed, ...shapes.map((shape) => JSON.stringify([shape]))])
      expect(parseRecord(bad)).toBeUndefined();
  });

  it('reviewDate reads the date of an agent review branch, with a suffix -2 to -9, only', () => {
    expect(reviewDate(REVIEW)).toBe('2027-01-01');
    expect([reviewDate(`${REVIEW}-2`), reviewDate(`${REVIEW}-9`)]).toEqual(['2027-01-01', '2027-01-01']);
    const others = ['', 'main', 'agent/content-review-2027-1-01', `${REVIEW}-b`, `x/${REVIEW}`];
    for (const branch of [...others, `${REVIEW}-1`, `${REVIEW}-0`, `${REVIEW}-10`, `${REVIEW}-2-2`])
      expect(reviewDate(branch)).toBeUndefined();
  });

  it("recordState prints one line per pull request of the review's branch, and nothing for none", () => {
    const record: PullRequest[] = [
      { number: 3, state: 'CLOSED', url: 'https://github.com/o/r/pull/3', labels: [] },
      { number: 4, state: 'OPEN', url: 'https://github.com/o/r/pull/4', labels: [] },
    ];
    expect(recordState(REVIEW, record)).toEqual([
      `${REVIEW}: #3 closed, https://github.com/o/r/pull/3`,
      `${REVIEW}: #4 open, https://github.com/o/r/pull/4`,
    ]);
    expect(recordState(REVIEW, [])).toEqual([]);
  });
});
