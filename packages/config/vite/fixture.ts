import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { build, type PluginOption, type Rolldown, type UserConfig } from 'vite';

/** The files of a fixture project, by path relative to its root. */
export type FixtureFiles = Readonly<Record<string, string>>;

/**
 * The `server-only` package as the hosts install it: a default entry that throws at run time, so a
 * client build that resolves it succeeds and ships the throw. A fixture that holds it proves that the
 * guard, not an unresolvable import, fails the build.
 */
export const SERVER_ONLY_PACKAGE: FixtureFiles = {
  'node_modules/server-only/package.json': JSON.stringify({
    name: 'server-only',
    version: '0.0.1',
    main: 'index.js',
    exports: { '.': { 'react-server': './empty.js', default: './index.js' } },
  }),
  'node_modules/server-only/index.js':
    'throw new Error("This module cannot be imported from a Client Component module.");\n',
  'node_modules/server-only/empty.js': '',
};

/** What a fixture build may set beside its files and plugins. */
export type FixtureBuildOptions = {
  /** The document, relative to Vite's root; `index.html` by default. */
  input?: string;
  /** Imports left unresolved and kept as imports in the output, such as `react/jsx-runtime`. */
  external?: readonly string[];
  /** Vite's root, relative to the fixture root, when it is a host folder inside the fixture. */
  root?: string;
  /** The `resolve` block of a real configuration, to build under its resolution. */
  resolve?: UserConfig['resolve'];
};

/**
 * Builds a fixture project with Vite under a fresh temporary directory and returns every chunk and
 * asset of the bundle. For the tests of the plugins: a real client build, nothing written to disk, the
 * directory removed afterwards. Rejects with the build's error when a plugin refuses the build.
 */
export async function buildFixtureBundle(
  files: FixtureFiles,
  plugins: PluginOption[],
  { input = 'index.html', external = [], root = '.', resolve = {} }: FixtureBuildOptions = {},
): Promise<Rolldown.RolldownOutput['output']> {
  const dir = await mkdtemp(join(tmpdir(), 'poc-vite-'));
  try {
    for (const [name, text] of Object.entries(files)) {
      await mkdir(dirname(join(dir, name)), { recursive: true });
      await writeFile(join(dir, name), text, 'utf8');
    }
    const result = await build({
      configFile: false,
      envFile: false,
      root: join(dir, root),
      logLevel: 'silent',
      plugins,
      resolve,
      build: {
        write: false,
        minify: false,
        rolldownOptions: { input: join(dir, root, input), external: [...external] },
      },
    });
    const bundle = Array.isArray(result) ? result[0] : result;
    if (bundle === undefined || !('output' in bundle)) throw new Error('the build produced no bundle');
    return bundle.output;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** The built document of a fixture project (`buildFixtureBundle`), for the tests of the html plugins. */
export async function buildFixture(
  files: FixtureFiles,
  plugins: PluginOption[],
  input = 'index.html',
): Promise<string> {
  const output = await buildFixtureBundle(files, plugins, { input });
  const document = output.find((item) => item.type === 'asset' && item.fileName === input);
  if (document === undefined || document.type !== 'asset') throw new Error(`${input} is not in the bundle`);
  return typeof document.source === 'string' ? document.source : new TextDecoder().decode(document.source);
}
