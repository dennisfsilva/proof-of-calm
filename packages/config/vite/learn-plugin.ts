// The Learn modules' build pipeline (ADR-0048): the front matter blanked ahead of the MDX compiler, the
// compiler itself in the `pre` phase with the closed-body check, and one virtual module that holds every
// module's metadata and a lazy import per body, so no body text reaches the chunk that lists the modules.
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import mdx from '@mdx-js/rollup';
import type { Plugin, PluginOption } from 'vite';
import { englishModuleOf, listTranslations, sourceHeadings, translatedSource } from './learn-translations.ts';

/** A parsed module as the plugin needs it: the slug keys its body, the body is compiled apart from the rest. */
type ParsedModule = { readonly slug: string; readonly body: string };
type ParseProblem = { readonly code: string; readonly detail: string };
/** `@proofofcalm/content/modules`' parseModule, passed in: this package stays below packages/content. */
export type ParseModule = (
  path: string,
  source: string,
) =>
  | { readonly ok: true; readonly value: ParsedModule }
  | { readonly ok: false; readonly error: readonly ParseProblem[] };

export type LearnPluginOptions = {
  /** The absolute folder of the `.mdx` modules; a missing folder is no modules. */
  dir: string;
  parseModule: ParseModule;
  /** The element names a body may use, the ones the renderer passes through `components`; none by default. */
  elements?: readonly string[];
  /** The folder of the translations, `<language>/learn/<slug>.mdx` (ADR-0057); `i18n` beside `dir` by default. */
  translations?: string;
};

/**
 * The id a host imports: `LEARN_MODULES` (metadata, in slug order), `LEARN_BODIES` (a lazy import per slug) and
 * `LEARN_TRANSLATIONS` (per language, a lazy import per slug of the translated body with its `meta`).
 */
export const LEARN_MODULES_ID = 'virtual:learn-modules';
const RESOLVED_ID = `\0${LEARN_MODULES_ID}`;

// docs/EDUCATION.md §10's slug order; the schema in packages/content/src/schema/module.ts validates the slugs.
const SLUG_ORDER = [
  'start-here',
  'risk-honestly',
  'cycles',
  'taxes-where-you-live',
  'noise',
  'when-the-market-drops',
  'simulator',
];
const FENCE = '---';
const MDX_FILE = /\.mdx$/;

/**
 * The source with its front matter block (two `---` lines and what is between) replaced by empty lines:
 * the compiler sees no front matter and every body line keeps its number, so a build error names the
 * right line. A file without the block is returned as it is.
 */
export function blankFrontMatter(source: string): string {
  const lines = source.split('\n');
  if (lines[0]?.trimEnd() !== FENCE) return source;
  const close = lines.findIndex((line, index) => index > 0 && line.trimEnd() === FENCE);
  if (close === -1) return source;
  return lines.map((line, index) => (index <= close ? '' : line)).join('\n');
}

type MdastNode = {
  readonly type: string;
  readonly name?: string | null;
  readonly value?: string;
  readonly depth?: number;
  readonly position?: { readonly start: { readonly line: number } };
  readonly children?: readonly MdastNode[];
  readonly attributes?: readonly MdxAttribute[];
};

// mdast-util-mdx-jsx's attribute nodes: `{...spread}` is an `mdxJsxExpressionAttribute`; `name="text"`,
// a bare `name` and `name={code}` are an `mdxJsxAttribute` whose value is a string, null or an expression node.
type MdxAttribute = {
  readonly type: 'mdxJsxAttribute' | 'mdxJsxExpressionAttribute';
  readonly name?: string;
  readonly value?: string | null | { readonly type: string };
  readonly position?: { readonly start: { readonly line: number } };
};

const CODE_NODES: Readonly<Record<string, string>> = {
  mdxjsEsm: 'an import or export statement',
  mdxFlowExpression: 'an {expression}',
  mdxTextExpression: 'an {expression}',
};

// A raw <a> leaves the hash route on mobile and a body has no image element: the screen that shows a module
// links to it, never the other way round (ADR-0048 Deviations).
const LINK_NODES: Readonly<Record<string, string>> = {
  link: 'a link',
  linkReference: 'a reference link',
  image: 'an image',
  definition: 'a link definition',
};

/** What an attribute of an allowed element carries as code, or `undefined` for a string or bare attribute. */
function attributeCode(attribute: MdxAttribute): string | undefined {
  if (attribute.type === 'mdxJsxExpressionAttribute') return 'a {...spread} attribute';
  if (typeof attribute.value === 'object' && attribute.value !== null)
    return `an {expression} as the value of ${attribute.name ?? 'an attribute'}`;
  return undefined;
}

/**
 * The elements that draw a block, so each stands on a line of its own: MDX makes one that shares a line with
 * text a text element, and its block would nest inside the paragraph's `<p>`.
 */
