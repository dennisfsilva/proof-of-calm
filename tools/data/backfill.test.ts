// Synthetic values only (ADR-0036, Reading of 2026-11-27): made-up timestamps and closes in the
// archive's shape, never a real Kraken figure. One node start per case, as hooks.test.ts runs.
import { spawnSync } from 'node:child_process';
import { existsSync, symlinkSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const run = (...args: string[]) =>
  spawnSync(process.execPath, ['--import', './tools/data/hooks.ts', 'tools/data/backfill.ts', ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20_000,
  });

// 2020-01-01 to 2020-01-04 at 00:00 UTC.
const DAY = [1_577_836_800, 1_577_923_200, 1_578_009_600, 1_578_096_000] as const;
// Closes no count could spell, so a leak would show as a substring of the output.
const CLOSES = ['4321.987', '4322.876', '4323.765', '4399.111', '987.6543', '8.76e-05', '0.0000876'] as const;
const daily = (rows: [number, string][]) =>
  rows.map(([seconds, close]) => `${seconds},1,2,0.5,${close},10,3\n`).join('');

let base: string;
let store: string;
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'backfill-'));
  store = join(base, 'store');
  await mkdir(store);
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

async function archive(name: string, files: Record<string, string>): Promise<string> {
  const dir = join(base, name);
  await mkdir(dir);
  for (const [symbol, text] of Object.entries(files)) await writeFile(join(dir, `${symbol}_1440.csv`), text, 'utf8');
  return dir;
}

const stored = (pair: string) => readFile(join(store, 'closes', 'kraken', `${pair}.csv`), 'utf8');

function expectNoClose(result: ReturnType<typeof run>) {
  for (const close of CLOSES) {
    expect(result.stdout).not.toContain(close);
    expect(result.stderr).not.toContain(close);
  }
}

it('writes each pair found to its store file and prints counts only', { timeout: 30_000 }, async () => {
  const full = await archive('full', {
    XBTEUR: daily([
      [DAY[0], CLOSES[0]],
      [DAY[1], CLOSES[1]],
      [DAY[3], CLOSES[2]],
    ]),
    ETHUSD: daily([[DAY[1], CLOSES[5]]]),
  });
  const result = run('--source', 'kraken-bulk', '--dir', full, '--store', store);
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  const lines = result.stdout.trimEnd().split('\n');
  expect(lines).toContain('kraken-bulk missing: ETH-EUR (ETHEUR) in --dir 1');
  expect(lines).toContain('kraken-bulk missing: BTC-USD (XBTUSD) in --dir 1');
  expect(lines).not.toContain('kraken-bulk missing: BTC-EUR (XBTEUR) in --dir 1');
  // Each quote's count line follows its own missing lines.
  expect(lines[25]).toBe('kraken-bulk EUR: 26 pairs, 3 added, 0 revised, 0 failed, 25 missing');
  expect(lines.at(-1)).toBe('kraken-bulk USD: 26 pairs, 1 added, 0 revised, 0 failed, 25 missing');
  expect(lines).toHaveLength(52);
  expect(await stored('BTC-EUR')).toBe('date,close\n2020-01-01,4321.987\n2020-01-02,4322.876\n2020-01-04,4323.765\n');
  expect(await stored('ETH-USD')).toBe('date,close\n2020-01-02,0.0000876\n');
  expect(await readdir(join(store, 'closes', 'kraken'))).toEqual(['BTC-EUR.csv', 'ETH-USD.csv']);
  expectNoClose(result);
});

it('adds the later days of a second --dir and counts a revised day without taking it', {
  timeout: 30_000,
}, async () => {
  const full = await archive('full', {
    XBTEUR: daily([
      [DAY[0], CLOSES[0]],
      [DAY[1], CLOSES[1]],
    ]),
  });
  const update = await archive('update', {
    XBTEUR: daily([
      [DAY[1], CLOSES[3]],
      [DAY[2], CLOSES[2]],
    ]),
  });
  const result = run('--source', 'kraken-bulk', '--dir', full, '--dir', update, '--store', store);
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('kraken-bulk EUR: 26 pairs, 3 added, 1 revised, 0 failed, 50 missing\n');
  expect(await stored('BTC-EUR')).toBe('date,close\n2020-01-01,4321.987\n2020-01-02,4322.876\n2020-01-03,4323.765\n');
  expectNoClose(result);
});

it('writes nothing with --dry and still counts', { timeout: 30_000 }, async () => {
  const full = await archive('full', { XBTEUR: daily([[DAY[0], CLOSES[0]]]) });
  const result = run('--source', 'kraken-bulk', '--dir', full, '--store', store, '--dry');
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  expect(result.stdout).toContain(
    'kraken-bulk EUR: 26 pairs, 1 added, 0 revised, 0 failed, 25 missing (dry: nothing written)\n',
  );
  expect(await readdir(store)).toEqual([]);
  expectNoClose(result);
});

