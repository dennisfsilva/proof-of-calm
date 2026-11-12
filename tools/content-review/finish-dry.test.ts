// The wiring of a null pendingChanges effective date: `propose.ts finish --dry --draft` in a temporary
// repository with finish-good.patch's fact, on draft-good.json with its pending `effectiveFrom` set to
// null. Reverting body.ts's 'date|null' shape line fails this test, since the finish then refuses the draft.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('./propose.ts', import.meta.url));
const TEMPLATE = '.github/PULL_REQUEST_TEMPLATE/content-review.md';
const ALLOW = 'packages/content/sources.allow.json';
const FACT = 'packages/content/facts/finish-fixture.json';
const fromRepo = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

it('finish --dry accepts a pending change with a null effectiveFrom and prints no effective date yet', () => {
  const repo = mkdtempSync(join(tmpdir(), 'finish-dry-'));
  const outside = mkdtempSync(join(tmpdir(), 'finish-dry-draft-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
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
    write(TEMPLATE, fromRepo(TEMPLATE));
    write(ALLOW, fromRepo(ALLOW));
    git('add', '-A');
    git('commit', '--quiet', '--message', 'base');
    write(FACT, '[\n  { "key": "finish-fixture", "reviewedBy": "agent-draft" }\n]\n');

    const draft = JSON.parse(fromRepo('tools/content-review/fixtures/draft-good.json'));
    draft.pending[0].effectiveFrom = null;
    const draftPath = join(outside, 'draft.json');
    writeFileSync(draftPath, JSON.stringify(draft));

    const result = spawnSync(process.execPath, [SCRIPT, 'finish', '--dry', '--draft', draftPath], {
      cwd: repo,
      encoding: 'utf8',
    });
    expect(result.stdout.trim().split('\n')).toEqual([
      'finish --dry: accepted, 1 paths; the body is in .content-review/body.md',
    ]);
    expect(result.status).toBe(0);
    const body = readFileSync(join(repo, '.content-review/body.md'), 'utf8');
    expect(body).toMatch(/^## Pending changes noticed\n\n- .*; proposed, no effective date yet; \[/m);
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
}, 30_000);
