// The API bundle (ADR-0045 §2): server/api.ts and everything it imports, in one file for node 24
// that api/index.mjs re-exports. apps/web's `vercel-build` script, so the bundle exists before Vercel
// builds the function, and the last step of scripts/build.ts. Deterministic: the same inputs give the
// same bytes. Plain node runs this file.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

export async function bundleApi(root: string): Promise<void> {
  await build({
    absWorkingDir: root,
    entryPoints: ['server/api.ts'],
    outfile: 'server-dist/api.mjs',
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    // `server-only` resolves to its empty module under this condition, as in a React server build.
    conditions: ['react-server'],
    legalComments: 'none',
    logLevel: 'warning',
  });
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) await bundleApi(resolve(import.meta.dirname, '..'));
