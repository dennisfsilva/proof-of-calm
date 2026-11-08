// The Learn modules' build pipeline (ADR-0048): the front matter blanked ahead of the MDX compiler, the
// compiler itself in the `pre` phase with the closed-body check, and one virtual module that holds every
// module's metadata and a lazy import per body, so no body text reaches the chunk that lists the modules.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import mdx from '@mdx-js/rollup';
import type { Plugin, PluginOption } from 'vite';

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
};

/** The id a host imports: `LEARN_MODULES` (metadata, in slug order) and `LEARN_BODIES` (a lazy import per slug). */
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
 * The remark plugin that keeps a body text, never code (ADR-0048): it throws, naming the file and line, on
 * an `import` or `export`, on an `{expression}` (in the text or in an attribute of an allowed element), on
 * any element outside `elements`, and on a Markdown link, image or link definition.
 */
export function closedBody(elements: readonly string[]) {
  const allowed = new Set(elements);
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
      if (link !== undefined) throw new Error(`${at(node)}: ${link} is not allowed; a module holds no link (ADR-0048)`);
      if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
        if (!allowed.has(node.name ?? ''))
          throw new Error(`${at(node)}: <${node.name ?? ''}> is not allowed; ${set} (ADR-0048)`);
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

const modulesPlugin = (options: LearnPluginOptions): Plugin => ({
  name: 'poc:learn-modules',
  resolveId(id) {
    return id === LEARN_MODULES_ID ? RESOLVED_ID : undefined;
  },
  async load(id) {
    if (id !== RESOLVED_ID) return;
    const modules: { readonly meta: Omit<ParsedModule, 'body'>; readonly file: string }[] = [];
    // The slug keys `LEARN_BODIES`: two files with one slug would leave one body unreachable in silence.
    const fileOf = new Map<string, string>();
    // `dir` is read here, when the build runs, not when the plugin is made.
    for (const file of await listModules(options.dir)) {
      this.addWatchFile(file);
      const parsed = options.parseModule(file, await readFile(file, 'utf8'));
      if (!parsed.ok) return this.error(parsed.error.map((problem) => `${file}: ${problem.detail}`).join('\n'));
      const { body: _body, ...meta } = parsed.value;
      const other = fileOf.get(meta.slug);
      if (other !== undefined) {
        const names = [other, file].map((path) => relative(options.dir, path)).join(' and ');
        return this.error(`${names} both carry the slug ${meta.slug}; one module per slug (ADR-0048)`);
      }
      fileOf.set(meta.slug, file);
      modules.push({ meta, file });
    }
    modules.sort((a, b) => rank(a.meta.slug) - rank(b.meta.slug) || a.meta.slug.localeCompare(b.meta.slug));
    const bodies = modules.map(
      ({ meta, file }) => `${JSON.stringify(meta.slug)}: () => import(${JSON.stringify(file.replaceAll('\\', '/'))})`,
    );
    return [
      `export const LEARN_MODULES = Object.freeze(${JSON.stringify(modules.map((module) => module.meta))});`,
      `export const LEARN_BODIES = Object.freeze({ ${bodies.join(', ')} });`,
      '',
    ].join('\n');
  },
});

/**
 * The three plugins, in order: the front-matter transform, the MDX compiler in the `pre` phase (mdxjs.com's
 * Vite section: before `@vitejs/plugin-react`) with `closedBody`, and the virtual module. The host puts
 * them before `react()`.
 */
export function learnPlugins(options: LearnPluginOptions): PluginOption[] {
  const compile = mdx({ remarkPlugins: [closedBody(options.elements ?? [])] });
  // Spelled out instead of spread: the compiler's `transform` is typed for Rollup, whose answer may carry
  // `map: undefined` or an indexed map (sections, no `mappings`), which Vite's hook type does not admit.
  // The compiler emits a plain map, so the answer is only reshaped here.
  const compiler: Plugin = {
    name: compile.name,
    enforce: 'pre',
    config: compile.config,
    async transform(code, id) {
      const result = await compile.transform(code, id);
      if (result === undefined) return null;
      const { map } = result;
      const plain = typeof map === 'object' && map !== null && 'mappings' in map ? map : null;
      return { code: result.code, map: typeof map === 'string' ? map : plain };
    },
  };
  return [frontMatterPlugin(), compiler, modulesPlugin(options)];
}
