import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';
import type { Rolldown } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { type ChunkReport, chunkReport, isAppModule } from './chunk-report-plugin.ts';

const brotli = (code: string, quality: number) =>
  brotliCompressSync(code, { params: { [constants.BROTLI_PARAM_QUALITY]: quality } }).length;

const module = (renderedLength: number) => ({ renderedLength }) as unknown as Rolldown.RenderedModule;
const chunk = (fields: Partial<Rolldown.OutputChunk>) =>
  ({
    type: 'chunk',
    imports: [],
    dynamicImports: [],
    facadeModuleId: null,
    isEntry: false,
    ...fields,
  }) as Rolldown.OutputChunk;

const CODE = 'export const today = () => "calm";'.repeat(20);
const bundle: Rolldown.OutputBundle = {
  'assets/app-Ab12.js': chunk({
    fileName: 'assets/app-Ab12.js',
    isEntry: true,
    facadeModuleId: '/repo/apps/web/app.html',
    imports: ['assets/react-Cd34.js'],
    dynamicImports: ['assets/log-Ef56.js'],
    code: CODE,
    modules: {
      '/repo/packages/app/src/features/today/today-screen.tsx': module(120),
      '/repo/node_modules/.pnpm/react@19.2.0/node_modules/react/index.js': module(120),
    },
  }),
  'assets/react-Cd34.js': chunk({
    fileName: 'assets/react-Cd34.js',
    code: 'react',
    modules: { 'C:\\repo\\node_modules\\react-dom\\client.js': module(40) },
  }),
  'assets/app-Ab12.css': {
    type: 'asset',
    fileName: 'assets/app-Ab12.css',
    source: '',
  } as unknown as Rolldown.OutputAsset,
};

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

/** Runs the plugin's generateBundle over `bundle` and returns the report it wrote. */
function report(quality?: number): ChunkReport {
  dir = mkdtempSync(join(tmpdir(), 'chunk-report-'));
  const file = join(dir, '.cache', 'chunk-report.json');
  const plugin = chunkReport(quality === undefined ? { file } : { file, quality });
  const hook = plugin.generateBundle as {
    order: string;
    handler: (this: unknown, options: unknown, bundle: Rolldown.OutputBundle) => void;
  };
  expect(hook.order).toBe('post');
  hook.handler.call({}, {}, bundle);
  return JSON.parse(readFileSync(file, 'utf8')) as ChunkReport;
}

describe('chunkReport', () => {
  it('gives appShare 0.5 for one app and one vendor module of equal length', () => {
    const entry = report().chunks.find((item) => item.fileName === 'assets/app-Ab12.js');
    expect(entry?.appShare).toBe(0.5);
  });

  it('lists every chunk, no asset, with its links and its brotli size at Vercel quality 3 (ADR-0024)', () => {
    expect(report().chunks).toEqual([
      {
        fileName: 'assets/app-Ab12.js',
        isEntry: true,
        facade: '/repo/apps/web/app.html',
        imports: ['assets/react-Cd34.js'],
        dynamicImports: ['assets/log-Ef56.js'],
        brotli: brotli(CODE, 3),
        appShare: 0.5,
      },
      {
        fileName: 'assets/react-Cd34.js',
        isEntry: false,
        facade: null,
        imports: [],
        dynamicImports: [],
        brotli: brotli('react', 3),
        appShare: 0,
      },
    ]);
  });

  it('takes another quality when one is passed', () => {
    expect(report(11).chunks[0]?.brotli).toBe(brotli(CODE, 11));
  });

  it('runs in the client build only, after the chunks are final', () => {
    const plugin = chunkReport({ file: 'x.json' });
    expect(plugin.name).toBe('poc:chunk-report');
    const apply = plugin.apply as (config: unknown, env: { command: string; isSsrBuild?: boolean }) => boolean;
    expect(apply({}, { command: 'build' })).toBe(true);
    expect(apply({}, { command: 'build', isSsrBuild: true })).toBe(false);
    expect(apply({}, { command: 'serve' })).toBe(false);
  });
});

describe('isAppModule', () => {
  it.each([
    ['/repo/packages/core/src/money/split.ts', true],
    ['C:\\repo\\packages\\ui\\src\\button.tsx', true],
    ['/repo/node_modules/.pnpm/zod@4.0.0/node_modules/zod/mini.js', false],
    ['C:\\repo\\node_modules\\react\\index.js', false],
    ['\0rolldown/runtime.js', false],
    ['\0vite/preload-helper.js', false],
  ])('%s is application code: %s', (id, expected) => {
    expect(isAppModule(id)).toBe(expected);
  });
});
