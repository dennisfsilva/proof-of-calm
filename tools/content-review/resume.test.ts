import { describe, expect, it } from 'vitest';
import { type HeadAt, headProblems, parseRecord, recordState, reviewDate, startProblems } from './resume.ts';

const [SHA, MAIN] = ['a'.repeat(40), 'b'.repeat(40)];
const REVIEW = 'agent/content-review-2027-01-01';
const at = (more: Partial<HeadAt>): HeadAt => ({ sha: SHA, branch: '', ahead: 0, status: '', ...more });

describe('resume', () => {
  it('startProblems refuses a dirty tree and a HEAD that is not origin/main, advising a detach only when safe', () => {
    expect(startProblems(at({ sha: MAIN }), MAIN)).toEqual([]);
    expect(startProblems(at({ sha: MAIN, status: ' M packages/content/facts/a.json\n?? notes.txt\n' }), MAIN)).toEqual([
      'the working tree is not clean: 2 paths changed or untracked',
    ]);
    expect(startProblems(at({}), MAIN)).toEqual([
      'HEAD aaaaaaaa is not origin/main bbbbbbbb: run git switch --detach origin/main',
    ]);
    expect(startProblems(at({ ahead: 2 }), MAIN)).toEqual([
      'HEAD aaaaaaaa (detached) holds 2 commits that origin/main bbbbbbbb lacks: save its edits, ' +
        'and only then switch back to origin/main',
    ]);
    expect(startProblems(at({}), '')).toEqual(['origin/main is missing: fetch it']);
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

  it("parseRecord reads gh's PR list, drops pull requests from forks and refuses any other shape", () => {
    const ours = { number: 7, state: 'MERGED', url: 'https://github.com/o/r/pull/7', isCrossRepository: false };
    const fork = { number: 8, state: 'OPEN', url: 'https://github.com/o/r/pull/8', isCrossRepository: true };
    expect(parseRecord(JSON.stringify([fork, ours]))).toEqual([
      { number: 7, state: 'MERGED', url: 'https://github.com/o/r/pull/7' },
    ]);
    expect(parseRecord(JSON.stringify([fork]))).toEqual([]);
    expect(parseRecord('[]')).toEqual([]);
    const { isCrossRepository: _, ...unmarked } = ours;
    const malformed = ['', '[', 'not json', '{}', 'null', '[1]', '[null]'];
    const shapes = [{ ...ours, state: 'DRAFT' }, { ...ours, number: '7' }, { ...ours, url: 7 }, unmarked];
    for (const bad of [...malformed, ...shapes.map((pr) => JSON.stringify([pr]))])
      expect(parseRecord(bad)).toBeUndefined();
  });

  it('reviewDate reads the date of an agent review branch only', () => {
    expect(reviewDate(REVIEW)).toBe('2027-01-01');
    for (const branch of ['', 'main', 'agent/content-review-2027-1-01', `${REVIEW}-b`, `x/${REVIEW}`])
      expect(reviewDate(branch)).toBeUndefined();
  });

  it("recordState prints one line per pull request of the review's branch, and nothing for none", () => {
    const record = [
      { number: 3, state: 'CLOSED', url: 'https://github.com/o/r/pull/3' },
      { number: 4, state: 'OPEN', url: 'https://github.com/o/r/pull/4' },
    ] as const;
    expect(recordState(REVIEW, record)).toEqual([
      `${REVIEW}: #3 closed, https://github.com/o/r/pull/3`,
      `${REVIEW}: #4 open, https://github.com/o/r/pull/4`,
    ]);
    expect(recordState(REVIEW, [])).toEqual([]);
  });
});
