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
    const repo = mkdtempSync(join(tmpdir(), 'propose-'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
    const write = (path: string, text: string) => {
      mkdirSync(join(repo, path, '..'), { recursive: true });
      writeFileSync(join(repo, path), text);
    };
    try {
      git('init', '--quiet', '--initial-branch', 'main');
      const config: [string, string][] = [
        ['user.name', 't'],
        ['user.email', 't@example.invalid'],
        ['commit.gpgsign', 'false'],
      ];
      for (const [key, value] of config) git('config', key, value);
      write(FACTS, '{}\n');
      git('add', '-A');
      git('commit', '--quiet', '--message', 'base');
      git('update-ref', 'refs/remotes/origin/main', 'HEAD');
      git('switch', '--quiet', '--create', 'ahead');
      write('.github/workflows/ci.yml', 'on: push\n');
      git('add', '-A');
      git('commit', '--quiet', '--message', 'outside data');
      write(FACTS, '{"a":1}\n');
      const head = git('rev-parse', 'HEAD');
      const status = git('status', '--porcelain');
      const tree = git('write-tree');
      const script = fileURLToPath(new URL('./propose.ts', import.meta.url));
      const result = spawnSync(process.execPath, [script, 'finish'], { cwd: repo, encoding: 'utf8' });
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
  });

  it("SKILL.md's allowed-tools holds no git, gh, WebFetch or WebSearch rule", () => {
    const skill = readFileSync(new URL('../../.claude/skills/review-content/SKILL.md', import.meta.url), 'utf8');
    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(skill)?.[1] ?? '';
    const list = /^allowed-tools:\r?\n((?:[ \t]+- .*\r?\n?)+)/m.exec(front)?.[1] ?? '';
    const rules = [...list.matchAll(/^[ \t]+- (.*?)[ \t]*$/gm)].map((match) => match[1]);
    expect(rules.filter((rule) => /^(?:Bash\((?:git|gh)\b|WebFetch|WebSearch)/.test(rule ?? ''))).toEqual([]);
    expect(rules).toEqual([
      'Read',
      'Grep',
      'Glob',
      ...['jurisdictions', 'rules', 'facts', 'templates', 'cycles'].map(
        (dir) => `Edit(/packages/content/${dir}/*.json)`,
      ),
      'Edit(/packages/content/learn/*.mdx)',
      'Edit(/.content-review/*)',
      'Bash(pnpm run validate:content)',
      'Bash(pnpm --filter @proofofcalm/content test)',
      'Bash(pnpm --filter @proofofcalm/content rules)',
      'Bash(node tools/content-review/propose.ts start)',
      'Bash(node tools/content-review/propose.ts finish)',
      'Bash(node tools/content-review/propose.ts finish --dry)',
    ]);
  });
});
