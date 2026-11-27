// The daily job's two workflows (daily.md; ADR-0058): closes-store.yml, the template the private
// repository runs a byte-for-byte copy of, and data-dry.yml, the public dry run that is a branch's evidence.
// Their pins, permissions and triggers, and what neither may hold: a cache, an artifact, a ref input.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MIDNIGHT_ALLOWANCE_MINUTES } from './sources/bitstamp.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const store = read('./closes-store.yml');
const dry = read('../../.github/workflows/data-dry.yml');

// The SHAs the repository's other workflows pin (ci.yml, daily-rebuild.yml).
const PINS = [
  'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
  'actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0',
  'pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0',
];

describe.each([
  ['closes-store.yml', store],
  ['data-dry.yml', dry],
])('%s', (_, text) => {
  it('pins every action by a full SHA the other workflows use, with its version beside it', () => {
    const uses = (text.match(/uses: .*/g) ?? []).map((line) => line.slice('uses: '.length));
    expect(uses.length).toBeGreaterThan(0);
    for (const action of uses) expect(PINS).toContain(action);
  });

  it('grants nothing at the top, keeps no cache and uploads no artifact, within a timeout', () => {
    expect(text).toMatch(/^permissions: \{\}$/m);
    expect(text.match(/permissions:/g)).toHaveLength(2);
    expect(text).not.toMatch(/actions\/cache|upload-artifact|^ +cache:/m);
    expect(text).toMatch(/^ {10}package-manager-cache: false$/m);
    expect(text).toMatch(/^ {4}timeout-minutes: 15$/m);
  });
});

describe('closes-store.yml', () => {
  it('runs at 01:17 UTC and by a dispatch that takes no inputs, one run at a time', () => {
    expect(store).toMatch(/^on:\n {2}schedule:\n {4}- cron: "17 1 \* \* \*"\n {2}workflow_dispatch:\n\n/m);
    expect(store).not.toMatch(/inputs:|pull_request|push:/);
    expect(store).toMatch(/^concurrency:\n {2}group: closes-store\n {2}cancel-in-progress: false$/m);
  });

  it('writes the store with its own token only', () => {
    expect(store).toMatch(/^ {4}permissions:\n {6}contents: write\n {4}steps:$/m);
    expect(store).not.toContain('secrets.');
  });

  it('checks out this repository’s main only, keeping no credential, and fails while the copy differs', () => {
    expect(store).toContain(
      '        with:\n          repository: dennisfsilva/proof-of-calm\n          ref: main\n          path: app\n          persist-credentials: false\n',
    );
    expect(store.match(/ref:/g)).toHaveLength(1);
    expect(store).toMatch(
      /^ {8}run: cmp store\/\.github\/workflows\/closes-store\.yml app\/tools\/data\/closes-store\.yml$/m,
    );
    // The comparison comes before anything from the app's checkout runs.
    expect(store.indexOf('run: cmp')).toBeLessThan(store.indexOf('pnpm/action-setup'));
  });

  it('runs the daily job into the store and commits what changed unless the run was cancelled', () => {
    expect(store).toMatch(
      /^ {8}run: node --import \.\/tools\/data\/hooks\.ts tools\/data\/daily\.ts --store \.\.\/store$/m,
    );
    expect(store).not.toContain('--dry');
    const commit = /- name: Commit the closes\n((?: {8}.*\n)+)/.exec(store)?.[1] ?? '';
    expect(commit).toContain(`        if: $\{{ !cancelled() }}\n`);
    expect(commit).toContain('git config user.email "41898282+github-actions[bot]@users.noreply.github.com"');
    expect(commit).toContain('git commit --quiet --message "data: closes of $(date -u +%F)"');
    expect(commit).toContain('git diff --cached --quiet');
  });

  it('gives the daily step its own timeout, well under the job’s, so a slow run still reaches the commit', () => {
    const daily = /- name: Append the closes\n((?: {8}.*\n)+)/.exec(store)?.[1] ?? '';
    const step = Number(/^ {8}timeout-minutes: (\d+)$/m.exec(daily)?.[1]);
    const job = Number(/^ {4}timeout-minutes: (\d+)$/m.exec(store)?.[1]);
    expect(step).toBeGreaterThan(0);
    // The commit step needs the rest: install before the daily step, the commit and push after it.
    expect(step).toBeLessThanOrEqual(job - 5);
  });

  it('gives Bitstamp’s midnight allowance the daily step’s timeout, the longest a step can still read', () => {
    const daily = /- name: Append the closes\n((?: {8}.*\n)+)/.exec(store)?.[1] ?? '';
    expect(MIDNIGHT_ALLOWANCE_MINUTES).toBe(Number(/^ {8}timeout-minutes: (\d+)$/m.exec(daily)?.[1]));
  });

  it('stages only finished store files, never the temporary file a killed write leaves', () => {
    const commit = /- name: Commit the closes\n((?: {8}.*\n)+)/.exec(store)?.[1] ?? '';
    const adds = commit.match(/git add .*/g) ?? [];
    expect(adds).toEqual([`git add --all -- ':(glob)closes/*/*.csv'`]);
    // Nothing is staged otherwise, and the step ends quietly when there is no store file yet.
    expect(commit).not.toMatch(/git (commit|stage) .*(-a\b|--all)/);
    expect(commit).toContain(`if ! ls closes/*/*.csv > /dev/null 2>&1; then exit 0; fi`);
  });

  it('retries a rejected push 3 times on top of a pull with rebase, aborting one that conflicts', () => {
    const commit = /- name: Commit the closes\n((?: {8}.*\n)+)/.exec(store)?.[1] ?? '';
    // commit-step.test.ts runs these lines against a racing push on a depth-1 checkout.
    expect(commit).toMatch(
      /git commit .*\n {10}for try in 1 2 3 4; do\n {12}if git push --quiet; then exit 0; fi\n {12}if \[ "\$try" = 4 \]; then exit 1; fi\n {12}sleep 10\n {12}if ! git pull --rebase --quiet; then git rebase --abort \|\| true; exit 1; fi\n {10}done\n$/,
    );
    expect(commit.match(/git push/g)).toHaveLength(1);
    expect(store).toMatch(/^# .*is retried up to 3 times, each 10 s later on$/m);
  });
});

describe('data-dry.yml', () => {
  it('runs by dispatch and on a push to any branch but main that changes the pipeline or itself', () => {
    expect(dry).toMatch(
      /^on:\n {2}push:\n {4}branches-ignore:\n {6}- main\n {4}paths:\n {6}- "tools\/data\/\*\*"\n {6}- "\.github\/workflows\/data-dry\.yml"\n {2}workflow_dispatch:\n\n/m,
    );
    expect(dry).not.toMatch(/inputs:|pull_request|schedule:/);
  });

  it('reads only, holds no secret and keeps no credential', () => {
    expect(dry).toMatch(/^ {4}permissions:\n {6}contents: read\n {4}steps:$/m);
    expect(dry).not.toContain('secrets.');
    expect(dry).toContain('        with:\n          persist-credentials: false\n');
  });

  it('runs the daily job dry into a store under the runner’s temporary folder', () => {
    expect(dry).toContain('mkdir "$RUNNER_TEMP/store"');
    expect(dry).toContain('node --import ./tools/data/hooks.ts tools/data/daily.ts --store "$RUNNER_TEMP/store" --dry');
  });
});
