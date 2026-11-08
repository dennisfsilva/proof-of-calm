// The web host's build, Vercel's `buildCommand` (ADR-0045 §1), in order: the client build (`vite build`,
// input app.html), the prerender (a second Vite build of src/site/render.tsx for the server, then one
// HTML file per site page, §6), the manifest, the worker (§5) and the API bundle (§2). Plain node runs
// this file, so it imports only modules node can load as they are.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { THEME_BEFORE_PAINT } from '@proofofcalm/app/lib/theme';
import { BOOT_SCRIPT } from '@proofofcalm/config/vite';
import { build } from 'vite';
import { bundleApi } from './bundle-api.ts';
import { bundleWorker } from './bundle-worker.ts';

type Site = typeof import('../src/site/render.tsx');

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const configFile = join(root, 'vite.config.ts');
const SSR_ENTRY = 'src/site/render.tsx';
const SSR_OUT = 'server-dist/site';

const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
const inlineScripts = (html: string) =>
  [...html.matchAll(SCRIPT)].filter((match) => !/\bsrc=/.test(match[1] ?? '')).map((match) => (match[2] ?? '').trim());

async function step<T>(name: string, run: () => Promise<T>): Promise<T> {
  const started = Date.now();
  const result = await run();
  process.stdout.write(`${name}: ${Date.now() - started} ms\n`);
  return result;
}

/** The built document holds the theme script and the boot script and no other inline script (§3). */
function checkDocument(html: string): void {
  const allowed = new Set([THEME_BEFORE_PAINT, BOOT_SCRIPT]);
  const inline = inlineScripts(html);
  for (const text of inline) {
    if (!allowed.has(text))
      throw new Error(`app.html holds an inline script the CSP does not hash: ${text.slice(0, 80)}`);
  }
  if (inline.length !== 2)
    throw new Error(`app.html holds ${inline.length} inline scripts, not the theme and boot scripts`);
}

/**
 * A site page holds no script element (§6), except the offline page, which carries the theme script
 * alone (the deviation of 2026-10-19): the CSP hashes nothing else.
 */
function checkSitePage(name: string, html: string): void {
  const expected = name === '~offline' ? [THEME_BEFORE_PAINT] : [];
  const scripts = [...html.matchAll(SCRIPT)].map((match) =>
    /\bsrc=/.test(match[1] ?? '') ? null : (match[2] ?? '').trim(),
  );
  if (scripts.length !== expected.length || scripts.some((text, index) => text !== expected[index]))
    throw new Error(`${name}.html holds a script element the site pages do not carry`);
}

await step('client', async () => {
  await build({ root, configFile, logLevel: 'warn' });
  checkDocument(readFileSync(join(dist, 'app.html'), 'utf8'));
});

const site = await step('prerender', async () => {
  // use-intl is bundled here so the precompiled message files meet the parser-free formatter, as in
  // the client build (§8); the external copy would import the default formatter instead.
  await build({
    root,
    configFile,
    logLevel: 'warn',
    build: {
      ssr: SSR_ENTRY,
      outDir: SSR_OUT,
      emptyOutDir: true,
      copyPublicDir: false,
      rolldownOptions: { input: resolve(root, SSR_ENTRY) },
    },
    ssr: { noExternal: ['use-intl'] },
  });
  const rendered: Site = await import(pathToFileURL(join(root, SSR_OUT, 'render.js')).href);
  const assets = rendered.headAssets(readFileSync(join(dist, 'app.html'), 'utf8'));
  for (const name of rendered.SITE_PAGES) {
    const html = rendered.renderSitePage(name, assets);
    checkSitePage(name, html);
    writeFileSync(join(dist, `${name}.html`), html);
  }
  return rendered;
});

await step('manifest', async () => {
  writeFileSync(join(dist, 'manifest.webmanifest'), site.manifestJson());
});

await step('worker', async () => {
  const { count, size, warnings } = await bundleWorker(root);
  for (const warning of warnings) process.stderr.write(`worker: ${warning}\n`);
  process.stdout.write(`worker: ${count} entries, ${size} bytes; `);
});

await step('api', () => bundleApi(root));
