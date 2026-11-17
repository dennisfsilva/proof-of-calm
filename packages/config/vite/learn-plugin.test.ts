import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import mdx from '@mdx-js/rollup';
import { describe, expect, it } from 'vitest';
import { buildFixtureBundle, type FixtureBuildOptions, type FixtureFiles } from './fixture.ts';
import { createHostConfig } from './host-config.ts';
import {
  blankFrontMatter,
  checkModuleBody,
  learnPlugins,
  MODULE_BODY_ELEMENTS,
  PAGE_NODES,
  type ParseModule,
  pageBlocks,
} from './learn-plugin.ts';

type Node = { readonly type: string; readonly children?: readonly Node[] };

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
  const pass = (...blocks: string[]) => ({ problem: null, flow: [], elements: [], blocks });
  const TEXT_PAST = { problem: null, flow: [], elements: ['text:PastPerformance'], blocks: ['A line. '] };
  const flowChart = (...blocks: string[]) => ({ problem: null, flow: ['Chart'], elements: ['flow:Chart'], blocks });

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
    expect(await checkModuleBody(module('noise', 'A `<Chart />` sign.\n'), path)).toEqual(pass('A <Chart /> sign.'));
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
    it('removes every default-ignorable code point, so the block holds the word the page shows', async () => {
      const hidden = ['­', '​', '‌', '‍', '⁠', '﻿', '͏', '⁡'];
      for (const character of hidden) expect(await blocks(`imper${character}dível`)).toEqual(['imperdível']);
      expect(await blocks('imper&shy;dível e imper&#8203;dível')).toEqual(['imperdível e imperdível']);
    });
  });

  // The reader knows every node a compiling body holds, and fails closed on any other (a remark plugin added later).
  describe('the block reader reads a closed set of nodes', () => {
    const learn = new URL('../../content/learn/', import.meta.url);

    it("holds every node type of the English modules' compiled trees", async () => {
      const names = readdirSync(learn).filter((name) => name.endsWith('.mdx'));
      expect(names.length).toBeGreaterThan(4);
      for (const name of names) {
        const types = new Set<string>();
        const collect = () => (tree: Node) => {
          const visit = (node: Node): void => {
            types.add(node.type);
            for (const child of node.children ?? []) visit(child);
          };
          visit(tree);
        };
        const [source, at] = [readFileSync(new URL(name, learn), 'utf8'), `packages/content/learn/${name}`];
        expect(await mdx({ remarkPlugins: [collect] }).transform(blankFrontMatter(source), at)).toBeDefined();
        expect([name, [...types].filter((type) => !PAGE_NODES.includes(type))]).toEqual([name, []]);
        expect((await checkModuleBody(source, at)).problem).toBeNull();
      }
    });

    it('throws on a node type outside the set, naming it and its line', () => {
      const table = { type: 'table', position: { start: { line: 4 } }, children: [] };
      expect(() => pageBlocks({ type: 'root', children: [table] }, 'learn/noise.mdx')).toThrow(
        /^learn\/noise\.mdx:4: a table node is not one the page text reader knows/,
      );
      const loose = { type: 'text', value: 'Loose.', position: { start: { line: 2 } } };
      expect(() => pageBlocks({ type: 'root', children: [loose] }, 'learn/noise.mdx')).toThrow(/a text node/);
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
    expect(await checkModuleBody(module('noise', markdown), path)).toEqual(pass('Noise', 'A calm plan.', 'one', 'two'));
  });
});
