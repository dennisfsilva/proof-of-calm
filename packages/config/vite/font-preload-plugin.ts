import type { Plugin } from 'vite';

export type FontPreloadOptions = {
  /** The font file's name without `.woff2`, as it sits in `packages/ui/src/fonts`. */
  file: string;
};

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Adds `<link rel="preload" as="font" type="font/woff2" crossorigin href="/assets/<hashed>.woff2">`
 * for the text font, its hashed name read from the bundle (ADR-0045 §7). The build fails when the
 * font is not in the bundle: a silent missing preload would cost the first paint.
 */
export function fontPreloadPlugin({ file }: FontPreloadOptions): Plugin {
  const original = new RegExp(`(^|[\\\\/])${escapeRegExp(file)}\\.woff2$`);
  let base = '/';
  return {
    name: 'poc:font-preload',
    apply: (_config, { command, isSsrBuild }) => command === 'build' && isSsrBuild !== true,
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const asset = Object.values(ctx.bundle ?? {}).find(
          (item) => item.type === 'asset' && item.originalFileNames.some((name) => original.test(name)),
        );
        if (asset === undefined) {
          throw new Error(`${file}.woff2 is not in the bundle: nothing in the client build imports it`);
        }
        return [
          {
            tag: 'link',
            attrs: {
              rel: 'preload',
              as: 'font',
              type: 'font/woff2',
              crossorigin: true,
              href: `${base}${asset.fileName}`,
            },
            injectTo: 'head-prepend',
          },
        ];
      },
    },
  };
}
