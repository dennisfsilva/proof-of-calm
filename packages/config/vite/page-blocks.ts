// The page a compiled Learn module shows (ADR-0048, Deviations): its blocks in tree order, each with its kind, and
// each flow element where it stands, so a check reads the page's text and the section an element sits in.

/** An mdast node as the Learn plugins read it. */
export type MdastNode = {
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
export type MdxAttribute = {
  readonly type: 'mdxJsxAttribute' | 'mdxJsxExpressionAttribute';
  readonly name?: string;
  readonly value?: string | null | { readonly type: string };
  readonly position?: { readonly start: { readonly line: number } };
};

/** One block of the page: a heading, a paragraph or a code block with its text, or a flow element by name. */
export type PageBlock =
  | { readonly kind: 'heading'; readonly depth: number; readonly text: string }
  | { readonly kind: 'paragraph' | 'code'; readonly text: string }
  | { readonly kind: 'element'; readonly name: string };

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
 * The page, block by block in tree order: each paragraph, heading or code block with the text the page shows, as
 * the parser decoded it (every value below a block joined with nothing, a hard break with a space, every
 * default-ignorable code point removed), and each flow element by name where it stands. An element inside a
 * sentence stays inside its paragraph. It throws on a node outside `PAGE_NODES` or in a place its kind never takes,
 * naming `path` and the line.
 */
export function pageOf(tree: MdastNode, path: string): PageBlock[] {
  const unknown = (node: MdastNode) =>
    new Error(`${path}:${node.position?.start.line ?? 0}: a ${node.type} node is not one the page text reader knows`);
  const inline = (node: MdastNode): string => {
    if (!INLINE_NODES.includes(node.type)) throw unknown(node);
    if (node.type === 'break') return ' ';
    return node.value ?? (node.children ?? []).map(inline).join('');
  };
  const page: PageBlock[] = [];
  const visit = (node: MdastNode): void => {
    const text = () => (node.type === 'code' ? (node.value ?? '') : (node.children ?? []).map(inline).join(''));
    if (node.type === 'heading') page.push({ kind: 'heading', depth: node.depth ?? 0, text: text() });
    else if (node.type === 'paragraph' || node.type === 'code') page.push({ kind: node.type, text: text() });
    else if (CONTAINER_NODES.includes(node.type)) {
      if (node.type === 'mdxJsxFlowElement') page.push({ kind: 'element', name: node.name ?? '' });
      for (const child of node.children ?? []) visit(child);
    } else throw unknown(node);
  };
  visit(tree);
  return page.map((block) =>
    block.kind === 'element' ? block : { ...block, text: block.text.replace(IGNORABLE, '') },
  );
}

/** The text of every block of the page but its elements (`pageOf`), one string per block in tree order. */
export function pageBlocks(tree: MdastNode, path: string): string[] {
  return pageOf(tree, path).flatMap((block) => (block.kind === 'element' ? [] : [block.text]));
}
