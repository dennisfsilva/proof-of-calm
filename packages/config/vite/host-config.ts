import { resolve } from 'node:path';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import type { PluginOption, Rolldown, UserConfig } from 'vite';
import { bootScriptPlugin } from './boot-plugin.ts';
import { chunkGroups, noChunkCycles } from './chunk-groups.ts';
import { chunkReport } from './chunk-report-plugin.ts';
import { clientNeverImportsServer } from './client-never-imports-server.ts';
import { fontPreloadPlugin } from './font-preload-plugin.ts';
import { learnPlugins, MODULE_BODY_ELEMENTS, type ParseModule } from './learn-plugin.ts';
import { precompileMessagesPlugin } from './precompile-messages-plugin.ts';

export type Host = 'web' | 'mobile';

export type HostConfigOptions = {
  host: Host;
  /** The host package's directory, where its document lives. */
  root: string;
  /** `parseModule` from `@proofofcalm/content/modules`, which the host imports (ADR-0048, Deviations). */
  parseModule: ParseModule;
};

/** The Learn modules (ADR-0048), from a host's directory. */
const LEARN_DIR = '../../packages/content/learn';

// What differs between the hosts (ADR-0045 §10): the document, the API origin the api-client calls
// (same origin on the web; the absolute origin the CORS allow-list admits from the wrapper) and
// whether the service-worker registration stays in the bundle; the web host also writes the chunk
// report that `tools/size/today.ts` reads (`docs/ENGINEERING.md` §4).
const HOSTS = {
  web: { input: 'app.html', apiBase: '', serviceWorker: 'on', chunkReport: true },
  mobile: { input: 'index.html', apiBase: 'https://proofofcalm.com', serviceWorker: 'off', chunkReport: false },
} as const satisfies Record<
  Host,
  { input: string; apiBase: string; serviceWorker: 'on' | 'off'; chunkReport: boolean }
>;

/** Where the web host's chunk report goes: out of `dist`, which Vercel serves, and out of git. */
const CHUNK_REPORT = 'node_modules/.cache/chunk-report.json';

/** A message file of a language other than English: `messages/<locale>/<namespace>.json`. */
const TRANSLATED_MESSAGES = /[\\/]messages[\\/]([A-Za-z]{2}(?:-[A-Za-z]{2})?)[\\/][^\\/]+\.json$/;

/** A content file of a language other than English (ADR-0057): `rules/<language>/` or `i18n/<language>/<kind>/`, a Learn module's `.mdx` too. */
const TRANSLATED_CONTENT =
  /[\\/]content[\\/](?:rules|i18n)[\\/]([A-Za-z]{2}(?:-[A-Za-z]{2})?)[\\/](?:[a-z]+[\\/])?[^\\/]+\.(?:json|mdx)$/;

/**
 * Vite's chunk name, but a chunk of another language's messages or content goes under
 * `assets/messages/<locale>/`, which the worker's precache leaves out (ADR-0045 §8, the entries of
 * 2026-11-15 and 2026-11-16): a hidden language's files would otherwise reach every install.
 */
function chunkFileNames(chunk: Rolldown.PreRenderedChunk): string {
  const id = chunk.facadeModuleId ?? '';
  const locale = (TRANSLATED_MESSAGES.exec(id) ?? TRANSLATED_CONTENT.exec(id))?.[1];
  return locale === undefined || locale === 'en'
    ? 'assets/[name]-[hash].js'
    : `assets/messages/${locale}/[name]-[hash].js`;
}

/**
 * The shared Vite configuration of both hosts (ADR-0045 §12): the Learn modules' MDX pipeline ahead of
 * React (ADR-0048; mdxjs.com's Vite section has the compiler in the `pre` phase and `.mdx` in React's
 * `include`), React with the compiler through Babel, Tailwind, the precompiled messages, the server
 * guard, the font preload, the web host's chunk report and, last, the boot script; no asset inlined as
 * `data:` (the CSP has no `data:` for fonts, §3). The host spreads it into its own `vite.config.ts`.
 */
export function createHostConfig({ host, root, parseModule }: HostConfigOptions): UserConfig {
  const { input, apiBase, serviceWorker, chunkReport: report } = HOSTS[host];
  const plugins: PluginOption[] = [
    // The past-performance sentence with its Risk link, the one element a module's body holds (ADR-0048 Deviations).
    ...learnPlugins({ dir: resolve(root, LEARN_DIR), parseModule, elements: MODULE_BODY_ELEMENTS }),
    react({ include: /\.(mdx|[tj]sx?)$/ }),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    precompileMessagesPlugin(),
    clientNeverImportsServer(),
    fontPreloadPlugin({ file: 'calm-sans-latin' }),
    noChunkCycles(),
    ...(report ? [chunkReport({ file: resolve(root, CHUNK_REPORT) })] : []),
    bootScriptPlugin(),
  ];
  return {
    root,
    plugins,
    // A compiled module imports react/jsx-runtime from packages/content, which may not depend on react.
    resolve: { dedupe: ['react'] },
    define: {
      'import.meta.env.VITE_API_BASE': JSON.stringify(apiBase),
      'import.meta.env.VITE_SERVICE_WORKER': JSON.stringify(serviceWorker),
    },
    build: {
      assetsInlineLimit: 0,
      // Today's static modules in its entry chunk, whatever lazy chunk shares them (`docs/ENGINEERING.md` §4).
      rolldownOptions: { input: resolve(root, input), output: { codeSplitting: chunkGroups(), chunkFileNames } },
    },
  };
}
