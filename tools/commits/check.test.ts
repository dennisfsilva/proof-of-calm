import { describe, expect, it } from 'vitest';
import { checkRange, checkSubject, type Git } from './check.ts';

describe('checkSubject', () => {
  it.each([
    'feat: one-tap logging on Today',
    'fix(core): split fees by largest remainder',
    'chore(deps)!: move to Next 17',
    'docs(adr): record the release-age exemption',
    'test(core/dates): leap-year anniversaries',
  ])('accepts %s', (subject) => {
    expect(checkSubject(subject)).toBeNull();
  });

  it('accepts merge commits', () => {
    expect(checkSubject("Merge branch 'main' into feat/x")).toBeNull();
  });

  it.each(['Add today page', 'feature: something', 'fix:missing space', 'fix(Core): uppercase scope', 'feat: '])(
    'rejects %s',
    (subject) => {
      expect(checkSubject(subject)).toMatch(/not a conventional commit/);
    },
  );

  it('rejects subjects over 100 characters', () => {
    expect(checkSubject(`feat: ${'a'.repeat(100)}`)).toMatch(/longer than 100/);
  });
});

/**
 * A git that knows every revision except `missing` and prints `log` for origin/main..HEAD only: the commits HEAD
 * has and origin/main lacks. The range read backwards (HEAD..origin/main) or symmetric (origin/main...HEAD) fails
 * the test.
 */
function fakeGit(log: string, missing: string[] = []): Git {
  return (args) => {
    if (args[0] === 'rev-parse') {
      const unknown = missing.some((revision) => args.includes(`${revision}^{commit}`));
      if (unknown) throw new Error('fatal: Needed a single revision');
      return '0123abc\n';
    }
    if (args[0] === 'log') {
      expect(args).toEqual(['log', '--format=%s', 'origin/main..HEAD']);
      return log;
    }
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
}

describe('checkRange (pnpm gate: origin/main..HEAD)', () => {
  it('passes an empty range, as on main itself', () => {
    expect(checkRange('origin/main', 'HEAD', fakeGit(''))).toEqual([]);
  });

  it('reports each subject of the range that breaks the rule', () => {
    const log = `fix(core): split fees by largest remainder\nAdd today page\nfeat: ${'a'.repeat(100)}\n`;
    expect(checkRange('origin/main', 'HEAD', fakeGit(log))).toEqual([
      expect.stringMatching(/^"Add today page" is not a conventional commit/),
      expect.stringMatching(/longer than 100 characters/),
    ]);
  });

  it('says what it needs when origin/main is missing', () => {
    expect(checkRange('origin/main', 'HEAD', fakeGit('', ['origin/main']))).toEqual([
      'origin/main is not a commit in this clone, so the subjects of origin/main..HEAD cannot be read: fetch it first (git fetch origin main).',
    ]);
  });

  it('reads this repository with git itself', () => {
    expect(checkRange('HEAD', 'HEAD')).toEqual([]);
    expect(checkRange('refs/heads/no-such-branch-for-the-check', 'HEAD')).toEqual([
      expect.stringMatching(/^refs\/heads\/no-such-branch-for-the-check is not a commit in this clone/),
    ]);
  });
});
