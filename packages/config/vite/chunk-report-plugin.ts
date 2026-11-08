import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';
import type { Plugin } from 'vite';

export type ChunkReportOptions = {
  /** Where the report goes: outside `dist` (Vercel would serve it) and outside git. */
  file: string;
  /** The brotli quality; Vercel serves scripts at 3 (ADR-0024, the deviation of 2026-10-17). */
  quality?: number;
};

export type ChunkReport = {
  chunks: {
    fileName: string;
    isEntry: boolean;
    facade: string | null;
    imports: string[];
    dynamicImports: string[];
    /** The chunk's final code, brotli-compressed at `quality`, in bytes. */
    brotli: number;
    /** The share of the chunk's rendered code from application modules (`isAppModule`), by rendered length. */
    appShare: number;
  }[];
};

/**
 * A module the repository wrote: the workspace packages resolve to their own folders, not node_modules.
 * A virtual module (`\0`, as the bundler's runtime and Vite's preload helper) is the bundler's, not ours.
 */
export const isAppModule = (id: string): boolean => !id.startsWith('\0') && !/[\\/]node_modules[\\/]/.test(id);

/**
 * Writes the client build's chunks to `file` (ADR-0045 §8, §9): each chunk's links, its brotli size as
 * Vercel serves it and its share of application code, from Rolldown's `RenderedModule.renderedLength`.
 * `tools/size/today.ts` reads it to hold Today's application code to its budget (`docs/ENGINEERING.md` §4).
 */
export function chunkReport({ file, quality = 3 }: ChunkReportOptions): Plugin {
  return {
    name: 'poc:chunk-report',
    apply: (_config, { command, isSsrBuild }) => command === 'build' && isSsrBuild !== true,
    // Last, so Vite's own rewrites of the chunks (the preload lists) are in the code it measures.
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const chunks: ChunkReport['chunks'] = [];
        for (const item of Object.values(bundle)) {
          if (item.type !== 'chunk') continue;
          let app = 0;
          let all = 0;
          for (const [id, rendered] of Object.entries(item.modules)) {
            all += rendered.renderedLength;
            if (isAppModule(id)) app += rendered.renderedLength;
          }
          chunks.push({
            fileName: item.fileName,
            isEntry: item.isEntry,
            facade: item.facadeModuleId,
            imports: item.imports,
            dynamicImports: item.dynamicImports,
            brotli: brotliCompressSync(item.code, { params: { [constants.BROTLI_PARAM_QUALITY]: quality } }).length,
            appShare: all === 0 ? 0 : app / all,
          });
        }
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, `${JSON.stringify({ chunks } satisfies ChunkReport, null, 2)}\n`);
      },
    },
  };
}
