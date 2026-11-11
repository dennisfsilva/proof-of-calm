import { describe, expect, it } from 'vitest';
import { DATA_PATHS, outsideData, prFiles, reviewerProblems } from './check.ts';

/** One line of the step's listing: path, previous name and the files API's status, tab-separated. */
const row = (path: string, status = 'modified', previous = '') => `${path}\t${previous}\t${status}\n`;

describe('outsideData', () => {
  it('outsideData refuses a workflow, package.json, sources.allow.json, src/, a rename from outside, mode 120000, a binary, `..` and an absolute path', () => {
    expect(
      outsideData([
        { path: '.github/workflows/ci.yml' },
        { path: 'packages/content/package.json' },
        { path: 'packages/content/sources.allow.json' },
        { path: 'packages/content/src/validate.ts' },
        { path: 'packages/content/facts/a.json', previous: 'packages/content/src/index.ts' },
        { path: 'packages/content/facts/link.json', mode: '120000' },
        { path: 'packages/content/cycles/data.json', binary: true },
        { path: 'packages/content/facts/../../../x.json' },
        { path: '/etc/passwd' },
      ]),
    ).toEqual([
      '.github/workflows/ci.yml: not content data',
      'packages/content/package.json: not content data',
      'packages/content/sources.allow.json: not content data',
      'packages/content/src/validate.ts: not content data',
      'packages/content/facts/a.json: renamed from packages/content/src/index.ts, not content data',
      'packages/content/facts/link.json: mode 120000, only 100644',
      'packages/content/cycles/data.json: a binary change',
      'packages/content/facts/../../../x.json: not a relative path',
      '/etc/passwd: not a relative path',
    ]);
    for (const path of ['packages/content/turbo.json', 'packages/content/facts/sub/a.json', 'C:/x.json'])
      expect(outsideData([{ path }])).toHaveLength(1);
  });

  it('outsideData accepts each data folder', () => {
    const paths = [
      'packages/content/jurisdictions/pt.json',
      'packages/content/rules/pt.json',
      'packages/content/facts/education.json',
      'packages/content/templates/two-coins.json',
      'packages/content/cycles/drawdowns.json',
      'packages/content/learn/noise.mdx',
    ];
    expect(paths.every((path) => DATA_PATHS.some((pattern) => pattern.test(path)))).toBe(true);
    expect(outsideData(paths.map((path) => ({ path, mode: '100644' })))).toEqual([]);
    const renamed = { path: 'packages/content/facts/b.json', previous: 'packages/content/facts/a.json' };
    expect(outsideData([renamed])).toEqual([]);
  });
});

