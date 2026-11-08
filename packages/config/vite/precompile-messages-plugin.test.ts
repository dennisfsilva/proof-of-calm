import compile from 'icu-minify/compile';
import type { ConfigEnv, UserConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import {
  compileMessages,
  FORMAT_ONLY_ALIAS,
  MESSAGES_FILE,
  messagesModule,
  precompileMessagesPlugin,
} from './precompile-messages-plugin.ts';

const catalogue = {
  today: { title: 'Hello {name}!', count: '{n, plural, one {# purchase} other {# purchases}}' },
  shell: { back: 'Back' },
};

describe('compileMessages', () => {
  it('compiles every string of a message file, nested namespaces included, with icu-minify', () => {
    expect(compileMessages(JSON.stringify(catalogue))).toEqual({
      today: { title: compile('Hello {name}!'), count: compile(catalogue.today.count) },
      shell: { back: compile('Back') },
    });
    expect(compile('Hello {name}!')).toEqual(['Hello ', ['name'], '!']);
  });

  it('refuses a value that is neither a string nor an object', () => {
    expect(() => compileMessages('{"today":{"n":1}}')).toThrow(/today\.n/);
  });
});

describe('messagesModule', () => {
  it('is a JavaScript module whose default export is the compiled tree', () => {
    const code = messagesModule(JSON.stringify(catalogue));
    expect(code.startsWith('export default ')).toBe(true);
    const literal = /^export default JSON\.parse\((".*")\);\n$/s.exec(code);
    expect(literal).not.toBeNull();
    expect(JSON.parse(JSON.parse(literal?.[1] ?? '""'))).toEqual(compileMessages(JSON.stringify(catalogue)));
  });
});

describe('precompileMessagesPlugin', () => {
  const plugin = precompileMessagesPlugin();

  it('transforms message files only, before the json plugin', () => {
    expect(plugin.enforce).toBe('pre');
    const transform = plugin.transform as { filter: { id: RegExp } };
    expect(transform.filter.id).toBe(MESSAGES_FILE);
    for (const id of [
      'P:/dev/packages/app/src/messages/en/today.json',
      '/repo/packages/app/src/messages/en.json',
      '/repo/packages/app/src/features/today/messages/en.json',
    ]) {
      expect(MESSAGES_FILE.test(id)).toBe(true);
    }
    for (const id of [
      '/repo/packages/content/facts/en.json',
      '/repo/packages/app/src/messages/en.ts',
      '/repo/messages.json',
    ]) {
      expect(MESSAGES_FILE.test(id)).toBe(false);
    }
  });

  it('compiles the file into a module', () => {
    const transform = plugin.transform as {
      handler: (this: unknown, code: string, id: string) => { code: string; moduleType: string; map: null } | null;
    };
    const result = transform.handler.call(
      undefined,
      JSON.stringify(catalogue),
      '/repo/packages/app/src/messages/en.json',
    );
    expect(result).toEqual({ code: messagesModule(JSON.stringify(catalogue)), moduleType: 'js', map: null });
  });

  it('aliases use-intl/format-message to the format-only entry', () => {
    const config = (plugin.config as (config: UserConfig, env: ConfigEnv) => UserConfig)(
      {},
      { command: 'build', mode: 'production' },
    );
    expect(config.resolve?.alias).toEqual([FORMAT_ONLY_ALIAS]);
    expect(FORMAT_ONLY_ALIAS.find.test('use-intl/format-message')).toBe(true);
    expect(FORMAT_ONLY_ALIAS.find.test('use-intl/format-message/format-only')).toBe(false);
    expect(FORMAT_ONLY_ALIAS.replacement).toBe('use-intl/format-message/format-only');
  });
});
