import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { branchName, finishProblems, parseRaw, prArgs } from './propose.ts';

const FACTS = 'packages/content/facts/education.json';
const CYCLES = 'packages/content/cycles/drawdowns.json';
const MODULE = 'packages/content/learn/what-dca-is.mdx';
const FIXTURE = 'packages/content/facts/finish-fixture.json';
const TEMPLATE = '.github/PULL_REQUEST_TEMPLATE/content-review.md';
const ALLOW = 'packages/content/sources.allow.json';
const SCRIPT = fileURLToPath(new URL('./propose.ts', import.meta.url));
const here = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
/** finish-good.patch's new fact, which fixtures/draft-good.json's change and reviewed rows name. */
const ENTRY = '[\n  { "key": "finish-fixture", "reviewedBy": "agent-draft" }\n]\n';
const UNTOUCHED = 'finish: refused, 1 problems; nothing committed, the index as found';
const lines = (result: { stdout: string }) => result.stdout.trim().split('\n');

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

/** A temporary repository at a bare origin's main, with the template, the allow-list and a good draft. */
function originRepo() {
  const root = mkdtempSync(join(tmpdir(), 'propose-'));
  const { repo, git, write } = tempRepo({
    '.gitignore': '/.content-review/\n',
    [FACTS]: '{}\n',
    [TEMPLATE]: here(`../../${TEMPLATE}`),
    [ALLOW]: here(`../../${ALLOW}`),
  });
  const origin = join(root, 'origin.git').replace(/\\/g, '/');
  execFileSync('git', ['init', '--quiet', '--bare', origin], { encoding: 'utf8' });
  git('remote', 'add', 'origin', origin);
  git('push', '--quiet', 'origin', 'main');
  git('fetch', '--quiet', 'origin');
  write('.content-review/draft.json', here('./fixtures/draft-good.json'));
  const clean = () => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  };
  return { root, repo, git, write, clean };
}

/**
 * The fake gh: `pr list --head <branch>` prints the PRs of that head from the JSON file FAKE_GH_STATE names,
 * `pr create` adds an open PR and prints its URL, and `mode` makes every call fail as a logged-out (exit 4), an
 * expired or revoked token's (exit 1, HTTP 401, as gh 2.102.0 prints it) or an offline (exit 1) gh. On POSIX it is the script `gh`; on Windows, which runs no script without a shell, it is
 * a copy of node named gh.exe that NODE_OPTIONS makes load this file first (any other node skips it).
 */
const FAKE_GH = `#!/usr/bin/env node
const { basename } = require('node:path');
if (require.main === module || /^gh(\\.exe)?$/i.test(basename(process.execPath))) {
  const fs = require('node:fs');
  const args = require.main === module ? process.argv.slice(2) : [basename(process.argv[1]), ...process.argv.slice(2)];
  const file = process.env.FAKE_GH_STATE;
  const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { prs: [] };
  const head = args[args.indexOf('--head') + 1];
  const fail = (code, line) => { process.stderr.write(line + '\\n'); process.exit(code); };
  if (state.mode === 'logged-out') fail(4, 'You are not logged into any GitHub hosts. To log in, run: gh auth login');
  if (state.mode === 'expired') {
    fail(1, 'HTTP 401: Bad credentials (https://api.github.com/graphql)\\nTry authenticating with:  gh auth login -h github.com');
  }
  if (state.mode === 'offline') fail(1, 'error connecting to api.github.com');
  if (args[0] === 'pr' && args[1] === 'list') {
    console.log(JSON.stringify(state.prs.filter((pr) => pr.head === head).map(({ head, ...pr }) => pr)));
  } else if (args[0] === 'pr' && args[1] === 'create') {
    const number = state.prs.length + 1;
    const url = 'https://github.com/o/r/pull/' + number;
    state.prs.push({ number, state: 'OPEN', url, isCrossRepository: false, head });
    fs.writeFileSync(file, JSON.stringify(state));
    console.log(url);
  } else fail(1, 'GraphQL: the fake gh refuses ' + args.slice(0, 2).join(' '));
  process.exit(0);
}
`;

/** One folder per run holding the fake gh (a copy of node on Windows is about 80 MB, so it is made once). */
let fakeBin = '';
function fakeGh(): { dir: string; env: Record<string, string> } {
  if (fakeBin === '') {
    fakeBin = mkdtempSync(join(tmpdir(), 'propose-gh-'));
    writeFileSync(join(fakeBin, process.platform === 'win32' ? 'gh.cjs' : 'gh'), FAKE_GH, { mode: 0o755 });
    if (process.platform === 'win32') copyFileSync(process.execPath, join(fakeBin, 'gh.exe'));
  }
  const preload = join(fakeBin, 'gh.cjs').replace(/\\/g, '/');
  return { dir: fakeBin, env: process.platform === 'win32' ? { NODE_OPTIONS: `--require ${preload}` } : {} };
}
beforeAll(() => void fakeGh(), 30_000);
afterAll(() => {
  if (fakeBin !== '') rmSync(fakeBin, { recursive: true, force: true });
});

type FakeGh = {
  prs: { number: number; state: string; url: string; isCrossRepository: boolean; head: string }[];
  mode?: 'logged-out' | 'expired' | 'offline';
};
const ghState = (root: string) => join(root, 'gh.json');
const readGh = (root: string): FakeGh => JSON.parse(readFileSync(ghState(root), 'utf8'));
const writeGh = (root: string, state: FakeGh) => writeFileSync(ghState(root), JSON.stringify(state));

