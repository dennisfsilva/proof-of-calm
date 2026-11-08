import type { IndexHtmlTransformContext, IndexHtmlTransformHook, Rolldown } from 'vite';
import { describe, expect, it } from 'vitest';
import { fontPreloadPlugin } from './font-preload-plugin.ts';

const asset = (fileName: string, original: string) =>
  ({ type: 'asset', fileName, originalFileNames: [original], source: '' }) as unknown as Rolldown.OutputAsset;
const chunk = { type: 'chunk', fileName: 'assets/index-Ef56.js' } as unknown as Rolldown.OutputChunk;

const handlerOf = (file: string) => {
  const plugin = fontPreloadPlugin({ file });
  const hook = plugin.transformIndexHtml as { order?: string; handler: IndexHtmlTransformHook };
  return { hook, run: (bundle: Rolldown.OutputBundle) => hook.handler.call({} as never, '<html></html>', ctx(bundle)) };
};
const ctx = (bundle: Rolldown.OutputBundle): IndexHtmlTransformContext => ({
  path: '/app.html',
  filename: 'app.html',
  bundle,
});

describe('fontPreloadPlugin', () => {
  it('adds the preload of the hashed text font, its name read from the bundle', () => {
    const bundle: Rolldown.OutputBundle = {
      'assets/calm-sans-latin-Ab12.woff2': asset(
        'assets/calm-sans-latin-Ab12.woff2',
        'src/fonts/calm-sans-latin.woff2',
      ),
      'assets/calm-mono-latin-Cd34.woff2': asset(
        'assets/calm-mono-latin-Cd34.woff2',
        'src/fonts/calm-mono-latin.woff2',
      ),
      'assets/index-Ef56.js': chunk,
    };
    expect(handlerOf('calm-sans-latin').run(bundle)).toEqual([
      {
        tag: 'link',
        attrs: {
          rel: 'preload',
          as: 'font',
          type: 'font/woff2',
          crossorigin: true,
          href: '/assets/calm-sans-latin-Ab12.woff2',
        },
        injectTo: 'head-prepend',
      },
    ]);
  });

  it('runs after the other html hooks, in the client build only', () => {
    const { hook } = handlerOf('calm-sans-latin');
    expect(hook.order).toBe('post');
    expect(fontPreloadPlugin({ file: 'calm-sans-latin' }).apply).toBeTypeOf('function');
  });

  it('matches the whole file name, not a suffix of another font', () => {
    const bundle: Rolldown.OutputBundle = {
      'assets/other-calm-sans-latin-Ab12.woff2': asset(
        'assets/other-calm-sans-latin-Ab12.woff2',
        'other-calm-sans-latin.woff2',
      ),
    };
    expect(() => handlerOf('calm-sans-latin').run(bundle)).toThrow(/calm-sans-latin\.woff2 is not in the bundle/);
  });

  it('throws when the font is not in the bundle, so a missing preload fails the build', () => {
    expect(() => handlerOf('calm-sans-latin').run({ 'assets/index-Ef56.js': chunk })).toThrow(/not in the bundle/);
  });
});
