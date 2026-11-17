import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { describe, expect, it } from 'vitest';
import { buildFixtureBundle, type FixtureBuildOptions, type FixtureFiles } from './fixture.ts';
import { createHostConfig } from './host-config.ts';
import {
  checkModuleBody,
  LEARN_META_ID,
  LEARN_MODULES_ID,
  learnPlugins,
  MODULE_BODY_ELEMENTS,
  type ParseModule,
} from './learn-plugin.ts';
import { englishModuleOf } from './learn-translations.ts';
import type { PageBlock } from './page-blocks.ts';

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

  describe('a translated module (ADR-0057)', () => {
    const TRANSLATED_PHRASE = 'Um plano definido uma vez';
    const translation = (slug: string, body: string) =>
      ['---', `slug: ${slug}`, 'title: Ruído', 'idea: Quase tudo é ruído.', '---', body, ''].join('\n');
    const WITH_TRANSLATION: FixtureFiles = {
      ...FIXTURE,
      'main.js': [
        "import { LEARN_META, LEARN_MODULES, LEARN_TRANSLATIONS } from 'virtual:learn-modules';",
        'console.log(LEARN_MODULES);',
        "LEARN_TRANSLATIONS['pt-PT'].noise().then((m) => console.log(m.default));",
        "LEARN_META['pt-PT']().then((m) => console.log(m.default));",
      ].join('\n'),
      'i18n/pt-PT/learn/noise.mdx': translation('noise', `# Ruído\n\n${TRANSLATED_PHRASE}, e nada para vigiar.`),
    };

    it("builds into LEARN_TRANSLATIONS['pt-PT'].noise, with no metadata in the body's chunk", async () => {
      const output = await buildLearn(WITH_TRANSLATION);
      const body = chunks(output).find((chunk) => chunk.code.includes(TRANSLATED_PHRASE));
      expect(body?.isDynamicEntry).toBe(true);
      expect(body?.facadeModuleId).toMatch(/i18n[\\/]pt-PT[\\/]learn[\\/]noise\.mdx$/);
      for (const text of ['Quase tudo', 'reviewedBy', 'export const meta']) expect(body?.code).not.toContain(text);
    });

    it("builds LEARN_META['pt-PT'] into a chunk of its own, every translated slug's metadata and no body", async () => {
      const output = await buildLearn(WITH_TRANSLATION);
      const meta = chunks(output).find((chunk) => chunk.facadeModuleId === `\0${LEARN_META_ID}pt-PT`);
      expect(meta?.isDynamicEntry).toBe(true);
      // The English module's front matter under the translated texts, its reading time from the translation's words.
      expect(meta?.code).toMatch(/noise"?: ?\{[^}]*title"?: ?"Ruído"/);
      expect(meta?.code).toMatch(/idea"?: ?"Quase tudo é ruído."/);
      expect(meta?.code).toMatch(/reviewedBy"?: ?"owner"/);
      expect(meta?.code).not.toContain(TRANSLATED_PHRASE);
      expect(meta?.code).not.toContain('slug: noise');
    });

    // A link names a section by the id its English heading's words make, so a translated h2 takes the English text
    // at its position as `sourceHeading`, the prop the page's h2 makes its id from (ADR-0048, 2026-11-17).
    it("gives each translated h2 the English module's h2 text at the same position, and English h2s none", async () => {
      const english = module('noise', '# Noise\n\n## Why some people hold\n\nText.\n\n## Selling in 3 parts\n\nText.');
      const files = {
        ...WITH_TRANSLATION,
        'learn/noise.mdx': english,
        'i18n/pt-PT/learn/noise.mdx': translation('noise', '# Ruído\n\n## Porque se mantém\n\n## Vender em 3 partes'),
      };
      const output = await buildLearn(files);
      const body = chunks(output).find((chunk) => chunk.code.includes('Porque se mantém'));
      const h2s = [...(body?.code ?? '').matchAll(/sourceHeading"?: ?"([^"]*)",\s*children"?: ?"([^"]*)"/g)];
      expect(h2s.map(([, source, text]) => [source, text])).toEqual([
        ['Why some people hold', 'Porque se mantém'],
        ['Selling in 3 parts', 'Vender em 3 partes'],
      ]);
      const id = (chunk: ReturnType<typeof chunks>[number]) => chunk.facadeModuleId ?? '';
      const englishBody = chunks(output).find(
        (chunk) => id(chunk).endsWith('noise.mdx') && !id(chunk).includes('i18n'),
      );
      expect(englishBody?.code).toContain('Why some people hold');
      expect(englishBody?.code).not.toContain('sourceHeading');
    });

    it('an h2 past the English count keeps its own text, with no sourceHeading', async () => {
      const files = {
        ...WITH_TRANSLATION,
        'learn/noise.mdx': module('noise', '## One\n\nText.'),
        'i18n/pt-PT/learn/noise.mdx': translation('noise', '## Um\n\n## Dois'),
      };
      const body = chunks(await buildLearn(files)).find((chunk) => chunk.code.includes('Dois'));
      expect(body?.code.match(/sourceHeading/g)).toHaveLength(1);
      expect(body?.code).toMatch(/sourceHeading"?: ?"One",\s*children"?: ?"Um"/);
    });

    it('puts no translated text in the entry chunk', async () => {
      const entry = entryOf(await buildLearn(WITH_TRANSLATION));
      expect(entry.code).toMatch(/title"?: ?"noise title"/);
      for (const text of [TRANSLATED_PHRASE, 'Ruído', 'Quase tudo']) expect(entry.code).not.toContain(text);
      // The two English bodies, the one translation and pt-PT's metadata, each its own lazy chunk.
      expect(entry.dynamicImports).toHaveLength(4);
    });

    it('fails the build at the line of an element outside the set', async () => {
      const files = { ...WITH_TRANSLATION, 'i18n/pt-PT/learn/noise.mdx': translation('noise', 'Texto.\n\n<Chart />') };
      await expect(buildLearn(files)).rejects.toThrow(/pt-PT[\\/]learn[\\/]noise\.mdx:8.*Chart/s);
    });

    it('fails the build on a translation with no English module, and on a key outside the four', async () => {
      const orphan = { ...WITH_TRANSLATION, 'i18n/pt-PT/learn/cycles.mdx': translation('cycles', 'Texto.') };
      await expect(buildLearn(orphan)).rejects.toThrow(/cycles\.mdx.*no English module/s);
      const extra = translation('noise', 'Texto.').replace('idea:', 'chart: none\nidea:');
      const keyed = { ...WITH_TRANSLATION, 'i18n/pt-PT/learn/noise.mdx': extra };
      await expect(buildLearn(keyed)).rejects.toThrow(/noise\.mdx.*chart/s);
    });

    it('a build with no translations folder emits an empty LEARN_TRANSLATIONS and LEARN_META', async () => {
      const files: FixtureFiles = {
        ...FIXTURE,
        'main.js': [
          "import { LEARN_META, LEARN_MODULES, LEARN_TRANSLATIONS } from 'virtual:learn-modules';",
          'console.log(LEARN_MODULES, LEARN_TRANSLATIONS, LEARN_META);',
        ].join('\n'),
      };
      const entry = entryOf(await buildLearn(files));
      expect(entry.code).toMatch(/LEARN_TRANSLATIONS = Object\.freeze\(\{\s*\}\)/);
      expect(entry.code).toMatch(/LEARN_META = Object\.freeze\(\{\s*\}\)/);
      expect(entry.dynamicImports).toHaveLength(2);
    });
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
      [
        'an element in the set with content',
        'Text.\n\n<DrawdownsBar>\n\n<DrawdownsBar />\n\n</DrawdownsBar>\n',
        /noise\.mdx:8.*<DrawdownsBar> takes no content/s,
      ],
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

    it("says to write a link's words as plain text, and the words alone compile", async () => {
      const linked = { ...FIXTURE, 'learn/noise.mdx': module('noise', 'See [the plan](/plan) for this.') };
      await expect(buildLearn(linked)).rejects.toThrow(
        /noise\.mdx:6: a link is not allowed; write the link's words as plain text \(ADR-0048\)/,
      );
      const plain = { ...FIXTURE, 'learn/noise.mdx': module('noise', 'See the plan for this.') };
      const body = chunks(await buildLearn(plain)).find((chunk) => chunk.code.includes('See the plan for this.'));
      expect(body?.isDynamicEntry).toBe(true);
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
    // A text element's block would nest inside the paragraph's <p>.
    ['<Chart /> in a paragraph', 'A sign. <Chart />\n', /noise\.mdx:6: <Chart> stands on a line of its own/],
    // An allowed element renders no children: a <Chart /> inside one would never mount.
    [
      'a <Chart /> inside <PastPerformance>',
      'Text.\n\n<PastPerformance>\n\n<Chart />\n\n</PastPerformance>\n',
      /noise\.mdx:8: <PastPerformance> takes no content; write it self-closing, as <PastPerformance \/> \(ADR-0048\)/,
    ],
    ['a <Chart /> inside <Chart>', 'Text.\n\n<Chart>\n\n<Chart />\n\n</Chart>\n', /noise\.mdx:8: <Chart> takes no/],
    ['text in a text element', 'A line. <PastPerformance>past</PastPerformance>\n', /noise\.mdx:6: <PastPerf/],
    ['a space in a text element', 'A line. <PastPerformance> </PastPerformance>\n', /noise\.mdx:6: <PastPerf/],
  ];
  const paragraphs = (...texts: string[]): PageBlock[] => texts.map((text) => ({ kind: 'paragraph', text }));
  const pass = (...blocks: string[]) => ({
    problem: null,
    flow: [],
    elements: [],
    blocks,
    page: paragraphs(...blocks),
  });
  const TEXT_PAST = {
    ...pass('A line. '),
    elements: ['text:PastPerformance'],
    page: [{ kind: 'paragraph', text: 'A line. ', marks: ['mdxJsxTextElement'] }],
  };
  const flowChart = (...blocks: string[]) => ({
    problem: null,
    flow: ['Chart'],
    elements: ['flow:Chart'],
    blocks,
    page: [...paragraphs(...blocks), { kind: 'element', name: 'Chart' }],
  });

  it.each(refused)('refuses %s, naming the file and line', async (_name, body, message) => {
    expect((await checkModuleBody(module('noise', body), path)).problem).toMatch(message);
  });

  it('allows the elements of MODULE_BODY_ELEMENTS by default', async () => {
    expect(MODULE_BODY_ELEMENTS).toEqual(['PastPerformance', 'Chart']);
    expect(await checkModuleBody(module('noise', 'A line. <PastPerformance />\n'), path)).toEqual(TEXT_PAST);
    const chart = await checkModuleBody(module('noise', 'Text.\n\n<Chart />\n'), path);
    expect(chart).toEqual(flowChart('Text.'));
  });

  // MDX parses an element with nothing between its tags as one with no children: it renders as <X /> does.
  it('passes an allowed element closed with nothing inside', async () => {
    const text = await checkModuleBody(module('noise', 'A line. <PastPerformance></PastPerformance>\n'), path);
    expect(text).toEqual(TEXT_PAST);
    const flow = await checkModuleBody(module('noise', 'Text.\n\n<Chart></Chart>\n'), path);
    expect(flow).toEqual(flowChart('Text.'));
  });

  // A translation is held to its English module's elements on this list (ADR-0048 Deviations), so it is the tree's.
  it('names every element in tree order, a flow one as flow:<Name> and one in a sentence as text:<Name>', async () => {
    const body = 'Text.\n\n<Chart />\n\nA line. <PastPerformance />\n\n- <Chart />\n\n<PastPerformance />\n';
    expect((await checkModuleBody(module('noise', body), path)).elements).toEqual([
      'flow:Chart',
      'text:PastPerformance',
      'flow:Chart',
      'flow:PastPerformance',
    ]);
    expect((await checkModuleBody(module('noise', 'A \\<PastPerformance /> `<Chart />`.\n'), path)).elements).toEqual(
      [],
    );
    expect((await checkModuleBody(module('noise', 'Text {1}.\n\n<Chart />\n'), path)).elements).toEqual([]);
  });

  // `pnpm validate:content` counts the charts from the tree: an escaped element or a code span is text, no chart.
  it('names the flow elements in order, and none for an escaped element or a code span', async () => {
    const body = 'Text.\n\n<Chart />\n\nA line. <PastPerformance />\n\n- <Chart />\n';
    expect((await checkModuleBody(module('noise', body), path)).flow).toEqual(['Chart', 'Chart']);
    // On its own line, even right under a paragraph's line, the element ends the paragraph and stands as a block.
    expect(await checkModuleBody(module('noise', 'A sign.\n<Chart />\n'), path)).toEqual(flowChart('A sign.'));
    expect(await checkModuleBody(module('noise', 'A \\<Chart /> sign.\n'), path)).toEqual(pass('A <Chart /> sign.'));
    expect(await checkModuleBody(module('noise', 'A `<Chart />` sign.\n'), path)).toEqual({
      ...pass('A <Chart /> sign.'),
      page: [{ kind: 'paragraph', text: 'A <Chart /> sign.', marks: ['inlineCode'] }],
    });
  });

  // A translation holds English's sections (ADR-0048 Deviations): each depth-2 heading is on the elements list.
  it('names each depth-2 heading as heading:2, in tree order among the elements', async () => {
    const body = '# Ruído\n\n## Um\n\n<Chart />\n\n### Dois\n\n## Três\n\nA line. <PastPerformance />\n';
    expect((await checkModuleBody(module('noise', body), path)).elements).toEqual([
      'heading:2',
      'flow:Chart',
      'heading:2',
      'text:PastPerformance',
    ]);
  });

  // A translation's ban list, numbers and hyphens read these blocks (ADR-0048 Deviations), so they are the page's.
  describe('reads the words the page shows, one block per paragraph, heading or code block, in tree order', () => {
    const blocks = async (body: string) => (await checkModuleBody(module('noise', body), path)).blocks;

    it('decodes a character reference and joins every value below a block with nothing', async () => {
      expect(await blocks('# Ruído\n\nImperd&iacute;vel, &#49; e imperd*í*vel.\n\n- um\n- dois\n')).toEqual([
        'Ruído',
        'Imperdível, 1 e imperdível.',
        'um',
        'dois',
      ]);
      expect(await blocks('Imperd**í**vel e imper`dí`vel.\n\n> Uma\n> citação.\n')).toEqual([
        'Imperdível e imperdível.',
        'Uma\ncitação.',
      ]);
    });

    // A tag in code shows as text; a fence's info string and an attribute's value show nothing.
    it("reads code as the page shows it, and no info string, attribute or element's name", async () => {
      expect(await blocks('Um `<b>código</b>` aqui,\nnuma linha.\n\n```mdx info\nbloco\n```\n')).toEqual([
        'Um <b>código</b> aqui,\nnuma linha.',
        'bloco',
      ]);
      expect(await blocks('Texto.\n\n<PastPerformance id="passado" />\n\n---\n\nFim.\n')).toEqual(['Texto.', 'Fim.']);
      expect(await blocks('Text {1}.\n')).toEqual([]);
    });

    it('joins a hard break with a space, as the page shows the two lines', async () => {
      expect(await blocks('Última\\\nhora.\n')).toEqual(['Última hora.']);
      expect(await blocks('Última  \nhora.\n')).toEqual(['Última hora.']);
    });

    // A soft hyphen or a zero-width character inside a word shows as nothing unless the line wraps there.
    it.each(['00AD', '200B', '200C', '200D', '2060', 'FEFF', '034F', '2061'])(
      'removes U+%s, a default-ignorable code point, so the block holds the word the page shows',
      async (hex) => {
        expect(await blocks(`imper${String.fromCodePoint(Number.parseInt(hex, 16))}dível`)).toEqual(['imperdível']);
      },
    );

    it('removes a soft hyphen and a zero-width space written as character references', async () => {
      expect(await blocks('imper&shy;dível e imper&#8203;dível')).toEqual(['imperdível e imperdível']);
    });
  });

  it('takes another set of elements', async () => {
    expect((await checkModuleBody(module('noise', 'Text.\n\n<Chart />\n'), path, ['Chart'])).problem).toBeNull();
    expect((await checkModuleBody(module('noise', 'A line. <PastPerformance />\n'), path, [])).problem).toMatch(
      /<PastPerformance> is not allowed; no element is allowed/,
    );
  });

  it('refuses a path the compiler would skip, instead of passing a body it never read', async () => {
    expect((await checkModuleBody(module('noise', 'Text.'), 'packages/content/learn/noise.txt')).problem).toMatch(
      /noise\.txt: not an \.mdx file/,
    );
  });

  it('passes Markdown text and ignores the front matter', async () => {
    const markdown = '# Noise\n\nA *calm* plan.\n\n- one\n- two\n';
    expect(await checkModuleBody(module('noise', markdown), path)).toEqual({
      ...pass('Noise', 'A calm plan.', 'one', 'two'),
      page: [
        { kind: 'heading', depth: 1, text: 'Noise' },
        { kind: 'paragraph', text: 'A calm plan.', marks: ['emphasis'] },
        ...paragraphs('one', 'two'),
      ],
    });
  });
});

// Under `pnpm dev`, a translation's h2s follow the English module as it is on disk now: an English edit recompiles
// the translation (ADR-0048, 2026-11-17). Proven through the dev server's own watcher and module graph.
describe('englishModuleOf', () => {
  it('reads <slug>.mdx whether or not it parses, and nothing outside the English folder or a missing file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'poc-english-of-'));
    try {
      const files: Record<string, string> = {
        'learn/noise.mdx': '# Noise, saved without its front matter\n',
        'learn/start-here.mdx': module('start-here', '# Start here'),
        'secret.mdx': module('secret', '# Outside'),
        'i18n/pt-PT/learn/noise.mdx': '# Ruído, without front matter: the file name gives the slug\n',
        'i18n/pt-PT/learn/inicio.mdx': ['---', 'slug: start-here', '---', '# Início'].join('\n'),
        'i18n/pt-PT/learn/fora.mdx': ['---', 'slug: ../secret', '---', '# Fora'].join('\n'),
        'i18n/pt-PT/learn/nada.mdx': ['---', 'slug: nothing', '---', '# Nada'].join('\n'),
      };
      for (const [name, text] of Object.entries(files)) {
        await mkdir(dirname(join(root, name)), { recursive: true });
        await writeFile(join(root, name), text);
      }
      const dirs = { translations: join(root, 'i18n'), english: join(root, 'learn') };
      const of = (name: string) => englishModuleOf(join(root, name), dirs, parseModule);
      expect(await of('i18n/pt-PT/learn/noise.mdx')).toMatchObject({
        file: join(root, 'learn/noise.mdx'),
        parsed: false,
      });
      expect(await of('i18n/pt-PT/learn/inicio.mdx')).toMatchObject({
        file: join(root, 'learn/start-here.mdx'),
        parsed: true,
      });
      expect(await of('i18n/pt-PT/learn/fora.mdx')).toBeUndefined();
      expect(await of('i18n/pt-PT/learn/nada.mdx')).toBeUndefined();
      expect(await of('i18n/pt-PT/learn/gone.mdx')).toBeUndefined();
      expect(await of('learn/noise.mdx')).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('learnPlugins under the dev server', () => {
  const RUNTIME =
    'export const jsx = () => null; export const jsxs = jsx; export const jsxDEV = jsx; export const Fragment = jsx;';
  const DEV_FIXTURE: FixtureFiles = {
    'learn/noise.mdx': module('noise', '# Noise\n\n## Why some people hold\n\nText.'),
    'i18n/pt-PT/learn/noise.mdx': [
      '---',
      'slug: noise',
      'title: Ruído',
      '---',
      '# Ruído',
      '',
      '## Porque se mantém',
      '',
    ].join('\n'),
    'node_modules/react/package.json': JSON.stringify({
      name: 'react',
      version: '0.0.0',
      exports: { './jsx-runtime': './runtime.js', './jsx-dev-runtime': './runtime.js' },
    }),
    'node_modules/react/runtime.js': RUNTIME,
  };

  /** A dev server on a fresh copy of DEV_FIXTURE; `close` stops it and removes every file the test wrote. */
  async function startDev() {
    const root = await mkdtemp(join(tmpdir(), 'poc-vite-dev-'));
    let server: ViteDevServer | undefined;
    const close = async () => {
      await server?.close();
      await rm(root, { recursive: true, force: true });
    };
    try {
      for (const [name, text] of Object.entries(DEV_FIXTURE)) {
        await mkdir(dirname(join(root, name)), { recursive: true });
        await writeFile(join(root, name), text);
      }
      // The watcher can be ready before createServer returns: a plugin hears it from the moment the server exists.
      let ready: Promise<unknown> = Promise.resolve();
      const watcherReady = {
        name: 'poc:test-watcher-ready',
        configureServer(created: ViteDevServer) {
          ready = new Promise((resolve) => created.watcher.once('ready', resolve));
        },
      };
      server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        appType: 'custom',
        server: { middlewareMode: true, ws: false },
        optimizeDeps: { noDiscovery: true, include: [] },
        plugins: [watcherReady, ...learnPlugins({ dir: join(root, 'learn'), parseModule })],
      });
      const dev = server;
      const english = join(root, 'learn', 'noise.mdx');
      const translation = async () =>
        (await dev.environments.client.transformRequest('/i18n/pt-PT/learn/noise.mdx'))?.code;
      const headingOf = async () => /sourceHeading"?: ?"([^"]*)"/.exec((await translation()) ?? '')?.[1];
      /** The reviewer pt-PT's metadata module carries for noise, or undefined while it fails to load. */
      const reviewerOf = async () => {
        const code = await dev.environments.client.transformRequest(`${LEARN_META_ID}pt-PT`).then(
          (result) => result?.code,
          () => undefined,
        );
        return /noise"?: ?\{[^}]*reviewedBy"?: ?"([^"]*)"/.exec(code ?? '')?.[1];
      };
      // The page loads the list of modules first, then the translation's chunk.
      await dev.environments.client.transformRequest(LEARN_MODULES_ID);
      expect(await headingOf()).toBe('Why some people hold');
      await ready;
      /**
       * Writes the English module until the watcher reports it: the watcher drops a second change of one file within
       * a few milliseconds of the first, so a write it did not report in 250 ms is written again, for 10 s at most.
       */
      const writeEnglish = async (text: string) => {
        let seen = false;
        const listener = (file: string) => {
          seen ||= file.replaceAll('\\', '/') === english.replaceAll('\\', '/');
        };
        dev.watcher.on('change', listener);
        try {
          const deadline = Date.now() + 10_000;
          while (!seen) {
            if (Date.now() > deadline) throw new Error('the watcher reported no change of the English module in 10 s');
            await writeFile(english, text);
            for (let waited = 0; !seen && waited < 250; waited += 25) await new Promise((wake) => setTimeout(wake, 25));
          }
        } finally {
          dev.watcher.off('change', listener);
        }
      };
      /** The server invalidates a few ticks after the watcher's event: reads again while the value is `from`, 1 s at most. */
      const after = (read: () => Promise<string | undefined>) => async (from: string | undefined) => {
        const deadline = Date.now() + 1_000;
        let value = await read();
        while (value === from && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 25));
          value = await read();
        }
        return value;
      };
      return { close, translation, writeEnglish, headingAfter: after(headingOf), reviewerAfter: after(reviewerOf) };
    } catch (error) {
      await close();
      throw error;
    }
  }

  it("recompiles a translation when the English module's h2 changes on disk", async () => {
    const dev = await startDev();
    try {
      await dev.writeEnglish(module('noise', '# Noise\n\n## Why people hold\n\nText.'));
      expect(await dev.headingAfter('Why some people hold')).toBe('Why people hold');
    } finally {
      await dev.close();
    }
  });

  it('compiles a translation while its English module does not parse, and takes the fixed h2 with no restart', async () => {
    const dev = await startDev();
    try {
      // Saved mid-edit without its front matter: the translation still compiles, with its own ids.
      await dev.writeEnglish('# Noise\n\n## Why some people hold\n\nText.\n');
      expect(await dev.headingAfter('Why some people hold')).toBeUndefined();
      expect(await dev.translation()).toContain('Porque se mantém');
      await dev.writeEnglish(module('noise', '# Noise\n\n## Why people hold\n\nText.'));
      expect(await dev.headingAfter(undefined)).toBe('Why people hold');
    } finally {
      await dev.close();
    }
  });

  // A translation's metadata is the English front matter under the translated texts, so an English edit changes it:
  // virtual:learn-meta/<language> is built by the pass that builds LEARN_MODULES and watches the same files.
  it("serves a translation's metadata fresh after an English edit, a save that does not parse and the fix", async () => {
    const dev = await startDev();
    const english = (reviewer: string) =>
      module('noise', '# Noise\n\n## Why some people hold\n\nText.').replace(
        'reviewedBy: owner',
        `reviewedBy: ${reviewer}`,
      );
    try {
      expect(await dev.reviewerAfter(undefined)).toBe('owner');
      await dev.writeEnglish(english('agent-draft'));
      expect(await dev.reviewerAfter('owner')).toBe('agent-draft');
      // Saved mid-edit without its front matter: the metadata fails to load, as the list of modules does.
      await dev.writeEnglish('# Noise\n\n## Why some people hold\n\nText.\n');
      expect(await dev.reviewerAfter('agent-draft')).toBeUndefined();
      await dev.writeEnglish(english('counsel'));
      expect(await dev.reviewerAfter(undefined)).toBe('counsel');
    } finally {
      await dev.close();
    }
  });
});
