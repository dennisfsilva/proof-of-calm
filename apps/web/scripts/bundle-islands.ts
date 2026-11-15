// The site pages' islands (ADR-0045 Deviations of 2026-11-15; docs/research/holding-date-tool.md, decision 5), run by
// build.ts between the client build and the prerender: esbuild bundles each module of src/site/islands/ on its own,
// as bundle-worker.ts bundles the worker, so it never joins the client build's chunks (a second Vite input would
// import Today's). ESM, minified, the client build's target, a hashed name under dist/assets/islands/, which the
// worker does not precache. The metafile lists every input, so a test can hold what an island carries.
import { basename, join } from 'node:path';
import { build, type Metafile } from 'esbuild';

/** Each island by its name, the source it is built from. */
const ISLANDS = { 'holding-date': 'src/site/islands/holding-date.ts' } as const;

type Island = keyof typeof ISLANDS;

/** What the prerender reads: each island's URL, and the inputs and outputs esbuild reports. */
export type IslandsResult = { entries: Readonly<Record<Island, string>>; metafile: Metafile };

/** Vite 8's default build target ('baseline-widely-available'), which the client build keeps. */
const TARGET = ['chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4'];

export async function bundleIslands(root: string, outDir = join(root, 'dist')): Promise<IslandsResult> {
  const { metafile } = await build({
    absWorkingDir: root,
    entryPoints: Object.entries(ISLANDS).map(([out, source]) => ({ in: source, out })),
    outdir: join(outDir, 'assets', 'islands'),
    entryNames: '[name]-[hash]',
    bundle: true,
    format: 'esm',
    minify: true,
    target: TARGET,
    define: { 'process.env.NODE_ENV': '"production"' },
    legalComments: 'none',
    logLevel: 'warning',
    metafile: true,
  });
  const entries: Partial<Record<Island, string>> = {};
  for (const [file, output] of Object.entries(metafile.outputs)) {
    const name = (Object.keys(ISLANDS) as Island[]).find((island) => ISLANDS[island] === output.entryPoint);
    if (name !== undefined) entries[name] = `/assets/islands/${basename(file)}`;
  }
  const built = entries['holding-date'];
  if (built === undefined) throw new Error('esbuild wrote no holding-date island');
  return { entries: { 'holding-date': built }, metafile };
}
