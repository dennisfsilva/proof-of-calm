// The page a compiled Learn module shows (ADR-0048, Deviations): its blocks in tree order, each with its kind, and
// each flow element where it stands, so a check reads the page's text and the section an element sits in.

/** An mdast node as the Learn plugins read it. */
export type MdastNode = {
  readonly type: string;
  readonly name?: string | null;
  readonly value?: string;
  readonly depth?: number;
  readonly ordered?: boolean | null;
  readonly start?: number | null;
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

/** The node a block sits in below the page's top level, the innermost: a list item, a quote or a flow element. */
type PageContainer = 'listItem' | 'blockquote' | 'mdxJsxFlowElement';
/** Where a block stands; both fields unset on the page's top level. */
type Place = {
  readonly container?: PageContainer;
  /** The number the page shows for each ordered list item this block opens, outermost first. */
  readonly listNumbers?: readonly number[];
};

/**
 * A block's text as the parser decoded it, before the page removed its default-ignorable code points; set only when
 * it removed one.
 */
type Written = { readonly written?: string };
/** One block of the page: a heading, a paragraph or a code block with its text, or a flow element by name. */
export type PageBlock = (
  | ({ readonly kind: 'heading'; readonly depth: number; readonly text: string } & Written)
  | ({ readonly kind: 'paragraph'; readonly text: string; readonly marks?: readonly string[] } & Written)
  | ({ readonly kind: 'code'; readonly text: string } & Written)
  | { readonly kind: 'element'; readonly name: string }
) &
  Place;

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
 * sentence stays inside its paragraph. A paragraph's `marks`, set only when non-empty, name each inline node type
 * other than `text` it holds, once each in tree order, then `ignorable` when its text lost a default-ignorable code
 * point, so a check that reads plain text can refuse what the page formats apart or hides. A block that lost one
 * keeps its decoded text in `written` (R7 reads it, docs/CONTENT-STYLE.md §4). A block below the top
 * level names its innermost `container`; the first block of an ordered list item carries in `listNumbers` the number
 * the page shows for it (the list's start, 1 by default, plus the item's place), and an item with no block reads as
 * an empty paragraph, since the page still shows its marker. It throws on a node outside `PAGE_NODES` or in a place
 * its kind never takes, naming `path` and the line.
 */
export function pageOf(tree: MdastNode, path: string): PageBlock[] {
  const unknown = (node: MdastNode) =>
    new Error(`${path}:${node.position?.start.line ?? 0}: a ${node.type} node is not one the page text reader knows`);
  const inline = (node: MdastNode, marks: Set<string>): string => {
    if (!INLINE_NODES.includes(node.type)) throw unknown(node);
    if (node.type !== 'text') marks.add(node.type);
    if (node.type === 'break') return ' ';
    return node.value ?? (node.children ?? []).map((child) => inline(child, marks)).join('');
  };
  const page: PageBlock[] = [];
  // The numbers of the ordered items opened since the last block, which the next block carries.
  let numbers: number[] = [];
  const push = (block: PageBlock, container: PageContainer | undefined) => {
    page.push({ ...block, ...(container && { container }), ...(numbers.length > 0 && { listNumbers: numbers }) });
    numbers = [];
  };
  const visit = (node: MdastNode, container?: PageContainer, number?: number): void => {
    const marks = new Set<string>();
    const text = () =>
      node.type === 'code' ? (node.value ?? '') : (node.children ?? []).map((child) => inline(child, marks)).join('');
    if (node.type === 'heading') push({ kind: 'heading', depth: node.depth ?? 0, text: text() }, container);
    else if (node.type === 'code') push({ kind: 'code', text: text() }, container);
    else if (node.type === 'paragraph') {
      const shown = text();
      if (shown.search(IGNORABLE) >= 0) marks.add('ignorable');
      push({ kind: 'paragraph', text: shown, ...(marks.size > 0 && { marks: [...marks] }) }, container);
    } else if (node.type === 'listItem') {
      if (number !== undefined) numbers = [...numbers, number];
      const before = page.length;
      for (const child of node.children ?? []) visit(child, 'listItem');
      if (page.length === before) push({ kind: 'paragraph', text: '' }, 'listItem');
    } else if (CONTAINER_NODES.includes(node.type)) {
      if (node.type === 'mdxJsxFlowElement') push({ kind: 'element', name: node.name ?? '' }, container);
      const inner = node.type === 'blockquote' || node.type === 'mdxJsxFlowElement' ? node.type : container;
      const first = node.type === 'list' && node.ordered === true ? (node.start ?? 1) : undefined;
      for (const [index, child] of (node.children ?? []).entries())
        visit(child, inner, first === undefined ? first : first + index);
    } else throw unknown(node);
  };
  visit(tree);
  return page.map((block) => {
    if (block.kind === 'element') return block;
    const shown = block.text.replace(IGNORABLE, '');
    return shown === block.text ? block : { ...block, text: shown, written: block.text };
  });
}

/** The text of every block of the page but its elements (`pageOf`), one string per block in tree order. */
export function pageBlocks(tree: MdastNode, path: string): string[] {
  return pageOf(tree, path).flatMap((block) => (block.kind === 'element' ? [] : [block.text]));
}
