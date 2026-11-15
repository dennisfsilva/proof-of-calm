import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bundleIslands, type IslandsResult } from './bundle-islands';

const root = resolve(import.meta.dirname, '..');
const out = mkdtempSync(join(tmpdir(), 'poc-islands-'));
let result: IslandsResult;
let inputs: string[];

beforeAll(async () => {
  result = await bundleIslands(root, out);
  inputs = Object.keys(result.metafile.inputs).map((path) => path.replaceAll('\\', '/'));
}, 20_000);

afterAll(() => rmSync(out, { recursive: true, force: true }));

// The holding-date tool's island (ADR-0045 Deviations of 2026-11-15; docs/research/holding-date-tool.md): its own
// esbuild bundle, so it never joins Today's chunk, and it carries the tool's pure half alone.
describe('bundleIslands', () => {
  it('writes the holding-date island under /assets/islands/ with a hashed name', () => {
    expect(result.entries['holding-date']).toMatch(/^\/assets\/islands\/holding-date-[A-Z0-9]{8}\.js$/);
    const file = join(out, ...result.entries['holding-date'].split('/'));
    expect(readFileSync(file, 'utf8').length).toBeGreaterThan(0);
  });

  it('bundles no React, no feature but the pure module and no clock adapter', () => {
    expect(inputs.some((path) => path.endsWith('src/site/islands/holding-date.ts'))).toBe(true);
    expect(inputs.filter((path) => /\/(react|react-dom|use-intl)\//.test(path))).toEqual([]);
    expect(inputs.filter((path) => path.includes('/features/'))).toEqual([
      expect.stringMatching(/packages\/app\/src\/features\/learn\/site\/holding-tool\.ts$/),
    ]);
    // lib/format's index imports the clock adapter for the time formatters; tree-shaking leaves none of it.
    const output = Object.values(result.metafile.outputs).find((each) => each.entryPoint !== undefined);
    const carried = Object.entries(output?.inputs ?? {})
      .filter(([, input]) => input.bytesInOutput > 0)
      .map(([path]) => path.replaceAll('\\', '/'));
    expect(carried.filter((path) => path.includes('adapters/clock'))).toEqual([]);
    const file = join(out, ...result.entries['holding-date'].split('/'));
    expect(readFileSync(file, 'utf8')).not.toContain('Date.now');
  });

  it('reads no clock, no storage and no network in the island itself', () => {
    const source = readFileSync(join(root, 'src/site/islands/holding-date.ts'), 'utf8');
    for (const banned of ['Date.now', 'new Date(', 'localStorage', 'sessionStorage', 'indexedDB', 'fetch(']) {
      expect(source, banned).not.toContain(banned);
    }
  });
});
