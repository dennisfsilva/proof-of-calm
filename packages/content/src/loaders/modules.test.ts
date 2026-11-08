import { describe, expect, it } from 'vitest';
import { parseModule, plainText } from './modules.ts';

const PATH = 'packages/content/learn/start-here.mdx';
const FIELDS = {
  slug: 'start-here',
  title: 'Start here',
  idea: 'A plan is a sum, a day, and a date to stop: three facts, written down.',
  caveat: 'Crypto can lose most of its value in a year.',
  chart: 'none',
  facts: 'a.btc-drawdowns, n.risk-phrasings',
  lastReviewed: '2026-10-16',
  nextReviewDue: '2027-10-16',
  reviewedBy: 'owner',
};
const lines = (fields: Record<string, string>) => Object.entries(fields).map(([key, value]) => `${key}: ${value}`);
const source = (fields: Record<string, string> = FIELDS, body = 'One short line.\n') =>
  ['---', ...lines(fields), '---', '', body].join('\n');
const parsed = (text: string) => {
  const result = parseModule(PATH, text);
  if (!result.ok) throw new Error(result.error.map((problem) => problem.detail).join('; '));
  return result.value;
};
const failure = (text: string) => {
  const result = parseModule(PATH, text);
  if (result.ok) throw new Error('expected problems');
  return result.error.map((problem) => `${problem.code}: ${problem.detail}`);
};
const WORD = (count: number) => Array.from({ length: count }, () => 'word').join(' ');

describe('parseModule (ADR-0048)', () => {
  it('parses flat front matter', () => {
    const module = parsed(source());
    expect(module).toMatchObject({
      slug: 'start-here',
      idea: FIELDS.idea,
      chart: 'none',
      facts: ['a.btc-drawdowns', 'n.risk-phrasings'],
      lastReviewed: '2026-10-16',
      reviewedBy: 'owner',
      words: 3,
    });
    expect(module.body).toBe('\nOne short line.\n');
  });

  it('reads a file with Windows line ends the same way', () => {
    expect(parsed(source().replaceAll('\n', '\r\n'))).toEqual(parsed(source()));
  });

  it('rejects a nested value', () => {
    const nested = source().replace('facts: a.btc-drawdowns, n.risk-phrasings', 'facts:\n  - a.btc-drawdowns');
    expect(failure(nested)).toEqual(['module-front-matter: line 8: write one key: value on each line, with no indent']);
  });

  it('rejects quotes, brackets, and a repeated key', () => {
    expect(failure(source({ ...FIELDS, title: '"Start here"' }))).toEqual([
      'module-front-matter: line 3: write title as plain text, with no quotes, brackets, or braces',
    ]);
    expect(failure(source({ ...FIELDS, facts: '[a.btc-drawdowns]' }))).toEqual([
      'module-front-matter: line 7: write facts as plain text, with no quotes, brackets, or braces',
    ]);
    expect(failure(`---\nslug: noise\nslug: cycles\n---\n`)).toEqual([
      'module-front-matter: line 3: slug appears twice; delete one of the 2 lines',
    ]);
  });

  it('names a file without front matter', () => {
    const fix = 'module-front-matter: Open the file with front matter between 2 --- lines';
    expect(failure('Text only.\n')).toEqual([fix]);
    expect(failure('---\nslug: noise\n')).toEqual([fix]);
  });

  it('an empty facts line is no facts', () => {
    const text = source({ ...FIELDS, facts: '' });
    expect(text).toContain('\nfacts: \n');
    expect(parsed(text).facts).toEqual([]);
    expect(parsed(text.replace('facts: \n', 'facts:\n')).facts).toEqual([]);
  });

  it('checks each field against the schema, in plain words', () => {
    const { title: _, ...untitled } = FIELDS;
    expect(failure(source(untitled))).toEqual(['schema: title: Add a title']);
    expect(failure(source({ ...FIELDS, slug: 'halvings' }))).toEqual([
      'schema: slug: Use one of the 7 slugs in docs/EDUCATION.md §10',
    ]);
    expect(failure(source({ ...FIELDS, chart: 'pie' }))).toEqual([
      'schema: chart: Use none or one of the charts in docs/EDUCATION.md §10',
    ]);
    expect(failure(source({ ...FIELDS, idea: 'x'.repeat(121) }))).toEqual([
      'schema: idea: Keep the idea to 120 characters',
    ]);
    expect(failure(source({ ...FIELDS, caveat: 'x'.repeat(241) }))).toEqual([
      'schema: caveat: Keep the caveat to 240 characters',
    ]);
    expect(failure(source({ ...FIELDS, caveat: '' }))).toEqual(['schema: caveat: Add a caveat']);
    expect(failure(source({ ...FIELDS, lastReviewed: '16 Oct 2026' }))).toEqual([
      'schema: lastReviewed: Expected a calendar date YYYY-MM-DD',
    ]);
    expect(failure(source({ ...FIELDS, reviewedBy: 'someone' }))).toEqual([
      'schema: reviewedBy: Use owner or agent-draft',
    ]);
  });

  it('refuses a key the schema does not know, the computed ones too', () => {
    expect(failure(source({ ...FIELDS, words: '12' }))).toEqual([
      'schema: Remove words: only the keys an author types belong here (docs/EDUCATION.md §10)',
    ]);
  });

  it('counts words without JSX or markdown marks', () => {
    const body = [
      '# A title',
      '',
      '**Bold** and *soft* [a link](https://example.org/a-long-path "its title").',
      '',
      '- one item',
      '1. two items',
      '> a quote',
      '',
      '<Chart kind="line" />',
      '<Note tone="calm">',
      'inside',
      '</Note>',
      '',
      '---',
      '| a | b |',
      'Fell 30 % to €100 on 16 Oct 2026.',
    ].join('\n');
    // The prose, as a person reads it: 2 + 5 + 2 + 2 + 2 + 1 + 2 + 8, with "%" no word of its own.
    expect(parsed(source(FIELDS, body)).words).toBe(24);
    expect(plainText('**Buy** [Bitcoin](https://example.org/) \\< 5\n- Sell ETH')).toBe('Buy Bitcoin \\< 5\nSell ETH');
    // A quote mark needs no space after it, as in Markdown; the other marks do.
    expect(plainText('>Buy Bitcoin\n>- Sell ETH\n> > Hold')).toBe('Buy Bitcoin\nSell ETH\nHold');
  });

  it('counts a wrapped line and a list item as it counts them on one line', () => {
    expect(parsed(source(FIELDS, 'One two\nthree four.\n\n- five\n- six\n> seven\neight')).words).toBe(8);
  });

  it('reading time', () => {
    const minutes = (words: number, chart: string) => parsed(source({ ...FIELDS, chart }, WORD(words))).readingMinutes;
    expect(minutes(230, 'none')).toBe(1);
    expect(minutes(231, 'none')).toBe(2);
    expect(minutes(230, 'drawdowns-bar')).toBe(2);
    expect(minutes(191, 'drawdowns-bar')).toBe(1);
    expect(minutes(192, 'drawdowns-bar')).toBe(2);
    expect(minutes(400, 'none')).toBe(2);
  });
});
