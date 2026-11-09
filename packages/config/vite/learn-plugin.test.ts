import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildFixtureBundle, type FixtureBuildOptions, type FixtureFiles } from './fixture.ts';
import { createHostConfig } from './host-config.ts';
import { checkModuleBody, learnPlugins, MODULE_BODY_ELEMENTS, type ParseModule } from './learn-plugin.ts';

// A stand-in for `@proofofcalm/content/modules`' parseModule, which this package cannot import (it would
// close a cycle in the package graph): flat `key: value` lines between two `---` lines, the rest the body.
const parseModule: ParseModule = (path, source) => {
  const lines = source.split('\n');
  const close = lines.indexOf('---', 1);
  if (lines[0] !== '---' || close === -1) {
    return { ok: false, error: [{ code: 'module-front-matter', detail: 'Open the file with front matter' }] };
  }
  const fields = Object.fromEntries(lines.slice(1, close).map((line) => line.split(': ') as [string, string]));
  const slug = fields.slug ?? path;
  return { ok: true, value: { ...fields, slug, body: lines.slice(close + 1).join('\n'), words: 7 } };
};

const BODY_PHRASE = 'A plan you set once';
const module = (slug: string, body: string) =>
  ['---', `slug: ${slug}`, `title: ${slug} title`, 'reviewedBy: owner', '---', body, ''].join('\n');

/** index.html, the entry that uses both exports, and two modules whose file order differs from the slug order. */
const FIXTURE: FixtureFiles = {
  'index.html': '<!doctype html><html><body><script type="module" src="/main.js"></script></body></html>',
  'main.js': [
    "import { LEARN_BODIES, LEARN_MODULES } from 'virtual:learn-modules';",
    'console.log(LEARN_MODULES);',
    'for (const load of Object.values(LEARN_BODIES)) load().then((m) => console.log(m.default));',
  ].join('\n'),
  'learn/noise.mdx': module('noise', `# Noise\n\n${BODY_PHRASE}, then nothing to watch.`),
  'learn/start-here.mdx': module('start-here', '# Start here\n\nOne idea per module.'),
};

type Output = Awaited<ReturnType<typeof buildFixtureBundle>>;
const chunks = (output: Output) => output.filter((item) => item.type === 'chunk');
const entryOf = (output: Output) => {
  const entry = chunks(output).find((chunk) => chunk.isEntry);
  if (entry === undefined) throw new Error('no entry chunk');
  return entry;
};

async function buildLearn(
  files: FixtureFiles,
  elements?: readonly string[],
  dir = 'learn',
  options: FixtureBuildOptions = { external: ['react/jsx-runtime'] },
) {
  // The plugin reads `dir` as an absolute path under the temporary root, which only the build knows:
  // a spy plugin ahead of it records the root, and `dir` is read from it when the plugin loads.
  let root = '';
  const plugins = learnPlugins({
    get dir() {
      return join(root, dir);
    },
    parseModule,
    ...(elements === undefined ? {} : { elements }),
  });
  const rootSpy = {
    name: 'poc:test-root',
    configResolved(config: { root: string }) {
      root = config.root;
    },
  };
  return buildFixtureBundle(files, [rootSpy, ...plugins], options);
}

// The repository's shape: react is installed under the host and resolves from nothing above
// packages/content, which may not depend on it (the dependency rule).
const REACT_STUB = 'react from the host';
const IN_THE_REPOSITORY: FixtureFiles = {
  'apps/web/index.html': FIXTURE['index.html'] ?? '',
  'apps/web/main.js': FIXTURE['main.js'] ?? '',
  'apps/web/node_modules/react/package.json': JSON.stringify({
    name: 'react',
    version: '0.0.0',
    exports: { './jsx-runtime': './jsx-runtime.js' },
  }),
  'apps/web/node_modules/react/jsx-runtime.js': [
    `export const jsx = () => '${REACT_STUB}';`,
    'export const jsxs = jsx;',
    'export const Fragment = jsx;',
  ].join('\n'),
  'packages/content/learn/start-here.mdx': module('start-here', '# Start here\n\nOne idea per module.'),
};

