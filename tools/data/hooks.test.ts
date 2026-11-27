import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const run = (...args: string[]) =>
  spawnSync(process.execPath, ['--import', './tools/data/hooks.ts', 'tools/data/hooks.fixture.ts', ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20_000,
  });

it('runs the store and packages/core under plain node, extensionless imports and all', { timeout: 30_000 }, () => {
  const result = run();
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  expect(result.stdout).toBe('rows 2\n');
});

it('still fails on a module that does not exist', { timeout: 30_000 }, () => {
  const result = run('missing');
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('ERR_MODULE_NOT_FOUND');
  expect(result.stderr).toMatch(/absent' imported from/);
});
