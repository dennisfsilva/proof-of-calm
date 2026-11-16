import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The wiring of the fixture API (apps/web/lighthouse/api.ts): the server Lighthouse CI starts loads the
// bundle that `lighthouse:api` writes, and `lighthouse` writes it before LHCI runs.
const read = (file: string): unknown => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
const rc = read('../lighthouserc.json') as { ci: { collect: { startServerCommand: string } } };
const { scripts } = read('../package.json') as { scripts: Record<string, string> };

const option = (command: string, name: string) => command.match(new RegExp(`--${name}[= ](\\S+)`))?.[1];

describe('the Lighthouse wiring (apps/web/lighthouserc.json, apps/web/package.json)', () => {
  it('starts the local server on the bundle lighthouse:api writes', () => {
    const outfile = option(scripts['lighthouse:api'] ?? '', 'outfile');
    expect(outfile).toBeDefined();
    expect(option(rc.ci.collect.startServerCommand, 'api')).toBe(outfile);
  });

  it('bundles lighthouse/api.ts in lighthouse:api', () => {
    expect(scripts['lighthouse:api']).toMatch(/^esbuild lighthouse\/api\.ts /);
  });

  it('runs lighthouse:api before lhci autorun', () => {
    const steps = (scripts.lighthouse ?? '').split('&&').map((step) => step.trim());
    const api = steps.indexOf('pnpm run lighthouse:api');
    const lhci = steps.findIndex((step) => step.startsWith('lhci autorun'));
    expect(api).toBeGreaterThanOrEqual(0);
    expect(lhci).toBeGreaterThan(api);
  });
});
