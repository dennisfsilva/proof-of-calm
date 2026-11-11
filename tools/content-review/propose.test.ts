import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { branchName, finishProblems, parseRaw, prArgs, startProblems } from './propose.ts';

const FACTS = 'packages/content/facts/education.json';
const CYCLES = 'packages/content/cycles/drawdowns.json';
const MODULE = 'packages/content/learn/what-dca-is.mdx';
const SCRIPT = fileURLToPath(new URL('./propose.ts', import.meta.url));

/** A temporary repository with one committed file per entry, and git and write helpers bound to it. */
function tempRepo(files: Record<string, string>) {
  const repo = mkdtempSync(join(tmpdir(), 'propose-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  const write = (path: string, text: string) => {
    mkdirSync(join(repo, path, '..'), { recursive: true });
    writeFileSync(join(repo, path), text);
  };
  git('init', '--quiet', '--initial-branch', 'main');
  const config: [string, string][] = [
    ['user.name', 't'],
    ['user.email', 't@example.invalid'],
    ['commit.gpgsign', 'false'],
    ['core.autocrlf', 'false'],
  ];
  for (const [key, value] of config) git('config', key, value);
  for (const [path, text] of Object.entries(files)) write(path, text);
  git('add', '-A');
  git('commit', '--quiet', '--message', 'base');
  return { repo, git, write };
}

describe('propose', () => {
  it('parseRaw lists modes, deletions and binaries', () => {
    const raw = [
      `:100644 100644 1111111 2222222 M\0${FACTS}\0`,
      ':000000 100755 0000000 3333333 A\0tools/run.sh\0',
      `:100644 000000 4444444 0000000 D\0${CYCLES}\0`,
      `:000000 100644 0000000 5555555 A\0${MODULE}\0`,
      ':000000 120000 0000000 6666666 A\0packages/content/facts/link.json\0',
    ].join('');
    const numstat = [`2\t1\t${FACTS}\0`, '3\t0\ttools/run.sh\0', `0\t40\t${CYCLES}\0`, `-\t-\t${MODULE}\0`].join('');
    expect(parseRaw(raw, numstat)).toEqual([
      { path: FACTS, mode: '100644' },
      { path: 'tools/run.sh', mode: '100755' },
      { path: CYCLES, deleted: true },
      { path: MODULE, mode: '100644', binary: true },
      { path: 'packages/content/facts/link.json', mode: '120000' },
    ]);
    expect(parseRaw('', '')).toEqual([]);
  });

  it('finishProblems refuses a path outside data, a deletion, an entry not at agent-draft and a draft problem', () => {
    const owner = `${FACTS}: fact cgt-rate: reviewedBy is owner, not agent-draft`;
    const offList = 'changes[0].url: example.org is not on packages/content/sources.allow.json';
    const problems = finishProblems(
      [
        { path: '.github/workflows/ci.yml', mode: '100644' },
        { path: CYCLES, deleted: true },
        { path: FACTS, mode: '100644' },
      ],
      [owner],
      [offList],
    );
    expect(problems).toEqual([
      '.github/workflows/ci.yml: not content data',
      `${CYCLES}: removed; the draft names the removal and the owner deletes it`,
      owner,
      offList,
    ]);
    expect(finishProblems([{ path: FACTS, mode: '100644' }], [], [])).toEqual([]);
    expect(finishProblems([], [], [])).toEqual(['nothing staged: the review changed no content data']);
  });

  it('branchName is 31 characters', () => {
    expect(branchName('2027-01-01')).toBe('agent/content-review-2027-01-01');
    expect(branchName('2027-01-01')).toHaveLength(31);
  });

  it('prArgs labels needs-owner and content-review and never merges', () => {
    const args = prArgs('2027-01-01', ['PT', 'IE'], '.content-review/body.md');
    expect(args).toEqual([
      'pr',
      'create',
      '--base',
      'main',
      '--head',
      'agent/content-review-2027-01-01',
      '--title',
      'Content review of 2027-01-01: PT, IE',
      '--body-file',
      '.content-review/body.md',
      '--label',
      'needs-owner',
      '--label',
      'content-review',
    ]);
    expect(prArgs('2027-01-01', [], 'b.md')).toContain('Content review of 2027-01-01: all');
    for (const word of ['merge', '--admin', '--auto', '--squash', '--rebase'])
      expect(args.some((arg) => arg.includes(word))).toBe(false);
  });

  it('startProblems refuses a dirty tree and a HEAD that is not origin/main', () => {
    const sha = 'a'.repeat(40);
    expect(startProblems('', sha, sha)).toEqual([]);
    expect(startProblems(` M ${FACTS}\n?? notes.txt\n`, sha, sha)).toEqual([
      'the working tree is not clean: 2 paths changed or untracked',
    ]);
    expect(startProblems('', sha, 'b'.repeat(40))).toEqual([
      'HEAD aaaaaaaa is not origin/main bbbbbbbb: run git switch --detach origin/main',
    ]);
    expect(startProblems('', sha, '')).toEqual(['origin/main is missing: fetch it']);
  });

  it('finish refuses without --dry when HEAD is not origin/main', () => {
    const { repo, git, write } = tempRepo({ [FACTS]: '{}\n' });
    try {
      git('update-ref', 'refs/remotes/origin/main', 'HEAD');
      git('switch', '--quiet', '--create', 'ahead');
      write('.github/workflows/ci.yml', 'on: push\n');
      git('add', '-A');
      git('commit', '--quiet', '--message', 'outside data');
      write(FACTS, '{"a":1}\n');
      const head = git('rev-parse', 'HEAD');
      const status = git('status', '--porcelain');
      const tree = git('write-tree');
      const result = spawnSync(process.execPath, [SCRIPT, 'finish'], { cwd: repo, encoding: 'utf8' });
      const originMain = git('rev-parse', 'origin/main');
      expect(result.stdout.trim().split('\n')).toEqual([
        `HEAD ${head.slice(0, 8)} is not origin/main ${originMain.slice(0, 8)}: run git switch --detach origin/main`,
        'finish: refused, 1 problems; nothing committed, the index as found',
      ]);
      expect(result.status).toBe(1);
      expect([git('rev-parse', 'HEAD'), git('branch', '--show-current')]).toEqual([head, 'ahead']);
      expect([git('status', '--porcelain'), git('write-tree')]).toEqual([status, tree]);
      expect(git('branch', '--list', 'agent/*')).toBe('');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, 30_000);

  it("finish --dry refuses a staged module's changed lastReviewed line, with a one-row draft", () => {
    const front = (by: string, reviewed: string) =>
      ['---', 'title: What DCA is', `reviewedBy: ${by}`, `lastReviewed: ${reviewed}`, 'nextReviewDue: 2027-10-01']
        .concat(['---', '', 'Buying the same amount on a schedule.', ''])
        .join('\n');
    const template = '.github/PULL_REQUEST_TEMPLATE/content-review.md';
    const { repo, git, write } = tempRepo({
      [MODULE]: front('owner', '2026-10-01'),
      [template]: readFileSync(new URL(`../../${template}`, import.meta.url), 'utf8'),
      'packages/content/sources.allow.json': '{"facts":["example.org"]}\n',
    });
    const outside = mkdtempSync(join(tmpdir(), 'propose-draft-'));
    try {
      write(MODULE, front('agent-draft', '2026-11-10'));
      git('add', '-A');
      const tree = git('write-tree');
      const draft = join(outside, 'draft.json');
      const row = {
        ...{ item: 'learn/what-dca-is.mdx', field: 'reviewedBy', old: 'owner', new: 'agent-draft' },
        ...{ quote: 'Buying the same amount on a schedule.', eventDate: '2026-11-10', url: 'https://example.org/dca' },
        ...{ accessed: '2026-11-10', confidence: 'high', substantive: false, reason: 'The source still says so.' },
      };
      const reviewed = [{ item: row.item, read: 1, of: 1, confidence: 'high', reason: 'The one source was read.' }];
      const lists = { reviewed, verified: [], unreachable: [], pending: [], queue: [], notes: [] };
      writeFileSync(draft, JSON.stringify({ date: '2026-11-10', model: 'm', countries: [], changes: [row], ...lists }));
      const args = [SCRIPT, 'finish', '--dry', '--draft', draft];
      const result = spawnSync(process.execPath, args, { cwd: repo, encoding: 'utf8' });
      const owner = 'the agent never sets lastReviewed or nextReviewDue; the owner sets lastReviewed in the flip';
      expect(result.stdout.trim().split('\n')).toEqual([
        `draft: ${MODULE}: a line with lastReviewed or nextReviewDue changed; ${owner} (docs/CONTENT-OPS.md §8)`,
        'finish: refused, 1 problems; nothing committed, the index as found',
      ]);
      expect(result.status).toBe(1);
      expect(git('write-tree')).toBe(tree);
      expect(git('status', '--porcelain', '--', '.content-review')).toBe('');
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  }, 30_000);

  it("allowed-tools holds no git, gh, WebFetch, WebSearch, rules/ Edit or pdf.ts rule, and Edit covers the draft's write", () => {
    const skill = readFileSync(new URL('../../.claude/skills/review-content/SKILL.md', import.meta.url), 'utf8');
    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(skill)?.[1] ?? '';
    const list = /^allowed-tools:\r?\n((?:[ \t]+- .*\r?\n?)+)/m.exec(front)?.[1] ?? '';
    const rules = [...list.matchAll(/^[ \t]+- (.*?)[ \t]*$/gm)].map((match) => match[1]);
    // pdf.ts fetches, so it asks the owner on each run and shows its URL (.claude/rules/skills.md).
    const banned =
      /^(?:Bash\((?:git|gh)\b|WebFetch|WebSearch|Edit\(\/packages\/content\/rules\/|Bash\(node tools\/content-review\/pdf\.ts)/;
    expect(rules.filter((rule) => banned.test(rule ?? ''))).toEqual([]);
    expect(rules).toEqual([
      'Read',
      'Grep',
      'Glob',
      ...['jurisdictions', 'facts', 'templates', 'cycles'].map((dir) => `Edit(/packages/content/${dir}/*.json)`),
      'Edit(/packages/content/learn/*.mdx)',
      'Edit(/.content-review/*)',
      'Bash(pnpm run validate:content)',
      'Bash(pnpm --filter @proofofcalm/content test)',
      'Bash(pnpm --filter @proofofcalm/content rules)',
      'Bash(node tools/content-review/propose.ts start)',
      'Bash(node tools/content-review/propose.ts finish)',
      'Bash(node tools/content-review/propose.ts finish --dry)',
    ]);
    // Claude Code matches Write against Edit rules and ignores a Write(path) rule, so the draft's write
    // rides on Edit(/.content-review/*), and a comment in the frontmatter says so.
    expect(front).toMatch(/^# .*Edit rules.*Write/m);
  });
});
