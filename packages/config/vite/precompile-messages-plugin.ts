import compile from 'icu-minify/compile';
import type { Alias, Plugin } from 'vite';

type Compiled = ReturnType<typeof compile>;
export type CompiledMessages = { [key: string]: Compiled | CompiledMessages };

/** A message file: anything under a `messages` folder that ends in `.json` (the merged and the per-namespace files). */
export const MESSAGES_FILE = /[\\/]messages[\\/].*\.json$/;

/**
 * use-intl's formatter without the ICU parser, for messages compiled at build time (ADR-0045 §8).
 * The exact match keeps the format-only entry itself out of the alias.
 */
export const FORMAT_ONLY_ALIAS = {
  find: /^use-intl\/format-message$/,
  replacement: 'use-intl/format-message/format-only',
} satisfies Alias;

/** The message file's tree with every string compiled by icu-minify; a value of any other kind fails the build. */
export function compileMessages(json: string): CompiledMessages {
  const walk = (node: unknown, path: string): Compiled | CompiledMessages => {
    if (typeof node === 'string') return compile(node);
    if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
      return Object.fromEntries(
        Object.entries(node).map(([key, value]) => [key, walk(value, path === '' ? key : `${path}.${key}`)]),
      );
    }
    throw new Error(`${path}: a message file holds strings and namespaces only, not ${JSON.stringify(node)}`);
  };
  const tree = walk(JSON.parse(json), '');
  if (typeof tree === 'string' || Array.isArray(tree)) throw new Error('a message file is an object of namespaces');
  return tree;
}

/** The module a message file becomes: its compiled tree as the default export, parsed from a string (faster than a literal). */
export function messagesModule(json: string): string {
  return `export default JSON.parse(${JSON.stringify(JSON.stringify(compileMessages(json)))});\n`;
}

/** Compiles every imported message file at build time and aliases the formatter to the parser-free entry. */
export function precompileMessagesPlugin(): Plugin {
  return {
    name: 'poc:precompile-messages',
    enforce: 'pre',
    config: () => ({ resolve: { alias: [FORMAT_ONLY_ALIAS] } }),
    transform: {
      filter: { id: MESSAGES_FILE },
      handler: (code) => ({ code: messagesModule(code), moduleType: 'js', map: null }),
    },
  };
}
