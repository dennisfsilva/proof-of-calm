import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { closedBodyProblems } from './closed-body.ts';

const learn = fileURLToPath(new URL('../learn/', import.meta.url));
const FRONT = ['---', 'slug: noise', 'title: Noise', '---', ''].join('\n');

describe('closedBodyProblems: pnpm validate:content refuses what the build refuses (ADR-0048)', () => {
  it('reports a module holding an element outside the set, with its line', async () => {
    const path = 'packages/content/learn/noise.mdx';
    const problems = await closedBodyProblems([{ path, source: `${FRONT}Text.\n\n<Foo />\n` }]);
    expect(problems).toEqual([
      { path, code: 'module-closed-body', detail: expect.stringMatching(/^line 7: <Foo> is not allowed/) },
    ]);
  });

  // The early check counts the words `<Chart />`; this gate counts the elements in the compiled tree.
  describe('one flow <Chart /> exactly when the front matter names a chart (docs/EDUCATION.md §10)', () => {
    const path = 'packages/content/learn/risk-honestly.mdx';
    const source = (chart: string, body: string) =>
      [
        '---',
        'slug: risk-honestly',
        'title: Risk, honestly',
        'idea: A plan can lose money.',
        'caveat: A calm plan can still lose money.',
        `chart: ${chart}`,
        'facts: ',
        'lastReviewed: 2026-10-16',
        'nextReviewDue: 2027-10-16',
        'reviewedBy: owner',
        '---',
        '',
        body,
      ].join('\n');
    const problemsOf = async (chart: string, body: string) =>
      (await closedBodyProblems([{ path, source: source(chart, body) }])).map(
        ({ code, detail }) => `${code}: ${detail}`,
      );
    const ONE =
      'module-chart-element: write <Chart /> once, on a line of its own, where the drawdowns-bar chart stands';

    it('passes <Chart /> on a line of its own on a module with a chart', async () => {
      expect(await problemsOf('drawdowns-bar', 'Text.\n\n<Chart />\n\nMore text.\n')).toEqual([]);
    });

    it('refuses <Chart /> at the end of a paragraph line, where its block would sit inside the <p>', async () => {
      expect(await problemsOf('drawdowns-bar', 'A sign. <Chart />\n')).toEqual([
        expect.stringMatching(/^module-closed-body: line 13: <Chart> stands on a line of its own/),
      ]);
    });

    it('counts an escaped <Chart /> and one in a code span as no chart', async () => {
      expect(await problemsOf('drawdowns-bar', 'A \\<Chart /> sign.\n')).toEqual([ONE]);
      expect(await problemsOf('drawdowns-bar', 'A `<Chart />` sign.\n')).toEqual([ONE]);
      expect(await problemsOf('none', 'A `<Chart />` sign.\n')).toEqual([]);
    });

    it('refuses two charts, and a chart on a module with chart: none', async () => {
      expect(await problemsOf('drawdowns-bar', '<Chart />\n\nText.\n\n<Chart />\n')).toEqual([ONE]);
      expect(await problemsOf('none', 'Text.\n\n<Chart />\n')).toEqual([
        'module-chart-element: remove <Chart />: the front matter says chart: none',
      ]);
    });
  });

  it('reports one problem per refused module', async () => {
    const modules = [
      { path: 'packages/content/learn/a.mdx', source: `${FRONT}Text with {1} in it.\n` },
      { path: 'packages/content/learn/b.mdx', source: `${FRONT}A line. <PastPerformance />\n` },
      { path: 'packages/content/learn/c.mdx', source: `${FRONT}A [link](/plan).\n` },
    ];
    const problems = await closedBodyProblems(modules);
    expect(problems.map(({ path, code }) => `${path}: ${code}`)).toEqual([
      'packages/content/learn/a.mdx: module-closed-body',
      'packages/content/learn/c.mdx: module-closed-body',
    ]);
  });

  it("passes main's modules", async () => {
    const names = readdirSync(learn).filter((name) => name.endsWith('.mdx'));
    expect(names.length).toBeGreaterThan(0);
    const modules = names.map((name) => ({
      path: `packages/content/learn/${name}`,
      source: readFileSync(join(learn, name), 'utf8'),
    }));
    expect(await closedBodyProblems(modules)).toEqual([]);
  });
});
