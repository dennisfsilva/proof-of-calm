// The worker build (ADR-0045 §5), run by build.ts after the pages exist so the precache lists finished
// files: esbuild bundles src/sw.ts (IIFE, minified, the routes defined in), then injectManifest from
// @serwist/build writes the precache manifest into dist/sw.js. Revisions come from the files' content.
import { join } from 'node:path';
import { APP_ROUTES } from '@proofofcalm/app/lib/navigation/routes';
import { injectManifest } from '@serwist/build';
import { build } from 'esbuild';

/** The shell and the offline page are precached under the URLs the pages answer at, not their file names. */
const PAGE_URLS: Record<string, string> = { 'app.html': '/app', '~offline.html': '/~offline' };

export type WorkerResult = { count: number; size: number; warnings: string[] };

export async function bundleWorker(root: string): Promise<WorkerResult> {
  // The bundle without its manifest; injectManifest refuses one file as source and destination.
  const bundled = join(root, 'server-dist', 'sw.js');
  await build({
    absWorkingDir: root,
    entryPoints: ['src/sw.ts'],
    outfile: bundled,
    bundle: true,
    format: 'iife',
    minify: true,
    target: 'es2022',
    define: { __APP_ROUTES__: JSON.stringify(APP_ROUTES), 'process.env.NODE_ENV': '"production"' },
    legalComments: 'none',
    logLevel: 'warning',
  });
  const { count, size, warnings } = await injectManifest({
    swSrc: bundled,
    swDest: join(root, 'dist', 'sw.js'),
    globDirectory: join(root, 'dist'),
    globPatterns: ['app.html', '~offline.html', 'assets/**/*.{js,css,woff2}', 'icons/*.png', 'manifest.webmanifest'],
    dontCacheBustURLsMatching: /^assets\//,
    manifestTransforms: [
      (entries) => ({
        manifest: entries.map((entry) => ({ ...entry, url: PAGE_URLS[entry.url] ?? entry.url })),
      }),
    ],
  });
  return { count, size, warnings };
}
