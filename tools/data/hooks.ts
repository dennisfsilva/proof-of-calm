// Loaded with `node --import ./tools/data/hooks.ts tools/data/<entry>.ts` (README.md, Running): packages/core
// and packages/data import their own files without an extension (`./constants`), which only a bundler
// resolves. For an importer under the repository's packages/ or tools/data/, an extensionless relative
// specifier resolves to `<specifier>.ts`, or a directory's `index.ts`, when that file exists inside the
// same folders; every other specifier, and every miss, goes to Node's default resolver unchanged.
// registerHooks is synchronous and in-thread (Stability 1.2, release candidate since Node 24.13.1);
// register, its threaded predecessor, is deprecated since 24.15.0.
import { statSync } from 'node:fs';
import { registerHooks } from 'node:module';

// Windows paths ignore case, and a drive letter can come either way.
const fold = (url: string) => (process.platform === 'win32' ? url.toLowerCase() : url);
const roots = ['../../packages/', './'].map((dir) => fold(new URL(dir, import.meta.url).href));
const inside = (url: string) => roots.some((root) => fold(url).startsWith(root));
const isFile = (url: URL) => statSync(url, { throwIfNoEntry: false })?.isFile() === true;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const parent = context.parentURL;
    if (/^\.\.?\//.test(specifier) && parent !== undefined && inside(parent)) {
      for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
        const url = new URL(candidate, parent);
        if (inside(url.href) && isFile(url)) return nextResolve(url.href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});
