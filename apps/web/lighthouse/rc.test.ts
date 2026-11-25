import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The wiring of the fixture API (apps/web/lighthouse/api.ts): the server Lighthouse CI starts loads the
// bundle that `lighthouse:api` writes, and `lighthouse` writes it before LHCI runs.
const read = (file: string): unknown => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
const rc = read('../lighthouserc.json') as {
  ci: { collect: { startServerCommand: string; url: string[]; puppeteerLaunchOptions: { args: string[] } } };
};
const { scripts } = read('../package.json') as { scripts: Record<string, string> };

const option = (command: string, name: string) => command.match(new RegExp(`--${name}[= ](\\S+)`))?.[1];

describe('the Lighthouse wiring (apps/web/lighthouserc.json, apps/web/package.json)', () => {
  it('starts the local server on the bundle lighthouse:api writes', () => {
    const outfile = option(scripts['lighthouse:api'] ?? '', 'outfile');
    expect(outfile).toBeDefined();
    expect(option(rc.ci.collect.startServerCommand, 'api')).toBe(outfile);
  });

  // Vercel serves HTTP/2, and Lighthouse's simulation gives an h2 origin one multiplexed connection where
  // an http/1.1 one gets six and a round trip per wave of lazy chunks, so the local server speaks h2,
  // which browsers speak over https only (tools/serve/vercel-local.ts --tls).
  it('measures over https on the server started with --tls, its self-signed certificate accepted', () => {
    expect(rc.ci.collect.startServerCommand).toMatch(/^node \.\.\/\.\.\/tools\/serve\/vercel-local\.ts .*--tls\b/);
    expect(rc.ci.collect.url.length).toBeGreaterThan(0);
    for (const url of rc.ci.collect.url) expect(new URL(url).origin).toBe('https://localhost:3000');
    expect(rc.ci.collect.puppeteerLaunchOptions.args).toEqual(
      expect.arrayContaining(['--allow-insecure-localhost', '--ignore-certificate-errors']),
    );
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
