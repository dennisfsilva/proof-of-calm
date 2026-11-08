// Turbo hashes a task over its own package's files and, through `transit`, its dependencies'. A check that
// reads files of a package it does not depend on names them as inputs with `$TURBO_ROOT$`
// (tools/turbo.json, packages/content/turbo.json); otherwise a change to them replays the cached pass in
// `pnpm test`, `pnpm validate:content` and `pnpm gate`. The dry run lists the files each task hashes. A
// package's turbo.json goes into its own tasks' hashes, not the global hash, so this test, whose dry run
// reads packages/content/turbo.json, counts it among the files the tools tests read.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const turbo = fileURLToPath(new URL('../../node_modules/turbo/bin/turbo', import.meta.url));
const toRoot = (path: string) => relative(root, path).replaceAll('\\', '/');

type PlannedTask = { taskId: string; directory: string; inputs: object; outputs: string[] };

/** Turbo's dry-run plan of a package's task. */
function plan(packageName: string, task: string): PlannedTask {
  const output = execFileSync(process.execPath, [turbo, 'run', task, `--filter=${packageName}`, '--dry=json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const { tasks } = JSON.parse(output) as { tasks: PlannedTask[] };
  const planned = tasks.find(({ taskId }) => taskId === `${packageName}#${task}`);
  if (!planned) throw new Error(`turbo planned no ${packageName}#${task}`);
  return planned;
}

/** The files turbo hashes for a package's task, relative to the repository root. */
function hashedFiles(packageName: string, task: string): string[] {
  const planned = plan(packageName, task);
  const directory = planned.directory.replaceAll('\\', '/');
  return Object.keys(planned.inputs).map((input) => posix.join(directory, input));
}

/** Every file under a folder of the repository, dot-files included. */
function filesUnder(folder: string): string[] {
  return readdirSync(join(root, folder), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => toRoot(join(entry.parentPath, entry.name)));
}

/**
 * The product modules lint/test-data-rule.test.ts reads: the source files of every folder under apps/* and
 * packages/* that the dependency rules' PRODUCT pattern matches, as that test's walk finds them.
 */
function productModules(): string[] {
  const config = createRequire(import.meta.url)(join(root, 'packages/config/dependency-cruiser.cjs')) as {
    forbidden: { name: string; from: { path: string } }[];
  };
  const product = new RegExp(
    config.forbidden.find(({ name }) => name === 'no-test-data-in-product')?.from.path ?? '$^',
  );
  const children = (dir: string) =>
    readdirSync(join(root, dir), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${dir}/${entry.name}`);
  return [...children('apps').flatMap(children), ...children('packages').flatMap(children)]
    .filter((dir) => product.test(`${dir}/`))
    .flatMap(filesUnder)
    .filter(
      (file) =>
        /\.(tsx?|mts|cts|jsx?|mjs|cjs)$/.test(file) &&
        !/(^|\/)(node_modules|dist|server-dist|out|coverage|storybook-static)(\/|$)/.test(file),
    );
}

/** The message files of the features and lib modules, which the merge and content validation read. */
const messageSources = () =>
  [...filesUnder('packages/app/src/features'), ...filesUnder('packages/app/src/lib')].filter((path) =>
    /^packages\/app\/src\/(features|lib)\/[^/]+\/messages\/[^/]+\.json$/.test(path),
  );

describe('turbo inputs', () => {
  it('hash every file outside tools that the tools tests read', () => {
    const read = [
      ...messageSources(), // messages/merge.test.ts: the merged files are not stale
      ...filesUnder('packages/app/src/messages'),
      'apps/web/lighthouserc.json', // lighthouse/vercel.test.ts
      '.github/workflows/lighthouse-vercel.yml', // lighthouse/vercel.test.ts: the resolve step's allow-list
      '.github/workflows/ci.yml', // lighthouse/workflows.test.ts: the two lighthouse jobs' steps
      '.github/workflows/lighthouse-branch.yml',
      ...filesUnder('apps/web/public'), // icons/icons.test.ts, security-txt/check.test.ts
      'apps/web/lib/pwa/brand-colors.json', // icons/generate.ts
      ...filesUnder('packages/app/src/lib/brand'),
      '.env.example', // scan/secrets.test.ts
      'packages/content/turbo.json', // turbo/inputs.test.ts: the content validation case's dry run reads it
      ...filesUnder('apps/web/messages'), // turbo/inputs.test.ts: the content validation case lists them
      ...productModules(), // lint/test-data-rule.test.ts: no product module imports test tooling unnamed
    ];
    expect(read).toContain('packages/app/src/features/today/messages/en.json');
    expect(read).toContain('apps/web/src/main.tsx');
    expect(read).toContain('packages/core/src/index.ts');
    expect(read).toContain('apps/web/public/.well-known/security.txt');
    expect(hashedFiles('@proofofcalm/tools', 'test')).toEqual(expect.arrayContaining(read));
  }, 60_000);

  it('hash every UI message file that content validation reads', () => {
    const read = [...messageSources(), ...filesUnder('apps/web/messages')];
    expect(read).toContain('packages/app/src/lib/errors/messages/en.json');
    expect(read).toContain('apps/web/messages/en.json');
    expect(hashedFiles('@proofofcalm/content', 'validate')).toEqual(expect.arrayContaining(read));
  }, 60_000);

  // A cache hit restores the outputs only: without the report among them, tools/size/today.ts would
  // measure the last real build's chunks against a dist from the cache.
  it("cache the web build's chunk report with its dist", () => {
    const { outputs } = plan('@proofofcalm/web', 'build');
    expect(outputs).toContain('dist/**');
    expect(outputs).toContain('node_modules/.cache/chunk-report.json');
  }, 60_000);
});