/**
 * Runs propose.ts in the repository with only node, git and (unless `gh` is false) the fake gh on PATH, so the
 * real gh is never reached. Git for Windows' local push needs its own sh and DLLs (mingw64/bin and usr/bin
 * beside libexec/git-core).
 */
function cli(root: string, repo: string, args: string[], gh = true) {
  const exec = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim();
  const gitDirs =
    process.platform === 'win32' ? ['mingw64/bin', 'usr/bin'].map((dir) => resolve(exec, '../../..', dir)) : [exec];
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !['PATH', 'NODE_OPTIONS'].includes(key.toUpperCase())),
  );
  const fake = gh ? fakeGh() : { dir: '', env: {} };
  env.PATH = [...(gh ? [fake.dir] : []), dirname(process.execPath), ...gitDirs].join(delimiter);
  Object.assign(env, fake.env, { FAKE_GH_STATE: ghState(root) });
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: repo, encoding: 'utf8', env });
}

/** The local date finish names today's branch after. */
function localToday(): string {
  const date = new Date();
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, '0'))
    .join('-');
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

  it('finish refuses without --dry, advising no detach, when HEAD holds a commit origin/main lacks', () => {
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
      expect(lines(result)).toEqual([
        `HEAD ${head.slice(0, 8)} on branch ahead holds 1 commits that origin/main ${originMain.slice(0, 8)} lacks: ` +
          'save its edits, and only then switch back to origin/main',
        UNTOUCHED,
      ]);
      expect(result.stdout).not.toContain('--detach');
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

  it('start and finish refuse, changing nothing, when gh is missing, logged out, its token expired or offline, and when the fetch fails', () => {
    const { root, repo, git, write, clean } = originRepo();
    const loggedOut =
      /^gh pr list: You are not logged into any GitHub hosts\..*: run gh auth login, then run it again$/;
    const expired =
      'gh pr list: HTTP 401: Bad credentials (https://api.github.com/graphql): run gh auth login, then run it again';
    const cases: [FakeGh | undefined, string | RegExp][] = [
      [undefined, 'gh pr list: gh is missing: install GitHub CLI and run gh auth login, then run it again'],
      [{ prs: [], mode: 'logged-out' }, loggedOut],
      [{ prs: [], mode: 'expired' }, expired],
      [{ prs: [], mode: 'offline' }, 'gh pr list: error connecting to api.github.com: reconnect, then run it again'],
      [{ prs: [] }, /^git fetch: .+: reconnect, then run it again$/],
    ];
    try {
      const [head, url] = [git('rev-parse', 'HEAD'), git('remote', 'get-url', 'origin')];
      for (const [gh, first] of cases) {
        if (gh) writeGh(root, gh);
        if (gh && !gh.mode) git('remote', 'set-url', 'origin', join(root, 'gone.git').replace(/\\/g, '/'));
        // start at a clean origin/main refuses only for the failed read (its wiring: without it, start passes).
        const start = cli(root, repo, ['start'], gh !== undefined);
        expect(lines(start)[0]).toMatch(first);
        expect([lines(start).slice(1), start.status]).toEqual([['start: refused'], 1]);
        write(FIXTURE, ENTRY);
        const finish = cli(root, repo, ['finish'], gh !== undefined);
        expect(lines(finish)[0]).toMatch(first);
        expect([lines(finish).slice(1), finish.status]).toEqual([[UNTOUCHED], 1]);
        expect([git('rev-parse', 'HEAD'), git('branch', '--show-current')]).toEqual([head, 'main']);
        expect([git('status', '--porcelain'), git('branch', '--list', 'agent/*')]).toEqual([`?? ${FIXTURE}`, '']);
        rmSync(join(repo, FIXTURE));
      }
      git('remote', 'set-url', 'origin', url);
      expect(git('ls-remote', '--heads', 'origin')).not.toContain('refs/heads/agent/');
      expect(readGh(root).prs).toEqual([]);
    } finally {
      clean();
    }
  }, 30_000);

  it("finish proposes today's branch; start prints its record without forks and refuses on it", () => {
    const { root, repo, git, write, clean } = originRepo();
    const todays = branchName(localToday());
    const pr = `${todays}: #1 open, https://github.com/o/r/pull/1`;
    try {
      writeGh(root, { prs: [] });
      write(FIXTURE, ENTRY);
      const finish = cli(root, repo, ['finish']);
      expect([lines(finish).at(-1), finish.status]).toEqual(['https://github.com/o/r/pull/1', 0]);
      const head = git('rev-parse', 'HEAD');
      expect(git('ls-remote', 'origin', todays)).toBe(`${head}\trefs/heads/${todays}`);
      const fork = { number: 2, state: 'OPEN', url: 'https://github.com/f/r/pull/2', isCrossRepository: true };
      writeGh(root, { prs: [...readGh(root).prs, { ...fork, head: todays }] });
      const main = git('rev-parse', 'origin/main').slice(0, 8);
      const start = cli(root, repo, ['start']);
      expect(lines(start)).toEqual([
        pr,
        `HEAD ${head.slice(0, 8)} on branch ${todays} holds 1 commits that origin/main ${main} lacks: ` +
          'save its edits, and only then switch back to origin/main',
        'start: refused',
      ]);
      expect(start.status).toBe(1);
      expect([git('rev-parse', 'HEAD'), git('branch', '--show-current'), git('status', '--porcelain')]).toEqual([
        head,
        todays,
        '',
      ]);
      // Off the review's branch, start reads today's record.
      git('switch', '--quiet', '--detach', 'origin/main');
      expect(lines(cli(root, repo, ['start']))).toEqual([pr, 'start: clean at origin/main']);
    } finally {
      clean();
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
