// The wiring of a null pendingChanges effective date: `propose.ts finish --dry --draft` in a temporary
// repository with finish-good.patch's fact, on draft-good.json with its pending `effectiveFrom` set to
// null. Reverting body.ts's 'date|null' shape line fails this test, since the finish then refuses the draft.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { useGitDecoy } from '../git-decoy.ts';
import { GIT_FREE_ENV } from '../git-env.ts';

useGitDecoy();

const SCRIPT = fileURLToPath(new URL('./propose.ts', import.meta.url));
const TEMPLATE = '.github/PULL_REQUEST_TEMPLATE/content-review.md';
const ALLOW = 'packages/content/sources.allow.json';
const FACT = 'packages/content/facts/finish-fixture.json';
const fromRepo = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

/**
 * A temporary repository holding the PR template, the allow-list and `base` committed, then `change` written
 * over it; `finish --dry` runs there on draft-good.json as `edit` leaves it. Returns the run and the body.
 */
function dryFinish(
  base: Record<string, string>,
  change: Record<string, string>,
  edit: (draft: { pending: { effectiveFrom: unknown }[] }) => void,
) {
  const repo = mkdtempSync(join(tmpdir(), 'finish-dry-'));
  const outside = mkdtempSync(join(tmpdir(), 'finish-dry-draft-'));
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf8', env: GIT_FREE_ENV }).trim();
  const write = (path: string, text: string) => {
    mkdirSync(join(repo, path, '..'), { recursive: true });
    writeFileSync(join(repo, path), text);
  };
  try {
    git('init', '--quiet', '--initial-branch', 'main');
    for (const [key, value] of [
      ['user.name', 't'],
      ['user.email', 't@example.invalid'],
      ['commit.gpgsign', 'false'],
      ['core.autocrlf', 'false'],
    ] as const)
      git('config', key, value);
    for (const [path, text] of Object.entries({ [TEMPLATE]: fromRepo(TEMPLATE), [ALLOW]: fromRepo(ALLOW), ...base }))
      write(path, text);
    git('add', '-A');
    git('commit', '--quiet', '--message', 'base');
    for (const [path, text] of Object.entries(change)) write(path, text);

    const draft = JSON.parse(fromRepo('tools/content-review/fixtures/draft-good.json'));
    edit(draft);
    const draftPath = join(outside, 'draft.json');
    writeFileSync(draftPath, JSON.stringify(draft));

    const result = spawnSync(process.execPath, [SCRIPT, 'finish', '--dry', '--draft', draftPath], {
      cwd: repo,
      encoding: 'utf8',
      env: GIT_FREE_ENV,
    });
    const body = result.status === 0 ? readFileSync(join(repo, '.content-review/body.md'), 'utf8') : '';
    return { lines: result.stdout.trim().split('\n'), status: result.status, body };
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
}

const FACT_TEXT = '[\n  { "key": "finish-fixture", "reviewedBy": "agent-draft" }\n]\n';

it('finish --dry accepts a pending change with a null effectiveFrom and prints no effective date yet', () => {
  const { lines, status, body } = dryFinish({}, { [FACT]: FACT_TEXT }, (draft) => {
    draft.pending[0].effectiveFrom = null;
  });
  expect(lines).toEqual(['finish --dry: accepted, 1 paths; the body is in .content-review/body.md']);
  expect(status).toBe(0);
  expect(body).toMatch(/^## Pending changes noticed\n\n- .*; proposed, no effective date yet; \[/m);
}, 30_000);

// The wiring of the removed-row refusal (check.ts, reviewerProblems' cycles branch): the cycles file loses its
// SOL row under agent-draft. Deleting removedRows from that branch fails this test, since the finish then
// prints no row line.
it('finish --dry refuses a cycles file that lost a chart row and names the coin', () => {
  const CYCLES = 'packages/content/cycles/drawdowns.json';
  const btc = { coin: 'BTC', high: '2021-11-10', low: '2022-11-21', fall: '78' };
  const sol = { coin: 'SOL', high: '2021-11-06', low: '2022-12-29', fall: '96' };
  const chart = (reviewedBy: string, ...drawdowns: object[]) =>
    `${JSON.stringify({ lastReviewed: '2026-11-09', reviewedBy, drawdowns }, null, 2)}\n`;
  const { lines, status } = dryFinish(
    { [CYCLES]: chart('owner', btc, sol) },
    { [FACT]: FACT_TEXT, [CYCLES]: chart('agent-draft', btc) },
    () => {},
  );
  expect(lines).toContain(`${CYCLES}: a SOL row removed; the draft names the removal and the owner deletes it`);
  expect(lines.at(-1)).toMatch(/^finish: refused, \d+ problems; nothing committed, the index as found$/);
  expect(status).toBe(1);
}, 30_000);
