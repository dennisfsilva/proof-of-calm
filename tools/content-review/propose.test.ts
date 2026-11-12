import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { finishProblems, parseRaw, prArgs } from './propose.ts';
import { reviewNames } from './resume.ts';

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
 * `pr create` adds an open PR with its labels and prints its URL (with `unlabelled`, without them and then exits 1,
 * as gh does when its second call fails), `pr edit <n> --add-label` adds one, and `mode` makes every call fail as a logged-out (exit 4), an
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
    const listed = state.prs.filter((pr) => pr.head === head);
    console.log(JSON.stringify(listed.map(({ head, labels = [], ...pr }) => ({ ...pr, labels: labels.map((name) => ({ name })) }))));
  } else if (args[0] === 'pr' && args[1] === 'create') {
    const number = state.prs.length + 1;
    const url = 'https://github.com/o/r/pull/' + number;
    const labels = state.unlabelled ? [] : args.filter((_, i) => args[i - 1] === '--label');
    state.prs.push({ number, state: 'OPEN', url, isCrossRepository: false, head, labels });
    fs.writeFileSync(file, JSON.stringify(state));
    fs.writeSync(1, url + '\\n');
    // gh adds labels in a second call after it creates the PR, and prints the URL before that call fails.
    if (state.unlabelled) fail(1, 'pull request update failed: GraphQL: the fake gh adds no label');
  } else if (args[0] === 'pr' && args[1] === 'edit' && args[3] === '--add-label') {
    const pr = state.prs.find((each) => each.number === Number(args[2]));
    if (!pr) fail(1, 'GraphQL: no pull request ' + args[2]);
    pr.labels = [...new Set([...(pr.labels || []), args[4]])];
    fs.writeFileSync(file, JSON.stringify(state));
  } else fail(1, 'GraphQL: the fake gh refuses ' + args.slice(0, 2).join(' '));
  process.exit(0);
}
`;

/**
 * Windows' gh.exe: node under gh's name, kept across runs in one folder per node version, because a fresh copy
 * of node (about 80 MB) pays the antivirus scan on its first run (docs/BUILD-PROMPT.md, Brief lessons). A hard
 * link first (the same file, already scanned); a copy when the folder is on another volume or links are refused.
 */
const EXE_DIR = join(tmpdir(), `propose-gh-${process.version}`);
function placeExe(): 'linked' | 'copied' | 'reused' {
  const exe = join(EXE_DIR, 'gh.exe');
  if (existsSync(exe) && statSync(exe).size === statSync(process.execPath).size) return 'reused';
  mkdirSync(EXE_DIR, { recursive: true });
  rmSync(exe, { force: true });
  try {
    linkSync(process.execPath, exe);
    return 'linked';
  } catch (error) {
    if (!['EXDEV', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
    copyFileSync(process.execPath, exe);
    return 'copied';
  }
}

/** One folder per run holding the fake gh's script; on Windows the shared gh.exe loads it. */
let fakeBin = '';
function fakeGh(): { dir: string; env: Record<string, string> } {
  if (fakeBin === '') {
    fakeBin = mkdtempSync(join(tmpdir(), 'propose-gh-'));
    writeFileSync(join(fakeBin, process.platform === 'win32' ? 'gh.cjs' : 'gh'), FAKE_GH, { mode: 0o755 });
    // A new copy runs once here, so its first-run scan falls in beforeAll's minute, not in a test.
    if (process.platform === 'win32' && placeExe() !== 'reused') execFileSync(join(EXE_DIR, 'gh.exe'), ['-e', '0']);
  }
  const preload = join(fakeBin, 'gh.cjs').replace(/\\/g, '/');
  if (process.platform !== 'win32') return { dir: fakeBin, env: {} };
  return { dir: EXE_DIR, env: { NODE_OPTIONS: `--require ${preload}` } };
}
beforeAll(() => void fakeGh(), 120_000);
afterAll(() => {
  if (fakeBin !== '') rmSync(fakeBin, { recursive: true, force: true });
});

type FakeGh = {
  prs: { number: number; state: string; url: string; isCrossRepository: boolean; head: string; labels?: string[] }[];
  mode?: 'logged-out' | 'expired' | 'offline';
  unlabelled?: boolean;
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

const TODAYS = reviewNames(localToday())[0] ?? '';
const PR1 = 'https://github.com/o/r/pull/1';
const LEAVE = 'to start another review, run git switch --detach origin/main';
const REFUSED = 'finish: refused; nothing committed or pushed';

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

  it("the fake gh's gh.exe is placed once per node version and reused after", () => {
    placeExe();
    expect(placeExe()).toBe('reused');
    expect(statSync(join(EXE_DIR, 'gh.exe')).size).toBe(statSync(process.execPath).size);
  });

  it("prArgs opens the review's branch labelled needs-owner and content-review and never merges", () => {
    const args = prArgs('agent/content-review-2027-01-01-2', '2027-01-01', ['PT', 'IE'], '.content-review/body.md');
    expect(args).toEqual([
      'pr',
      'create',
      '--base',
      'main',
      '--head',
      'agent/content-review-2027-01-01-2',
      '--title',
      'Content review of 2027-01-01: PT, IE',
      '--body-file',
      '.content-review/body.md',
      '--label',
      'needs-owner',
      '--label',
      'content-review',
    ]);
    expect(prArgs('agent/content-review-2027-01-01', '2027-01-01', [], 'b.md')).toContain(
      'Content review of 2027-01-01: all',
    );
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
    const pr = `${TODAYS}: #1 open, ${PR1}`;
    try {
      writeGh(root, { prs: [] });
      const start0 = cli(root, repo, ['start']);
      write(FIXTURE, ENTRY);
      expect([lines(start0), start0.status]).toEqual([[`start: clean at origin/main; this review takes ${TODAYS}`], 0]);
      const finish = cli(root, repo, ['finish']);
      expect([lines(finish).at(-1), finish.status]).toEqual([PR1, 0]);
      const head = git('rev-parse', 'HEAD');
      expect(git('ls-remote', 'origin', TODAYS)).toBe(`${head}\trefs/heads/${TODAYS}`);
      expect(readGh(root).prs[0]?.labels).toEqual(['needs-owner', 'content-review']);
      const fork = { number: 2, state: 'OPEN', url: 'https://github.com/f/r/pull/2', isCrossRepository: true };
      writeGh(root, { prs: [...readGh(root).prs, { ...fork, head: TODAYS }] });
      const start = cli(root, repo, ['start']);
      expect([lines(start), start.status]).toEqual([[pr, LEAVE, 'start: refused'], 1]);
      expect([git('rev-parse', 'HEAD'), git('branch', '--show-current'), git('status', '--porcelain')]).toEqual([
        head,
        TODAYS,
        '',
      ]);
      // Off the review's branch, start names the day's next free name.
      git('switch', '--quiet', '--detach', 'origin/main');
      expect(lines(cli(root, repo, ['start']))).toEqual([`start: clean at origin/main; this review takes ${TODAYS}-2`]);
    } finally {
      clean();
    }
  }, 30_000);

  it('(a) a second review of the day takes -2 while the first PR is open, and origin/R stays as it was', () => {
    const { root, repo, git, write, clean } = originRepo();
    try {
      writeGh(root, { prs: [] });
      write(FIXTURE, ENTRY);
      expect(cli(root, repo, ['finish']).status).toBe(0);
      const first = git('rev-parse', 'HEAD');
      git('switch', '--quiet', '--detach', 'origin/main');
      write(FIXTURE, ENTRY);
      const second = cli(root, repo, ['finish']);
      expect([lines(second).at(-1), second.status]).toEqual(['https://github.com/o/r/pull/2', 0]);
      expect(git('branch', '--show-current')).toBe(`${TODAYS}-2`);
      expect(git('ls-remote', 'origin', TODAYS)).toBe(`${first}\trefs/heads/${TODAYS}`);
      expect(readGh(root).prs.map((pr) => [pr.number, pr.head, pr.state])).toEqual([
        [1, TODAYS, 'OPEN'],
        [2, `${TODAYS}-2`, 'OPEN'],
      ]);
    } finally {
      clean();
    }
  }, 30_000);

  it("(b) finish on R at origin/R with the owner's two commits prints the URL, exits 0 and pushes nothing", () => {
    const { root, repo, git, write, clean } = originRepo();
    try {
      writeGh(root, { prs: [] });
      write(FIXTURE, ENTRY);
      expect(cli(root, repo, ['finish']).status).toBe(0);
      for (const [n, text] of [
        ['1', ENTRY.replace('agent-draft', 'owner')],
        ['2', '{"a":1}\n'],
      ] as const) {
        write(n === '1' ? FIXTURE : FACTS, text);
        git('commit', '--quiet', '--all', '--message', `the owner's flip ${n}`);
      }
      git('push', '--quiet', 'origin', TODAYS);
      const tip = git('rev-parse', 'HEAD');
      const finish = cli(root, repo, ['finish']);
      expect([lines(finish), finish.status]).toEqual([[`${TODAYS}: #1 open, ${PR1}`, LEAVE], 0]);
      expect([git('ls-remote', 'origin', TODAYS), readGh(root).prs.length]).toEqual([
        `${tip}\trefs/heads/${TODAYS}`,
        1,
      ]);
    } finally {
      clean();
    }
  }, 30_000);

  it('(c) a PR created without its labels gets needs-owner on the next finish', () => {
    const { root, repo, write, clean } = originRepo();
    try {
      writeGh(root, { prs: [], unlabelled: true });
      write(FIXTURE, ENTRY);
      const finish = cli(root, repo, ['finish']);
      expect([lines(finish).at(-1), finish.status]).toEqual([
        'pr: pull request update failed: GraphQL: the fake gh adds no label: run finish again',
        1,
      ]);
      writeGh(root, { prs: readGh(root).prs });
      const again = cli(root, repo, ['finish']);
      expect([lines(again), again.status]).toEqual([
        [`${TODAYS}: #1 open, ${PR1}`, LEAVE, 'needs-owner: added to #1'],
        0,
      ]);
      expect(readGh(root).prs.map((pr) => pr.labels)).toEqual([['needs-owner']]);
    } finally {
      clean();
    }
  }, 30_000);

  it('(d) a failed push says run finish again, and the next finish pushes and opens the PR', () => {
    const { root, repo, git, write, clean } = originRepo();
    const hook = join(root, 'origin.git', 'hooks', 'pre-receive');
    try {
      writeGh(root, { prs: [] });
      writeFileSync(hook, '#!/bin/sh\necho refused by the test >&2\nexit 1\n', { mode: 0o755 });
      write(FIXTURE, ENTRY);
      const finish = cli(root, repo, ['finish']);
      expect([lines(finish).at(-1), finish.status]).toEqual(['push: remote: refused by the test: run finish again', 1]);
      expect([git('branch', '--show-current'), git('ls-remote', '--heads', 'origin', TODAYS)]).toEqual([TODAYS, '']);
      rmSync(hook);
      const again = cli(root, repo, ['finish']);
      expect([lines(again), again.status]).toEqual([
        [`${TODAYS}: no pull request yet; finish goes on: push, pr`, PR1],
        0,
      ]);
      expect(git('ls-remote', 'origin', TODAYS)).toBe(`${git('rev-parse', 'HEAD')}\trefs/heads/${TODAYS}`);
    } finally {
      clean();
    }
  }, 30_000);

  it('(e) finish on R refuses a merged PR and pushes nothing', () => {
    const { root, repo, git, write, clean } = originRepo();
    try {
      writeGh(root, { prs: [] });
      write(FIXTURE, ENTRY);
      expect(cli(root, repo, ['finish']).status).toBe(0);
      writeGh(root, { prs: readGh(root).prs.map((pr) => ({ ...pr, state: 'MERGED' })) });
      git('push', '--quiet', 'origin', `:${TODAYS}`); // GitHub drops a merged PR's branch
      const finish = cli(root, repo, ['finish']);
      expect([lines(finish), finish.status]).toEqual([
        [
          `${TODAYS}: #1 merged, ${PR1}`,
          `${TODAYS}: its pull request is not open; finish never pushes this branch again`,
        ].concat([LEAVE, REFUSED]),
        1,
      ]);
      expect([git('ls-remote', '--heads', 'origin', TODAYS), readGh(root).prs.length]).toEqual(['', 1]);
    } finally {
      clean();
    }
  }, 30_000);

  it("(f) start on a dirty tree beside a draft says a review's edits wait", () => {
    const { root, repo, write, clean } = originRepo();
    try {
      writeGh(root, { prs: [] });
      write(FIXTURE, ENTRY);
      const start = cli(root, repo, ['start']);
      const waits =
        "the working tree is not clean: 1 paths changed or untracked: a review's edits wait: run finish again";
      expect([lines(start), start.status]).toEqual([[waits, 'start: refused'], 1]);
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
