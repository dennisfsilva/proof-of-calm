import { existsSync, readdirSync, readFileSync } from 'node:fs';
import mdx from '@mdx-js/rollup';
import { describe, expect, it } from 'vitest';
import { blankFrontMatter, checkModuleBody } from './learn-plugin.ts';
import { type MdastNode, PAGE_NODES, pageBlocks, pageOf } from './page-blocks.ts';

type Node = { readonly type: string; readonly children?: readonly Node[] };

const path = 'packages/content/learn/noise.mdx';
const pageOfBody = async (body: string) => (await checkModuleBody(body, path)).page;
const content = new URL('../../content/', import.meta.url);
const mdxIn = (folder: URL) => readdirSync(folder).filter((name) => name.endsWith('.mdx'));

// The page as a check reads it (ADR-0048 Deviations): each block's kind, and each flow element where it stands.
describe('pageOf', () => {
  it('reads headings, paragraphs and flow elements in tree order', async () => {
    expect(await pageOfBody('## One\n\nText.\n\n<Chart />\n\n## Two\n\nMore.')).toEqual([
      { kind: 'heading', depth: 2, text: 'One' },
      { kind: 'paragraph', text: 'Text.' },
      { kind: 'element', name: 'Chart' },
      { kind: 'heading', depth: 2, text: 'Two' },
      { kind: 'paragraph', text: 'More.' },
    ]);
  });

  it('keeps an element inside a sentence inside its paragraph, and reads code as a code block', async () => {
    expect(await pageOfBody('# Noise\n\nA line. <PastPerformance /> More.\n\n```\nbloco\n```\n')).toEqual([
      { kind: 'heading', depth: 1, text: 'Noise' },
      { kind: 'paragraph', text: 'A line.  More.', marks: ['mdxJsxTextElement'] },
      { kind: 'code', text: 'bloco' },
    ]);
  });

  it('reads a flow element inside a list item where it stands, and none for an escaped one', async () => {
    expect(await pageOfBody('- one\n- <Chart />\n\nA \\<Chart /> sign.\n')).toEqual([
      { kind: 'paragraph', text: 'one', container: 'listItem' },
      { kind: 'element', name: 'Chart', container: 'listItem' },
      { kind: 'paragraph', text: 'A <Chart /> sign.' },
    ]);
  });

  // Review of #361 round 1: `1975. Text.` shows 1975 as the item's number, which no block's text holds.
  it('records the container a block sits in, and the number the page shows for each ordered item', async () => {
    const body = '3. One\n4. Two\n\n   More.\n5. <Chart />\n\n- Dot\n\n> Quote\n\n1. 2. Inner\n\nTop.\n';
    expect(await pageOfBody(body)).toEqual([
      { kind: 'paragraph', text: 'One', container: 'listItem', listNumbers: [3] },
      { kind: 'paragraph', text: 'Two', container: 'listItem', listNumbers: [4] },
      { kind: 'paragraph', text: 'More.', container: 'listItem' },
      { kind: 'element', name: 'Chart', container: 'listItem', listNumbers: [5] },
      { kind: 'paragraph', text: 'Dot', container: 'listItem' },
      { kind: 'paragraph', text: 'Quote', container: 'blockquote' },
      { kind: 'paragraph', text: 'Inner', container: 'listItem', listNumbers: [1, 2] },
      { kind: 'paragraph', text: 'Top.' },
    ]);
  });

  it('reads an empty item as an empty paragraph, so its number still stands on the page', async () => {
    expect(await pageOfBody('1975.\n\n- \n')).toEqual([
      { kind: 'paragraph', text: '', container: 'listItem', listNumbers: [1975] },
      { kind: 'paragraph', text: '', container: 'listItem' },
    ]);
  });

  it('records an element as the container of what it holds', () => {
    const inner = { type: 'paragraph', children: [{ type: 'text', value: 'In.' }] };
    const box = { type: 'mdxJsxFlowElement', name: 'Box', children: [inner] };
    expect(pageOf({ type: 'root', children: [box] }, path)).toEqual([
      { kind: 'element', name: 'Box' },
      { kind: 'paragraph', text: 'In.', container: 'mdxJsxFlowElement' },
    ]);
  });

  it('sets no container and no number on a top-level block', async () => {
    const page = await pageOfBody('## One\n\nText.\n\n<Chart />\n');
    expect(page.map((block) => ['container', 'listNumbers'].some((key) => key in block))).toEqual([
      false,
      false,
      false,
    ]);
  });

  // A check that reads plain text refuses a paragraph whose text the page formats apart or hides (ADR-0048).
  it.each([
    ['emphasis', 'Solana *97* %.', 'Solana 97 %.', ['emphasis']],
    ['strong', 'Ether **94** %.', 'Ether 94 %.', ['strong']],
    ['a code span', 'Solana `97` %.', 'Solana 97 %.', ['inlineCode']],
    ['a hard break', 'Solana 97\\\n%.', 'Solana 97 %.', ['break']],
    ['a text element', 'Solana <PastPerformance /> 97 %.', 'Solana  97 %.', ['mdxJsxTextElement']],
    ['a hidden character', 'Solana 9­7​ %.', 'Solana 97 %.', ['ignorable']],
    ['each mark once, in tree order', '*a **b*** `c` *d* e​.', 'a b c d e.', ['emphasis', 'strong', 'inlineCode']],
  ])('marks a paragraph holding %s', async (_, body, text, marks) => {
    const all = body.includes('e​') ? [...marks, 'ignorable'] : marks;
    const written = /\p{Default_Ignorable_Code_Point}/u.test(body) ? { written: body.replace(/[*`]/gu, '') } : {};
    expect(await pageOfBody(body)).toEqual([{ kind: 'paragraph', text, marks: all, ...written }]);
  });

  // R7 reads each block as the parser decoded it (docs/CONTENT-STYLE.md §4), so the page keeps that text too.
  it('keeps the decoded text of a paragraph, a heading and a code block that lost a hidden character', async () => {
    const zwsp = String.fromCodePoint(0x200b);
    const shy = String.fromCodePoint(0xad);
    const body = `## 6${zwsp}inputs\n\nIt mixes 6${shy} inputs.\n\n\`\`\`\n2${zwsp}indexes\n\`\`\`\n\nPlain.\n`;
    const page = await pageOfBody(body);
    expect(page).toEqual([
      { kind: 'heading', depth: 2, text: '6inputs', written: `6${zwsp}inputs` },
      { kind: 'paragraph', text: 'It mixes 6 inputs.', marks: ['ignorable'], written: `It mixes 6${shy} inputs.` },
      { kind: 'code', text: '2indexes', written: `2${zwsp}indexes` },
      { kind: 'paragraph', text: 'Plain.' },
    ]);
    expect(page.map((block) => 'written' in block)).toEqual([true, true, true, false]);
  });

  it('marks no plain paragraph, heading or code block', async () => {
    const page = await pageOfBody('## Falls *4*\n\nSolana 97 %.\n\n```\n`97` %\n```\n');
    expect(page).toEqual([
      { kind: 'heading', depth: 2, text: 'Falls 4' },
      { kind: 'paragraph', text: 'Solana 97 %.' },
      { kind: 'code', text: '`97` %' },
    ]);
    expect(page.map((block) => 'marks' in block || 'written' in block)).toEqual([false, false, false]);
  });

  it('is empty when the body does not compile', async () => {
    expect(await pageOfBody('Text {1}.\n\n<Chart />\n')).toEqual([]);
  });

  it('throws on a node type outside the set, naming the path and the line', () => {
    const table = { type: 'table', position: { start: { line: 4 } }, children: [] };
    expect(() => pageOf({ type: 'root', children: [table] }, 'learn/noise.mdx')).toThrow(
      /^learn\/noise\.mdx:4: a table node is not one the page text reader knows/,
    );
  });
});

// The reader knows every node a compiling body holds, and fails closed on any other (a remark plugin added later).
describe('the block reader reads a closed set of nodes', () => {
  const learn = new URL('learn/', content);

  it("holds every node type of the English modules' compiled trees", async () => {
    const names = mdxIn(learn);
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

// The block reader as it stood before containers and list numbers (2026-11-18): the oracle that `blocks` keeps its
// strings on every live module.
const HIDDEN = /\p{Default_Ignorable_Code_Point}/gu;
const inlineText = (node: MdastNode): string =>
  node.type === 'break' ? ' ' : (node.value ?? (node.children ?? []).map(inlineText).join(''));
const formerBlocks = (node: MdastNode): string[] => {
  if (node.type === 'code') return [(node.value ?? '').replace(HIDDEN, '')];
  if (node.type === 'paragraph' || node.type === 'heading')
    return [(node.children ?? []).map(inlineText).join('').replace(HIDDEN, '')];
  return (node.children ?? []).flatMap(formerBlocks);
};

// `blocks` keeps its values (the translated body's checks read them): it is the page's text without its elements.
describe('blocks and page on the live modules', () => {
  const i18n = new URL('i18n/', content);
  const languages = readdirSync(i18n).filter((name) => existsSync(new URL(`${name}/learn/`, i18n)));
  const folders = [new URL('learn/', content), ...languages.map((name) => new URL(`${name}/learn/`, i18n))];
  const files = folders.flatMap((folder) => mdxIn(folder).map((name) => new URL(name, folder)));

  it('covers the 6 English modules and every pt-PT translation', () => {
    expect(mdxIn(folders[0] as URL)).toHaveLength(6);
    expect(mdxIn(folders[1] as URL).length).toBeGreaterThan(0);
  });

  it.each(files.map((file) => [file.pathname.split('/content/')[1] ?? '', file] as const))(
    '%s: blocks are the texts of page without its elements, and its elements are flow',
    async (at, file) => {
      const check = await checkModuleBody(readFileSync(file, 'utf8'), `packages/content/${at}`);
      expect(check.problem).toBeNull();
      expect(check.blocks.length).toBeGreaterThan(0);
      expect(check.blocks).toEqual(check.page.flatMap((block) => (block.kind === 'element' ? [] : [block.text])));
      expect(check.page.flatMap((block) => (block.kind === 'element' ? [block.name] : []))).toEqual(check.flow);
    },
  );

  it.each(files.map((file) => [file.pathname.split('/content/')[1] ?? '', file] as const))(
    '%s: pageBlocks gives the strings the reader gave before it recorded containers and list numbers',
    async (at, file) => {
      const trees: MdastNode[] = [];
      const keep = () => (tree: MdastNode) => void trees.push(tree);
      const source = blankFrontMatter(readFileSync(file, 'utf8'));
      expect(await mdx({ remarkPlugins: [keep] }).transform(source, `packages/content/${at}`)).toBeDefined();
      const [tree] = trees;
      expect(tree).toBeDefined();
      const former = formerBlocks(tree as MdastNode);
      expect(former.length).toBeGreaterThan(0);
      expect(pageBlocks(tree as MdastNode, at)).toEqual(former);
    },
  );
});