describe('learnPlugins', () => {
  it("a module in packages/content takes react from the host, under the host configuration's resolution", async () => {
    const { resolve } = createHostConfig({ host: 'web', root: '/repo/apps/web', parseModule });
    const output = await buildLearn(IN_THE_REPOSITORY, undefined, '../../packages/content/learn', {
      root: 'apps/web',
      resolve,
    });
    expect(chunks(output).some((chunk) => chunk.code.includes(REACT_STUB))).toBe(true);
  });

  it('a fixture compiles and imports only react/jsx-runtime', async () => {
    const output = await buildLearn(FIXTURE);
    const bodies = chunks(output).filter((chunk) => chunk.isDynamicEntry);
    expect(bodies).toHaveLength(2);
    for (const body of bodies) {
      expect(body.imports).toEqual(['react/jsx-runtime']);
      expect(body.code).toContain('MDXContent');
    }
    expect(bodies.some((body) => body.code.includes(BODY_PHRASE))).toBe(true);
  });

  it('the front matter reaches no body and keeps line numbers', async () => {
    const output = await buildLearn(FIXTURE);
    for (const body of chunks(output).filter((chunk) => chunk.isDynamicEntry)) {
      expect(body.code).not.toContain('reviewedBy');
      expect(body.code).not.toContain('slug:');
    }
    // Lines 1 to 5 are the front matter; the heading is line 6 and the element line 8.
    const files = { ...FIXTURE, 'learn/noise.mdx': module('noise', '# Noise\n\n<Chart />') };
    await expect(buildLearn(files)).rejects.toThrow(/noise\.mdx:8/);
  });

  it('the metadata module holds no body text, in the slug order of docs/EDUCATION.md §10', async () => {
    const entry = entryOf(await buildLearn(FIXTURE));
    // The bundler re-prints the literal, so the key may or may not be quoted.
    expect(entry.code).toMatch(/\bslug"?: ?"start-here"/);
    expect(entry.code).toMatch(/\btitle"?: ?"noise title"/);
    expect(entry.code).not.toContain(BODY_PHRASE);
    expect(entry.code).not.toMatch(/\bbody\b/);
    expect(entry.code.indexOf('"start-here"')).toBeLessThan(entry.code.indexOf('"noise"'));
    expect(entry.dynamicImports).toHaveLength(2);
  });

  it('a missing folder gives empty lists', async () => {
    const output = await buildLearn(FIXTURE, undefined, 'nowhere');
    expect(chunks(output)).toHaveLength(1);
    expect(entryOf(output).code).not.toContain('slug');
    expect(entryOf(output).dynamicImports).toHaveLength(0);
  });

  it('a failed parse fails the build, naming the file', async () => {
    const files = { ...FIXTURE, 'learn/noise.mdx': '# No front matter\n' };
    await expect(buildLearn(files)).rejects.toThrow(/noise\.mdx.*Open the file with front matter/s);
  });

  describe('a body that carries code fails the build', () => {
    const cases: readonly [string, string, RegExp][] = [
      ['an import', "import { x } from 'y'\n\nText.", /noise\.mdx:6.*import/s],
      ['an export', 'export const x = 1\n\nText.', /noise\.mdx:6.*export/s],
      ['an {expression}', 'Text with {1 + 1} in it.', /noise\.mdx:6.*expression/s],
      ['an element outside the set', 'Text.\n\n<Chart />\n', /noise\.mdx:8.*Chart/s],
    ];
    it.each(cases)('%s', async (_name, body, message) => {
      const files = { ...FIXTURE, 'learn/noise.mdx': module('noise', body) };
      await expect(buildLearn(files, ['DrawdownsBar'])).rejects.toThrow(message);
    });

    // A raw <a> leaves the hash route on mobile: a body links nowhere, the app links to it (ADR-0048 Deviations).
    it('refuses a link, a reference link and an image', async () => {
      const bodies: readonly [string, RegExp][] = [
        ['A [link](/plan) in the text.', /noise\.mdx:6.*a link is not allowed/s],
        ['A [reference][plan] in the text.\n\n[plan]: /plan', /noise\.mdx:6.*a reference link is not allowed/s],
        ['An ![image](/mark.png) in the text.', /noise\.mdx:6.*an image is not allowed/s],
        ['Text.\n\n[plan]: /plan', /noise\.mdx:8.*a link definition is not allowed/s],
      ];
      for (const [body, message] of bodies) {
        const files = { ...FIXTURE, 'learn/noise.mdx': module('noise', body) };
        await expect(buildLearn(files)).rejects.toThrow(message);
      }
    });

    it('an element in the set compiles', async () => {
      const files = { ...FIXTURE, 'learn/noise.mdx': module('noise', 'Text.\n\n<DrawdownsBar />\n') };
      const output = await buildLearn(files, ['DrawdownsBar']);
      const body = chunks(output).find((chunk) => chunk.isDynamicEntry && chunk.code.includes('DrawdownsBar'));
      expect(body?.imports).toEqual(['react/jsx-runtime']);
    });

    // The attributes of an allowed element are code too: the compiler would ship them as the props.
    it('an {expression} as an attribute value of an allowed element fails the build', async () => {
      const body = 'Text.\n\n<DrawdownsBar data={globalThis.fetch("https://x.test")} />\n';
      const files = { ...FIXTURE, 'learn/noise.mdx': module('noise', body) };
      await expect(buildLearn(files, ['DrawdownsBar'])).rejects.toThrow(/noise\.mdx:8.*expression/s);
    });

    it('a {...spread} attribute on an allowed element fails the build', async () => {
      const body = 'Text.\n\n<DrawdownsBar {...(await import("node:fs"))} />\n';
      const files = { ...FIXTURE, 'learn/noise.mdx': module('noise', body) };
      await expect(buildLearn(files, ['DrawdownsBar'])).rejects.toThrow(/noise\.mdx:8.*spread/s);
    });

    it('a string attribute on an allowed element compiles', async () => {
      const body = 'Text.\n\n<DrawdownsBar kind="drawdowns" compact />\n';
      const files = { ...FIXTURE, 'learn/noise.mdx': module('noise', body) };
      const output = await buildLearn(files, ['DrawdownsBar']);
      const chunk = chunks(output).find((item) => item.isDynamicEntry && item.code.includes('DrawdownsBar'));
      expect(chunk?.code).toContain('"drawdowns"');
      expect(chunk?.imports).toEqual(['react/jsx-runtime']);
    });
  });

  it('two files with one slug fail the build naming both files', async () => {
    const files = { ...FIXTURE, 'learn/noise-copy.mdx': module('noise', 'Second body.') };
    const message = /^(?=.*\bnoise\.mdx\b)(?=.*\bnoise-copy\.mdx\b)(?=.*\bslug noise\b)/s;
    await expect(buildLearn(files)).rejects.toThrow(message);
  });
});

// `pnpm validate:content` runs the same compiler and the same check, so a refused body shows before a build.
describe('checkModuleBody', () => {
  const path = 'packages/content/learn/noise.mdx';
  const refused: readonly [string, string, RegExp][] = [
    ['an element outside the set', 'Text.\n\n<Foo />\n', /noise\.mdx:8: <Foo> is not allowed/],
    ['an {expression}', 'Text with {1} in it.', /noise\.mdx:6: an \{expression\} is not allowed/],
    ['an import', "import x from 'y'\n\nText.", /noise\.mdx:6: an import or export statement is not allowed/],
    ['an export', 'export const x = 1\n\nText.', /noise\.mdx:6: an import or export statement is not allowed/],
    ['a link', 'A [a](b) in the text.', /noise\.mdx:6: a link is not allowed/],
    ['a reference link', 'A [reference][plan].\n\n[plan]: /plan', /noise\.mdx:6: a reference link is not allowed/],
    ['an image', 'An ![image](/mark.png).', /noise\.mdx:6: an image is not allowed/],
    ['a link definition', 'Text.\n\n[plan]: /plan', /noise\.mdx:8: a link definition is not allowed/],
    ['an {expression} attribute', 'Text.\n\n<PastPerformance id={1} />\n', /noise\.mdx:8: an \{expression\} as/],
    ['a {...spread} attribute', 'Text.\n\n<PastPerformance {...x} />\n', /noise\.mdx:8: a \{\.\.\.spread\}/],
  ];

  it.each(refused)('refuses %s, naming the file and line', async (_name, body, message) => {
    expect(await checkModuleBody(module('noise', body), path)).toMatch(message);
  });

  it('allows the elements of MODULE_BODY_ELEMENTS by default', async () => {
    expect(MODULE_BODY_ELEMENTS).toEqual(['PastPerformance', 'Chart']);
    expect(await checkModuleBody(module('noise', 'A line. <PastPerformance />\n'), path)).toBeNull();
    expect(await checkModuleBody(module('noise', 'Text.\n\n<Chart />\n'), path)).toBeNull();
  });

  it('takes another set of elements', async () => {
    expect(await checkModuleBody(module('noise', 'Text.\n\n<Chart />\n'), path, ['Chart'])).toBeNull();
    expect(await checkModuleBody(module('noise', 'A line. <PastPerformance />\n'), path, [])).toMatch(
      /<PastPerformance> is not allowed; no element is allowed/,
    );
  });

  it('refuses a path the compiler would skip, instead of passing a body it never read', async () => {
    expect(await checkModuleBody(module('noise', 'Text.'), 'packages/content/learn/noise.txt')).toMatch(
      /noise\.txt: not an \.mdx file/,
    );
  });

  it('passes Markdown text and ignores the front matter', async () => {
    expect(await checkModuleBody(module('noise', '# Noise\n\nA *calm* plan.\n\n- one\n- two\n'), path)).toBeNull();
  });
});