it('fails a malformed file whole, names the pair and a reason, and keeps the others', { timeout: 30_000 }, async () => {
  const full = await archive('full', {
    XBTEUR: daily([
      [DAY[0], CLOSES[0]],
      [DAY[1], `${CLOSES[1]}x`],
    ]),
    ETHEUR: daily([[DAY[0], CLOSES[4]]]),
    SOLEUR: `${DAY[0]},1,2,0.5,${CLOSES[2]},10\n`,
  });
  const result = run('--source', 'kraken-bulk', '--dir', full, '--store', store);
  expect(result.status).toBe(1);
  expect(result.stderr).toBe(
    'kraken-bulk failed: BTC-EUR (XBTEUR) in --dir 1: close\nkraken-bulk failed: SOL-EUR (SOLEUR) in --dir 1: fields\n',
  );
  expect(result.stdout).toContain('kraken-bulk EUR: 26 pairs, 1 added, 0 revised, 2 failed, 23 missing\n');
  expect(await readdir(join(store, 'closes', 'kraken'))).toEqual(['ETH-EUR.csv']);
  expectNoClose(result);
});

it('refuses a usage it does not know with one closed line', { timeout: 30_000 }, () => {
  const args = ['--source', 'kraken-bulk', '--dir', root, '--store', join(root, 'tools'), '--dry'];
  const result = run(...args, '--extra', CLOSES[0]);
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toBe(
    'kraken-bulk refused: usage: --source kraken-bulk --dir <extracted> [--dir <another>] --store <dir> [--dry]\n',
  );
  expectNoClose(result);
});

it('stops on a malformed store file with the store refusal only', { timeout: 30_000 }, async () => {
  const full = await archive('full', { XBTEUR: daily([[DAY[0], CLOSES[0]]]) });
  await mkdir(join(store, 'closes', 'kraken'), { recursive: true });
  await writeFile(join(store, 'closes', 'kraken', 'BTC-EUR.csv'), `date,close\n2020-01-01,${CLOSES[3]},x\n`, 'utf8');
  const result = run('--source', 'kraken-bulk', '--dir', full, '--store', store);
  expect(result.status).toBe(1);
  expect(result.stderr).toBe('kraken-bulk refused: closes/kraken/BTC-EUR.csv is malformed\n');
  expect(result.stdout).not.toContain('EUR: 26 pairs');
  expectNoClose(result);
});

it('refuses a store inside this repository', { timeout: 30_000 }, async () => {
  const full = await archive('full', { XBTEUR: daily([[DAY[0], CLOSES[0]]]) });
  // --dry, so a broken guard would print counts instead of writing into packages/data.
  const result = run('--source', 'kraken-bulk', '--dir', full, '--store', join(root, 'packages', 'data'), '--dry');
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toBe('kraken-bulk refused: --store is inside this repository\n');
});

// A junction on Windows (no admin rights needed), a directory symlink on Linux, pointing at a fresh
// folder under the repository's gitignored node_modules, so the working tree stays clean.
it('refuses a store reached through a link into this repository', { timeout: 60_000 }, async () => {
  const target = await mkdtemp(join(root, 'node_modules', '.backfill-'));
  try {
    await mkdir(join(target, 'sub'));
    const link = join(base, 'link');
    symlinkSync(target, link, 'junction');
    const full = await archive('full', { XBTEUR: daily([[DAY[0], CLOSES[0]]]) });
    // An existing folder below the link, and one whose last parts do not exist yet.
    for (const below of [join(link, 'sub'), join(link, 'sub', 'not', 'yet')]) {
      const result = run('--source', 'kraken-bulk', '--dir', full, '--store', below);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('kraken-bulk refused: --store is inside this repository\n');
    }
    expect(await readdir(join(target, 'sub'))).toEqual([]);
  } finally {
    // The link itself first, never followed; then the folder it pointed at.
    await rm(join(base, 'link'), { force: true });
    await rm(target, { recursive: true, force: true });
  }
});

// realpath leaves a loopback UNC path as it is, so only the shared guard's identity check refuses it.
it.runIf(process.platform === 'win32')(
  'refuses a store reached through the loopback admin share',
  {
    timeout: 60_000,
  },
  async (context) => {
    const { root: drive } = parse(root);
    const share = `\\\\localhost\\${drive.slice(0, 1)}$\\`;
    if (!existsSync(share)) context.skip();
    const target = await mkdtemp(join(root, 'node_modules', '.backfill-'));
    try {
      const full = await archive('full', { XBTEUR: daily([[DAY[0], CLOSES[0]]]) });
      const unc = share + target.slice(drive.length);
      for (const below of [unc, join(unc, 'not', 'yet')]) {
        const result = run('--source', 'kraken-bulk', '--dir', full, '--store', below);
        expect(result.status).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr).toBe('kraken-bulk refused: --store is inside this repository\n');
      }
      expect(await readdir(target)).toEqual([]);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  },
);

// A folder named like the repository with a suffix, beside it: the guard lets it through, so the next
// check speaks. The suffix is one no clone could carry (a store's clone sits beside the repository as
// <name>-closes), the folder must be absent before the run, and --dry writes nothing even if it
// appeared in between, so the test can never merge into a real folder.
it('lets a store beside the repository past the guard', { timeout: 30_000 }, async () => {
  const full = await archive('full', { XBTEUR: daily([[DAY[0], CLOSES[0]]]) });
  const beside = `${root.replace(/[\\/]+$/, '')}-backfill-guard-probe`;
  expect(existsSync(beside), `${beside} exists; remove it before running this test`).toBe(false);
  const result = run('--source', 'kraken-bulk', '--dir', full, '--store', beside, '--dry');
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toBe('kraken-bulk refused: --store is not a folder\n');
  expect(existsSync(beside)).toBe(false);
});
