import { relative } from 'node:path';
import type { Plugin } from 'vite';

// What a client bundle must never resolve (ADR-0045 §11, the first of the three guards): the
// build-time guard package, the two server SDKs, and the hosts' server folders. Next made such an
// import a build error; under Vite `server-only`'s default entry would bundle and throw at run time.
const SERVER_MODULES: readonly RegExp[] = [
  /^server-only$/,
  /^@upstash\/redis(\/|$)/,
  /^@vercel\/functions(\/|$)/,
  /\/lib\/server\//,
  /\/server\//,
];

/** Whether an import specifier, as written or as an absolute id, names a server module. */
export function isServerModule(id: string): boolean {
  return SERVER_MODULES.some((pattern) => pattern.test(id));
}

/**
 * Fails the client build in `resolveId` when a server module is resolved, naming the importer chain
 * (`Client build resolved <id>, imported by <importer> <- <its importer> ...`). Active in the client
 * environment only: the server bundle is the one build that resolves `server-only`.
 *
 * `enforce: 'pre'` places the plugin before Vite's core plugins, so its `resolveId` sees every
 * specifier before `vite:resolve` answers; as a normal plugin it would run after core resolution and
 * fire only for an import that is unresolvable anyway (an installed `server-only` would bundle).
 */
export function clientNeverImportsServer(): Plugin {
  let root = '';
  return {
    name: 'poc:client-never-imports-server',
    enforce: 'pre',
    applyToEnvironment: (environment) => environment.name === 'client',
    configResolved(config) {
      root = config.root;
    },
    resolveId(id, importer) {
      if (!isServerModule(id)) return null;
      const chain: string[] = [];
      const seen = new Set<string>();
      let current = importer;
      while (current !== undefined && !seen.has(current)) {
        seen.add(current);
        chain.push(relative(root, current) || current);
        current = this.getModuleInfo(current)?.importers[0];
      }
      throw new Error(
        `Client build resolved ${id}, imported by ${chain.length > 0 ? chain.join(' <- ') : 'the entry'}`,
      );
    },
  };
}