export const MODULE_FLOW_ELEMENTS = ['Chart'] as const;

/**
 * The remark plugin that keeps a body text, never code (ADR-0048): it throws, naming the file and line, on
 * an `import` or `export`, on an `{expression}` (in the text or in an attribute of an allowed element), on
 * any element outside `elements`, on an element of `flowOnly` inside a paragraph, on an allowed element with
 * content between its tags (each is self-closing and renders no children), and on a Markdown link, image or
 * link definition.
 */
export function closedBody(elements: readonly string[], flowOnly: readonly string[] = MODULE_FLOW_ELEMENTS) {
  const allowed = new Set(elements);
  const blocks = new Set(flowOnly);
  const set = allowed.size === 0 ? 'no element is allowed' : `the elements allowed are ${[...allowed].join(', ')}`;
  return () => (tree: MdastNode, file: { readonly path?: string }) => {
    const at = (node: MdastNode | MdxAttribute) => `${file.path ?? 'a module'}:${node.position?.start.line ?? 0}`;
    const refuse = (node: MdastNode | MdxAttribute, what: string): never => {
      throw new Error(`${at(node)}: ${what} is not allowed; a module carries text, never code (ADR-0048)`);
    };
    const visit = (node: MdastNode): void => {
      const code = CODE_NODES[node.type];
      if (code !== undefined) refuse(node, code);
      const link = LINK_NODES[node.type];
      if (link !== undefined)
        throw new Error(`${at(node)}: ${link} is not allowed; write the link's words as plain text (ADR-0048)`);
      if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
        if (!allowed.has(node.name ?? ''))
          throw new Error(`${at(node)}: <${node.name ?? ''}> is not allowed; ${set} (ADR-0048)`);
        if (node.type === 'mdxJsxTextElement' && blocks.has(node.name ?? ''))
          throw new Error(
            `${at(node)}: <${node.name ?? ''}> stands on a line of its own, never in a sentence (ADR-0048)`,
          );
        // The renderer passes no children to an allowed element, so anything inside one would never show.
        if ((node.children ?? []).length > 0)
          throw new Error(
            `${at(node)}: <${node.name ?? ''}> takes no content; write it self-closing, as <${node.name ?? ''} /> (ADR-0048)`,
          );
        for (const attribute of node.attributes ?? []) {
          const attributeWhat = attributeCode(attribute);
          if (attributeWhat !== undefined) refuse(attribute, attributeWhat);
        }
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
  };
}

/**
 * The elements a module body may use, the ones the renderer passes through `components` (ADR-0048, Deviations):
 * the hosts, Storybook, the tests and `pnpm validate:content` read this one list.
 */
export const MODULE_BODY_ELEMENTS = ['PastPerformance', 'Chart'] as const;

/**
 * A remark plugin that records the name of every flow element of the tree, and every element as `flow:<Name>` or
 * `text:<Name>` and every depth-2 heading as `heading:2`, both in document order. Its lists are read only when
 * `closedBody` passed, and then no element sits inside another, so each one named is one the page renders.
 */
const flowElements = (flow: string[], all: string[]) => () => (tree: MdastNode) => {
  const visit = (node: MdastNode): void => {
    if (node.type === 'mdxJsxFlowElement') flow.push(node.name ?? '');
    if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement')
      all.push(`${node.type === 'mdxJsxFlowElement' ? 'flow' : 'text'}:${node.name ?? ''}`);
    if (node.type === 'heading' && node.depth === 2) all.push('heading:2');
    for (const child of node.children ?? []) visit(child);
  };
  visit(tree);
};

// Every node a compiling body holds: `closedBody` refuses the rest, and the compiler runs without remark-gfm. A
// block's text is the page's one run of text; a container holds blocks; an inline node sits inside a block. An
// allowed element has no children (`closedBody`), and a fence's info string is its `lang` and `meta`, never shown.
const BLOCK_NODES = ['paragraph', 'heading', 'code'];
const CONTAINER_NODES = ['root', 'list', 'listItem', 'blockquote', 'thematicBreak', 'mdxJsxFlowElement'];
const INLINE_NODES = ['text', 'inlineCode', 'emphasis', 'strong', 'break', 'mdxJsxTextElement'];
/** The node types the page text reader knows; it throws on any other, so a remark plugin added later fails closed. */
export const PAGE_NODES: readonly string[] = [...BLOCK_NODES, ...CONTAINER_NODES, ...INLINE_NODES];

// A soft hyphen, a zero-width space or joiner, a word joiner: the page shows none of them unless a line wraps there.
const IGNORABLE = /\p{Default_Ignorable_Code_Point}/gu;

/**
 * The text the page shows, one string per paragraph, heading or code block in tree order, as the parser decoded it:
 * every value below a block joined with nothing, a hard break with a space, every default-ignorable code point
 * removed. It throws on a node outside `PAGE_NODES` or in a place its kind never takes, naming `path` and the line.
 */
export function pageBlocks(tree: MdastNode, path: string): string[] {
  const unknown = (node: MdastNode) =>
    new Error(`${path}:${node.position?.start.line ?? 0}: a ${node.type} node is not one the page text reader knows`);
  const inline = (node: MdastNode): string => {
    if (!INLINE_NODES.includes(node.type)) throw unknown(node);
    if (node.type === 'break') return ' ';
    return node.value ?? (node.children ?? []).map(inline).join('');
  };
  const blocks: string[] = [];
  const visit = (node: MdastNode): void => {
    if (node.type === 'code') blocks.push(node.value ?? '');
    else if (BLOCK_NODES.includes(node.type)) blocks.push((node.children ?? []).map(inline).join(''));
    else if (CONTAINER_NODES.includes(node.type)) for (const child of node.children ?? []) visit(child);
    else throw unknown(node);
  };
  visit(tree);
  return blocks.map((block) => block.replace(IGNORABLE, ''));
}

/** A remark plugin that records the page's blocks; no attribute value is a word, as the page shows none. */
const pageWords = (words: string[]) => () => (tree: MdastNode, file: { readonly path?: string }) => {
  words.push(...pageBlocks(tree, file.path ?? 'a module'));
};

/**
 * What the compiler read in one module body: the build's message or null, its flow elements by name, every
 * element as `flow:<Name>` (a block) or `text:<Name>` (inside a sentence) and every depth-2 heading as
 * `heading:2`, in tree order, and the page's text block by block (empty when the body does not compile).
 */
export type ModuleBodyCheck = {
  readonly problem: string | null;
  readonly flow: Names;
  readonly elements: Names;
  readonly blocks: Names;
};
type Names = readonly string[];

/**
 * The build's own check on one module, for `pnpm validate:content`: the MDX compiler with `closedBody` on the
 * source with its front matter blanked. `problem` is the message the build would fail with, or null when the
 * body compiles; `path` is the module's `.mdx` path, and the message names it with the line. `flow` names the
 * flow elements the tree holds and `elements` every element, so an escaped `\<Chart />` or code counts as none.
 * `blocks` is the page's text, one string per paragraph, heading or code block (`pageBlocks`).
 */
export async function checkModuleBody(
  source: string,
  path: string,
  elements: readonly string[] = MODULE_BODY_ELEMENTS,
): Promise<ModuleBodyCheck> {
  const flow: string[] = [];
  const all: string[] = [];
  const words: string[] = [];
  const compile = mdx({ remarkPlugins: [closedBody(elements), flowElements(flow, all), pageWords(words)] });
  const none = { flow: [], elements: [], blocks: [] };
  try {
    // The compiler skips an id outside its extensions: a body it never read is not a pass.
    const result = await compile.transform(blankFrontMatter(source), path);
    if (result !== undefined) return { problem: null, flow, elements: all, blocks: words };
    return { problem: `${path}: not an .mdx file, so the compiler did not read it (ADR-0048)`, ...none };
  } catch (error) {
    return { problem: error instanceof Error ? error.message : String(error), ...none };
  }
}

const frontMatterPlugin = (): Plugin => ({
  name: 'poc:learn-front-matter',
  enforce: 'pre',
  transform(code, id) {
    if (!MDX_FILE.test(id.split('?')[0] ?? id)) return;
    return { code: blankFrontMatter(code), map: null };
  },
});

/** The `.mdx` files of `dir` as absolute paths, by name; none when the folder is missing. */
async function listModules(dir: string): Promise<string[]> {
  try {
    const names = await readdir(dir);
    return names
      .filter((name) => MDX_FILE.test(name))
      .sort()
      .map((name) => join(dir, name));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
}

const rank = (slug: string) => {
  const index = SLUG_ORDER.indexOf(slug);
  return index === -1 ? SLUG_ORDER.length : index;
};

const slashed = (path: string) => path.replaceAll('\\', '/');
const importOf = (slug: string, file: string) =>
  `${JSON.stringify(slug)}: () => import(${JSON.stringify(slashed(file))})`;

/** The translated metadata by file, which the virtual module fills and the compiler appends as `meta`. */
type MetaOf = Map<string, Omit<ParsedModule, 'body'>>;

const translationsOf = (options: LearnPluginOptions) => options.translations ?? join(dirname(options.dir), 'i18n');

const modulesPlugin = (options: LearnPluginOptions, metaOf: MetaOf): Plugin => ({
  name: 'poc:learn-modules',
  resolveId(id) {
    return id === LEARN_MODULES_ID ? RESOLVED_ID : undefined;
  },
  async load(id) {
    if (id !== RESOLVED_ID) return;
    const modules: { readonly meta: Omit<ParsedModule, 'body'>; readonly file: string }[] = [];
    // The slug keys `LEARN_BODIES`: two files with one slug would leave one body unreachable in silence.
    const fileOf = new Map<string, string>();
    const sourceOf = new Map<string, string>();
    // `dir` is read here, when the build runs, not when the plugin is made.
    for (const file of await listModules(options.dir)) {
      this.addWatchFile(file);
      const source = await readFile(file, 'utf8');
      const parsed = options.parseModule(file, source);
      if (!parsed.ok) return this.error(parsed.error.map((problem) => `${file}: ${problem.detail}`).join('\n'));
      const { body: _body, ...meta } = parsed.value;
      const other = fileOf.get(meta.slug);
      if (other !== undefined) {
        const names = [other, file].map((path) => relative(options.dir, path)).join(' and ');
        return this.error(`${names} both carry the slug ${meta.slug}; one module per slug (ADR-0048)`);
      }
      fileOf.set(meta.slug, file);
      sourceOf.set(meta.slug, source);
      modules.push({ meta, file });
    }
    modules.sort((a, b) => rank(a.meta.slug) - rank(b.meta.slug) || a.meta.slug.localeCompare(b.meta.slug));
    const bodies = modules.map(({ meta, file }) => importOf(meta.slug, file));
    const languages = new Map<string, string[]>();
    for (const { language, file, source } of await listTranslations(translationsOf(options))) {
      this.addWatchFile(file);
      const translated = translatedSource(source, (slug) => sourceOf.get(slug));
      if (typeof translated === 'string') return this.error(`${file}: ${translated}`);
      const parsed = options.parseModule(file, translated.source);
      if (!parsed.ok) return this.error(parsed.error.map((problem) => `${file}: ${problem.detail}`).join('\n'));
      const { body: _body, ...meta } = parsed.value;
      metaOf.set(slashed(file), meta);
      languages.set(language, [...(languages.get(language) ?? []), importOf(translated.slug, file)]);
    }
    const translations = [...languages].map(
      ([language, imports]) => `${JSON.stringify(language)}: Object.freeze({ ${imports.join(', ')} })`,
    );
    return [
      `export const LEARN_MODULES = Object.freeze(${JSON.stringify(modules.map((module) => module.meta))});`,
      `export const LEARN_BODIES = Object.freeze({ ${bodies.join(', ')} });`,
      `export const LEARN_TRANSLATIONS = Object.freeze({ ${translations.join(', ')} });`,
      '',
    ].join('\n');
  },
});

/**
 * The three plugins, in order: the front-matter transform, the MDX compiler in the `pre` phase (mdxjs.com's
 * Vite section: before `@vitejs/plugin-react`) with `closedBody` and `sourceHeadings`, and the virtual module.
 * The host puts them before `react()`.
 */
export function learnPlugins(options: LearnPluginOptions): PluginOption[] {
  const metaOf: MetaOf = new Map();
  const closed = closedBody(options.elements ?? []);
  const compile = mdx({ remarkPlugins: [closed] });
  let development = false;
  // Spelled out instead of spread: the compiler's `transform` is typed for Rollup, whose answer may carry
  // `map: undefined` or an indexed map (sections, no `mappings`), which Vite's hook type does not admit.
  // The compiler emits a plain map, so the answer is only reshaped here.
  const compiler: Plugin = {
    name: compile.name,
    enforce: 'pre',
    config(config, env) {
      development = env.mode === 'development';
      return compile.config(config, env);
    },
    async transform(code, id) {
      // A translation's h2s take the h2 texts of the English module on disk now (`sourceHeadings`); the compiler
      // watches that file, so under `pnpm dev` an English edit compiles the translation again.
      const path = id.split('?')[0] ?? id;
      const dirs = { translations: translationsOf(options), english: options.dir };
      const english = MDX_FILE.test(path) ? await englishModuleOf(path, dirs, options.parseModule) : undefined;
      if (english !== undefined) this.addWatchFile(english.file);
      const result = await (english === undefined
        ? compile
        : mdx({ development, remarkPlugins: [closed, sourceHeadings(blankFrontMatter(english.source))] })
      ).transform(code, id);
      if (result === undefined) return null;
      const { map } = result;
      const plain = typeof map === 'object' && map !== null && 'mappings' in map ? map : null;
      // A translation's metadata rides in its own chunk, after the body, so no line of the body moves.
      const meta = metaOf.get(slashed(path));
      const compiled =
        meta === undefined
          ? result.code
          : `${result.code}\nexport const meta = Object.freeze(${JSON.stringify(meta)});\n`;
      return { code: compiled, map: typeof map === 'string' ? map : plain };
    },
  };
  return [frontMatterPlugin(), compiler, modulesPlugin(options, metaOf)];
}
