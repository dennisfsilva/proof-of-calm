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

  it('passes <Chart /> on a module with a chart', async () => {
    const front = ['---', 'slug: risk-honestly', 'chart: drawdowns-bar', '---', ''].join('\n');
    const path = 'packages/content/learn/risk-honestly.mdx';
    expect(await closedBodyProblems([{ path, source: `${front}Text.\n\n<Chart />\n` }])).toEqual([]);
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