describe('prFiles', () => {
  const listing = row('packages/content/facts/education.json') + row('.github/workflows/ci.yml');

  it('prFiles enforces on an agent/ head and --enforce, reports elsewhere', () => {
    for (const [head, flags] of [
      ['agent/content-review-2027-01-01', []],
      ['feat/x', ['--enforce']],
    ] as const) {
      const step = prFiles(head, flags, listing);
      expect(step.refused).toBe(true);
      expect(step.lines).toEqual([
        '.github/workflows/ci.yml: not content data',
        '1 of 2 files fail the guard (enforced)',
      ]);
    }
    const report = prFiles('feat/x', [], listing);
    expect(report.refused).toBe(false);
    expect(report.lines.at(-1)).toBe('1 of 2 files fail the guard (not an agent branch: not enforced)');
    expect(prFiles('agent/x', [], row('packages/content/learn/noise.mdx', 'added')).refused).toBe(false);
    expect(prFiles('agent/x', [], '').lines).toContain('no files listed');
  });

  it('prFiles refuses a removed data file when enforced', () => {
    const removed = row('packages/content/facts/education.json', 'removed');
    expect(prFiles('agent/x', [], removed)).toEqual({
      lines: [
        'packages/content/facts/education.json: removed; the draft names the removal and the owner deletes it',
        '1 of 1 files fail the guard (enforced)',
      ],
      refused: true,
    });
    expect(prFiles('feat/x', [], removed).refused).toBe(false);
    const renamed = row('packages/content/facts/b.json', 'renamed', 'packages/content/facts/a.json');
    expect(prFiles('agent/x', [], renamed).refused).toBe(true);
    expect(prFiles('agent/x', [], row('packages/content/facts/a.json', 'changed')).lines[0]).toBe(
      'packages/content/facts/a.json: status changed, only added, modified or renamed',
    );
  });

  it('prFiles refuses a data file renamed away when enforced', () => {
    const removal = 'removed; the draft names the removal and the owner deletes it';
    const away = row('packages/content/jurisdictions/zz.json', 'renamed', 'packages/content/jurisdictions/pt.json');
    expect(prFiles('agent/content-review-x', ['--expect', '1'], away)).toEqual({
      lines: [`packages/content/jurisdictions/pt.json: ${removal}`, '1 of 1 files fail the guard (enforced)'],
      refused: true,
    });
    expect(prFiles('feat/x', [], away).refused).toBe(false);
    const within = row('packages/content/facts/b.json', 'renamed', 'packages/content/facts/a.json');
    expect(prFiles('agent/x', [], within).lines).toEqual([
      `packages/content/facts/a.json: ${removal}`,
      '1 of 1 files fail the guard (enforced)',
    ]);
    const into = row('packages/content/facts/a.json', 'renamed', 'packages/content/src/index.ts');
    expect(prFiles('agent/x', [], into).lines).toEqual([
      'packages/content/facts/a.json: renamed from packages/content/src/index.ts, not content data',
      '1 of 1 files fail the guard (enforced)',
    ]);
  });

  it('prFiles refuses a listing shorter than --expect', () => {
    const step = prFiles('agent/x', ['--expect', '3001'], row('packages/content/facts/a.json'));
    expect(step.refused).toBe(true);
    expect(step.lines[0]).toBe('1 files listed, 3001 changed');
    expect(prFiles('agent/x', ['--expect', '1'], row('packages/content/facts/a.json')).refused).toBe(false);
    expect(prFiles('agent/x', ['--expect', 'x'], row('packages/content/facts/a.json')).refused).toBe(true);
  });
});

describe('reviewerProblems', () => {
  const path = 'packages/content/facts/education.json';
  const facts = (...entries: object[]) => JSON.stringify(entries);
  const fact = { key: 'a.one', value: 'x', reviewedBy: 'owner' };

  it('reviewerProblems refuses a changed fact at owner and passes an unchanged one', () => {
    expect(reviewerProblems(path, facts(fact), facts({ ...fact, value: 'y' }))).toEqual([
      `${path}: fact a.one: reviewedBy is owner, not agent-draft`,
    ]);
    const added = { key: 'a.two', value: 'z', reviewedBy: 'agent-draft' };
    expect(reviewerProblems(path, facts(fact), facts(fact, added))).toEqual([]);
    expect(reviewerProblems('packages/content/templates/a.json', '{}', '{"reviewedBy":"owner"}')).toHaveLength(1);
    expect(reviewerProblems('packages/content/jurisdictions/pt.json', undefined, '{"status":{}}')).toHaveLength(1);
    expect(reviewerProblems('packages/content/cycles/a.json', '{}', '{"reviewedBy":"agent-draft"}')).toEqual([]);
    const module = '---\nslug: a\nreviewedBy: agent-draft\n---\n\nreviewedBy: agent-draft\n';
    expect(reviewerProblems('packages/content/learn/a.mdx', '', module)).toEqual([]);
    expect(reviewerProblems('packages/content/learn/a.mdx', '', module.replace('agent-draft', 'owner'))).toEqual([
      'packages/content/learn/a.mdx: reviewedBy is owner, not agent-draft',
    ]);
    expect(reviewerProblems('packages/content/rules/pt.json', '{}', '{"a":1}')).toEqual([]);
    expect(reviewerProblems('packages/content/templates/a.json', '{}', '{')).toEqual([
      'packages/content/templates/a.json: not valid JSON',
    ]);
  });

  it('reviewerProblems refuses a deleted fact entry and a deleted file', () => {
    const other = { key: 'a.two', value: 'z', reviewedBy: 'owner' };
    expect(reviewerProblems(path, facts(fact, other), facts(other))).toEqual([`${path}: fact a.one deleted`]);
    expect(reviewerProblems(path, facts(fact), undefined)).toEqual([
      `${path}: deleted; the draft names the removal and the owner deletes it`,
    ]);
    expect(reviewerProblems(path, undefined, undefined)).toEqual([]);
  });
});
